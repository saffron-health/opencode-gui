import { batch } from "solid-js";
import { reconcile, type SetStoreFunction } from "solid-js/store";
import type {
  Message,
  MessagePart,
  Session,
  Agent,
  ContextInfo,
  FileChangesInfo,
} from "../types";
import type { SyncState } from "./types";
import { extractTextFromParts } from "./utils";

export interface BootstrapContext {
  client: {
    app: { agents: () => Promise<{ data?: unknown[] }> };
    session: {
      list: (opts?: { query?: { directory?: string } }) => Promise<{ data?: unknown[] }>;
      messages: (opts: { path: { id: string } }) => Promise<{ data?: unknown[] }>;
      get: (opts: { path: { id: string } }) => Promise<{ data?: unknown }>;
    };
  };
  sessionId: string | null;
  workspaceRoot: string | undefined;
}

export interface BootstrapResult {
  agents: Agent[];
  sessions: Session[];
  messageList: Message[];
  partMap: { [messageID: string]: MessagePart[] };
  contextInfo: ContextInfo | null;
  fileChanges: FileChangesInfo | null;
}

export async function fetchBootstrapData(ctx: BootstrapContext): Promise<BootstrapResult> {
  const { client, sessionId, workspaceRoot } = ctx;

  const [agentsRes, sessionsRes] = await Promise.all([
    client.app.agents(),
    client.session.list(workspaceRoot ? { query: { directory: workspaceRoot } } : undefined),
  ]);

  const agents = ((agentsRes?.data ?? []) as Agent[]).filter(
    (a) => a.mode === "primary" || a.mode === "all"
  );
  const sessions = ((sessionsRes?.data ?? []) as Session[])
    .filter((s) => !!s?.id)
    .sort((a, b) => a.id.localeCompare(b.id));

  let messageList: Message[] = [];
  let contextInfo: ContextInfo | null = null;
  let fileChanges: FileChangesInfo | null = null;

  if (sessionId) {
    try {
      const [messagesRes, sessionRes] = await Promise.all([
        client.session.messages({ path: { id: sessionId } }),
        client.session.get({ path: { id: sessionId } }),
      ]);

      const rawMessages = (messagesRes?.data ?? []) as Array<{ info?: unknown; parts?: MessagePart[] }>;
      messageList = rawMessages
        .map((raw) => {
          const m = (raw.info ?? raw) as Record<string, unknown>;
          const parts = (raw.parts ?? m.parts ?? []) as MessagePart[];
          const text = (m.text as string) ?? extractTextFromParts(parts);
          const role = (m.role as string) ?? "assistant";
          
          let normalizedParts = parts;
          if (role === "user") {
            normalizedParts = parts.filter(
              (p) =>
                p.type !== "text" ||
                (!(p as { synthetic?: boolean }).synthetic && !(p as { ignored?: boolean }).ignored)
            );
          }
          
          return {
            id: m.id as string,
            type: role === "user" ? "user" : "assistant",
            text,
            parts: normalizedParts,
          } as Message;
        })
        .filter((m) => !!m.id)
        .sort((a, b) => a.id.localeCompare(b.id));

      const session = sessionRes?.data as Session | undefined;
      if (session?.summary?.diffs) {
        const diffs = session.summary.diffs;
        fileChanges = {
          fileCount: diffs.length,
          additions: diffs.reduce((sum, d) => sum + (d.additions || 0), 0),
          deletions: diffs.reduce((sum, d) => sum + (d.deletions || 0), 0),
        };
      }

      const lastAssistant = [...rawMessages].reverse().find((raw) => {
        const m = (raw.info ?? raw) as Record<string, unknown>;
        return m.role === "assistant";
      });
      if (lastAssistant) {
        const m = (lastAssistant.info ?? lastAssistant) as Record<string, unknown>;
        if (m.tokens) {
          const tokens = m.tokens as { input?: number; output?: number; cache?: { read?: number } };
          const usedTokens = (tokens.input || 0) + (tokens.output || 0) + (tokens.cache?.read || 0);
          if (usedTokens > 0) {
            const limit = 200000;
            contextInfo = {
              usedTokens,
              limitTokens: limit,
              percentage: Math.min(100, (usedTokens / limit) * 100),
            };
          }
        }
      }
    } catch (err) {
      console.error("[Sync] Failed to load session messages:", err);
    }
  }

  const partMap: { [messageID: string]: MessagePart[] } = {};
  for (const msg of messageList) {
    if (msg.parts?.length) {
      // Sort parts by ID for binary search
      partMap[msg.id] = msg.parts.slice().sort((a, b) => a.id.localeCompare(b.id));
    }
  }

  return { agents, sessions, messageList, partMap, contextInfo, fileChanges };
}

export function commitBootstrapData(
  data: BootstrapResult,
  sessionId: string | null,
  setStore: SetStoreFunction<SyncState>
): void {
  batch(() => {
    setStore("agents", data.agents);
    setStore("sessions", data.sessions);
    if (sessionId) {
      setStore("message", sessionId, data.messageList);
    }
    setStore("part", reconcile(data.partMap));
    setStore("permission", {});
    setStore("contextInfo", data.contextInfo);
    setStore("fileChanges", data.fileChanges);
    setStore("status", { status: "connected" });
  });
}
