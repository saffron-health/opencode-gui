import { batch } from "solid-js";
import { reconcile, type SetStoreFunction } from "solid-js/store";
import type {
  Agent as SDKAgent,
  Session as SDKSession,
  Message as SDKMessage,
  Part as SDKPart,
  AssistantMessage,
  PermissionRequest as SDKPermission,
} from "@opencode-ai/sdk/v2/client";
import type {
  Message,
  MessagePart,
  Session,
  Agent,
  Permission,
  ContextInfo,
  FileChangesInfo,
} from "../types";
import type { SyncState } from "./types";
import { extractTextFromParts } from "./utils";

/** API response for session.messages endpoint */
interface MessageWithParts {
  info: SDKMessage;
  parts: SDKPart[];
}

export interface BootstrapContext {
  client: {
    app: { agents: () => Promise<{ data?: SDKAgent[] }> };
    session: {
      list: (opts?: { directory?: string }) => Promise<{ data?: SDKSession[] }>;
      messages: (opts: { sessionID: string }) => Promise<{ data?: MessageWithParts[] }>;
      get: (opts: { sessionID: string }) => Promise<{ data?: SDKSession }>;
    };
    permission: {
      list: (opts?: { directory?: string }) => Promise<{ data?: any[] }>;
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
  permissionMap: { [sessionID: string]: Permission[] };
  contextInfo: ContextInfo | null;
  fileChanges: FileChangesInfo | null;
}

/** Convert SDK Agent to internal Agent type */
function toAgent(sdkAgent: SDKAgent): Agent {
  return {
    name: sdkAgent.name,
    description: sdkAgent.description,
    mode: sdkAgent.mode,
    builtIn: sdkAgent.builtIn,
    options: sdkAgent.color ? { color: sdkAgent.color } : undefined,
  };
}

/** Convert SDK Session to internal Session type */
function toSession(sdkSession: SDKSession): Session {
  return {
    id: sdkSession.id,
    title: sdkSession.title,
    projectID: sdkSession.projectID,
    directory: sdkSession.directory,
    parentID: sdkSession.parentID,
    time: sdkSession.time,
    summary: sdkSession.summary
      ? { 
          additions: sdkSession.summary.additions,
          deletions: sdkSession.summary.deletions,
          files: sdkSession.summary.files,
          diffs: sdkSession.summary.diffs 
        }
      : undefined,
  };
}

/** Convert SDK Part to internal MessagePart type */
function toPart(sdkPart: SDKPart): MessagePart {
  return sdkPart as MessagePart;
}

/** Convert SDK Permission to internal Permission type */
function toPermission(sdkPerm: SDKPermission): Permission {
  return {
    id: sdkPerm.id,
    permission: sdkPerm.permission,
    patterns: sdkPerm.patterns,
    sessionID: sdkPerm.sessionID,
    metadata: sdkPerm.metadata ?? {},
    always: sdkPerm.always,
    tool: sdkPerm.tool,
  };
}

// System agents that should be hidden from the UI
const HIDDEN_AGENTS = new Set(["compaction", "title", "summary"]);

export async function fetchBootstrapData(ctx: BootstrapContext): Promise<BootstrapResult> {
  const { client, sessionId, workspaceRoot } = ctx;

  const [agentsRes, sessionsRes] = await Promise.all([
    client.app.agents(),
    client.session.list(workspaceRoot ? { directory: workspaceRoot } : undefined),
  ]);

  const agents = (agentsRes?.data ?? [])
    .filter((a): a is SDKAgent => 
      (a.mode === "primary" || a.mode === "all") && !HIDDEN_AGENTS.has(a.name)
    )
    .map(toAgent);

  const sessions = (sessionsRes?.data ?? [])
    .filter((s): s is SDKSession => !!s?.id && !s.parentID)
    .map(toSession)
    .sort((a, b) => a.id.localeCompare(b.id));

  let messageList: Message[] = [];
  let contextInfo: ContextInfo | null = null;
  let fileChanges: FileChangesInfo | null = null;
  const partMap: { [messageID: string]: MessagePart[] } = {};
  const permissionMap: { [sessionID: string]: Permission[] } = {};

  // Fetch pending permissions
  try {
    const permissionsRes = await client.permission.list(
      workspaceRoot ? { directory: workspaceRoot } : undefined
    );
    const permissions = permissionsRes?.data ?? [];
    
    // Group permissions by sessionID
    for (const sdkPerm of permissions) {
      const perm = toPermission(sdkPerm as SDKPermission);
      if (!permissionMap[perm.sessionID]) {
        permissionMap[perm.sessionID] = [];
      }
      permissionMap[perm.sessionID].push(perm);
    }
  } catch (err) {
    console.error("[Sync] Failed to load permissions during bootstrap:", err);
  }

  if (sessionId) {
    try {
      const [messagesRes, sessionRes] = await Promise.all([
        client.session.messages({ sessionID: sessionId }),
        client.session.get({ sessionID: sessionId }),
      ]);

      const rawMessages = messagesRes?.data ?? [];

      messageList = rawMessages
        .map((raw) => {
          const msgInfo = raw.info;
          const parts = raw.parts;
          const text = extractTextFromParts(parts.map(toPart));
          const messageId = msgInfo.id;
          const role = msgInfo.role;

          // Filter parts for user messages (exclude synthetic/ignored text parts)
          let normalizedParts = parts;
          if (role === "user") {
            normalizedParts = parts.filter((p) => {
              if (p.type !== "text") return true;
              return !p.synthetic && !p.ignored;
            });
          }

          // Store parts in partMap (single source of truth)
          if (normalizedParts.length > 0) {
            partMap[messageId] = normalizedParts
              .map(toPart)
              .sort((a, b) => a.id.localeCompare(b.id));
          }

          return {
            id: messageId,
            type: role,
            text,
          } as Message;
        })
        .filter((m) => !!m.id)
        .sort((a, b) => a.id.localeCompare(b.id));

      const session = sessionRes?.data;
      
      // Extract file changes from session summary
      if (session?.summary) {
        if (session.summary.diffs && session.summary.diffs.length > 0) {
          // Use detailed diffs if available
          const diffs = session.summary.diffs;
          fileChanges = {
            fileCount: diffs.length,
            additions: diffs.reduce((sum, d) => sum + (d.additions || 0), 0),
            deletions: diffs.reduce((sum, d) => sum + (d.deletions || 0), 0),
          };
        } else if (session.summary.files > 0) {
          // Fallback to summary-level aggregates
          fileChanges = {
            fileCount: session.summary.files,
            additions: session.summary.additions,
            deletions: session.summary.deletions,
          };
        }
      }

      // Extract context info from the last assistant message
      const lastAssistant = [...rawMessages]
        .reverse()
        .find((raw) => raw.info.role === "assistant");

      if (lastAssistant && lastAssistant.info.role === "assistant") {
        const assistantMsg = lastAssistant.info as AssistantMessage;
        const tokens = assistantMsg.tokens;
        const usedTokens =
          tokens.input + 
          tokens.output + 
          tokens.reasoning +
          tokens.cache.read + 
          tokens.cache.write;
        if (usedTokens > 0) {
          const limit = 200000;
          contextInfo = {
            usedTokens,
            limitTokens: limit,
            percentage: Math.min(100, (usedTokens / limit) * 100),
          };
        }
      }
    } catch (err) {
      console.error("[Sync] Failed to load session messages:", err);
    }
  }

  return { agents, sessions, messageList, partMap, permissionMap, contextInfo, fileChanges };
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
    setStore("permission", reconcile(data.permissionMap));
    setStore("contextInfo", data.contextInfo);
    setStore("fileChanges", data.fileChanges);
    setStore("status", { status: "connected" });
  });
}
