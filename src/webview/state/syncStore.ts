/**
 * Event-sourced state store for reliable webview state management.
 *
 * This store maintains normalized state keyed by sessionID/messageID/partID,
 * applies events idempotently, and provides bootstrap/resync functionality
 * for recovery after reconnects or server restarts.
 */

import { createSignal, batch } from "solid-js";
import type {
  Message,
  MessagePart,
  IncomingMessage,
  Session,
  Agent,
  Permission,
  ContextInfo,
  FileChangesInfo,
} from "../types";
import type { OpencodeClient, Event } from "@opencode-ai/sdk/client";

export type SyncStatus =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected" }
  | { status: "reconnecting"; attempt: number }
  | { status: "bootstrapping" }
  | { status: "error"; message: string };

export interface SyncStoreState {
  sessions: Map<string, Session>;
  messages: Map<string, Message>;
  parts: Map<string, MessagePart>;
  permissions: Map<string, Permission>;
  agents: Agent[];
  contextInfo: ContextInfo | null;
  fileChanges: FileChangesInfo | null;
  thinkingSessions: Set<string>;
  sessionErrors: Map<string, string>;
}

export interface SyncStore {
  state: () => SyncStoreState;
  status: () => SyncStatus;

  getSession: (id: string) => Session | undefined;
  getMessage: (id: string) => Message | undefined;
  getPart: (id: string) => MessagePart | undefined;
  getPermission: (id: string) => Permission | undefined;

  getMessagesForSession: (sessionId: string) => Message[];
  getPartsForMessage: (messageId: string) => MessagePart[];

  applyEvent: (event: Event) => void;

  bootstrap: (client: OpencodeClient, sessionId: string | null, workspaceRoot?: string) => Promise<void>;

  setStatus: (status: SyncStatus) => void;
  setContextInfo: (info: ContextInfo | null) => void;
  setFileChanges: (info: FileChangesInfo | null) => void;
  setSessionError: (sessionId: string, error: string | null) => void;
  setThinking: (sessionId: string, thinking: boolean) => void;
  clearSession: (sessionId: string) => void;
}

function createEmptyState(): SyncStoreState {
  return {
    sessions: new Map(),
    messages: new Map(),
    parts: new Map(),
    permissions: new Map(),
    agents: [],
    contextInfo: null,
    fileChanges: null,
    thinkingSessions: new Set(),
    sessionErrors: new Map(),
  };
}

export function createSyncStore(): SyncStore {
  const [state, setState] = createSignal<SyncStoreState>(createEmptyState());
  const [status, setStatus] = createSignal<SyncStatus>({ status: "disconnected" });

  function updateState(fn: (prev: SyncStoreState) => Partial<SyncStoreState>): void {
    setState((prev) => {
      const updates = fn(prev);
      return { ...prev, ...updates };
    });
  }

  function getSession(id: string): Session | undefined {
    return state().sessions.get(id);
  }

  function getMessage(id: string): Message | undefined {
    return state().messages.get(id);
  }

  function getPart(id: string): MessagePart | undefined {
    return state().parts.get(id);
  }

  function getPermission(id: string): Permission | undefined {
    return state().permissions.get(id);
  }

  function getMessagesForSession(sessionId: string): Message[] {
    const msgs: Message[] = [];
    for (const msg of state().messages.values()) {
      if ((msg as Message & { sessionID?: string }).sessionID === sessionId) {
        msgs.push(msg);
      }
    }
    return msgs;
  }

  function getPartsForMessage(messageId: string): MessagePart[] {
    const parts: MessagePart[] = [];
    for (const part of state().parts.values()) {
      if (part.messageID === messageId) {
        parts.push(part);
      }
    }
    return parts;
  }

  function applyMessageUpdate(info: IncomingMessage & { sessionID?: string }): void {
    updateState((prev) => {
      const messages = new Map(prev.messages);
      const existing = messages.get(info.id);

      const msg: Message & { sessionID?: string } = {
        id: info.id,
        type: info.role === "user" ? "user" : "assistant",
        text: info.text ?? existing?.text,
        parts: info.parts ?? existing?.parts ?? [],
        sessionID: info.sessionID ?? (existing as Message & { sessionID?: string })?.sessionID,
      };

      messages.set(info.id, msg);

      return { messages };
    });
  }

  function applyPartUpdate(part: MessagePart & { messageID: string; sessionID?: string }): void {
    updateState((prev) => {
      const parts = new Map(prev.parts);
      parts.set(part.id, part);

      const messages = new Map(prev.messages);
      const msg = messages.get(part.messageID);
      if (msg) {
        const existingParts = msg.parts ?? [];
        const partIndex = existingParts.findIndex((p) => p.id === part.id);
        if (partIndex === -1) {
          messages.set(part.messageID, {
            ...msg,
            parts: [...existingParts, part],
          });
        } else {
          const newParts = [...existingParts];
          newParts[partIndex] = part;
          messages.set(part.messageID, { ...msg, parts: newParts });
        }
      } else {
        messages.set(part.messageID, {
          id: part.messageID,
          type: "assistant",
          parts: [part],
          sessionID: part.sessionID,
        } as Message & { sessionID?: string });
      }

      return { parts, messages };
    });
  }

  function applySessionUpdate(session: Session): void {
    updateState((prev) => {
      const sessions = new Map(prev.sessions);
      sessions.set(session.id, session);

      let fileChanges = prev.fileChanges;
      if (session.summary?.diffs) {
        const diffs = session.summary.diffs;
        fileChanges = {
          fileCount: diffs.length,
          additions: diffs.reduce((sum, d) => sum + (d.additions || 0), 0),
          deletions: diffs.reduce((sum, d) => sum + (d.deletions || 0), 0),
        };
      }

      return { sessions, fileChanges };
    });
  }

  function applyPermissionUpdate(permission: Permission): void {
    updateState((prev) => {
      const permissions = new Map(prev.permissions);
      const key = permission.tool?.callID || permission.id;
      permissions.set(key, permission);
      return { permissions };
    });
  }

  function removePermission(permissionId: string): void {
    updateState((prev) => {
      const permissions = new Map(prev.permissions);
      for (const [key, perm] of permissions) {
        if (perm.id === permissionId) {
          permissions.delete(key);
          break;
        }
      }
      return { permissions };
    });
  }

  function applyEvent(event: Event): void {
    const eventType = event.type as string;

    switch (eventType) {
      case "message.updated": {
        const props = (event as unknown as { properties: { info: IncomingMessage & { sessionID?: string; tokens?: unknown; modelID?: string; providerID?: string } } }).properties;
        applyMessageUpdate(props.info);

        const sessionId = props.info.sessionID;
        if (sessionId) {
          updateState((prev) => {
            const sessionErrors = new Map(prev.sessionErrors);
            sessionErrors.delete(sessionId);
            return { sessionErrors };
          });
        }
        break;
      }

      case "message.removed": {
        const props = (event as unknown as { properties: { messageID: string } }).properties;
        updateState((prev) => {
          const messages = new Map(prev.messages);
          messages.delete(props.messageID);

          const parts = new Map(prev.parts);
          for (const [id, part] of parts) {
            if (part.messageID === props.messageID) {
              parts.delete(id);
            }
          }

          return { messages, parts };
        });
        break;
      }

      case "message.part.updated": {
        const props = (event as unknown as { properties: { part: MessagePart & { messageID: string; sessionID?: string } } }).properties;
        applyPartUpdate(props.part);

        const sessionId = props.part.sessionID;
        if (sessionId) {
          updateState((prev) => {
            const sessionErrors = new Map(prev.sessionErrors);
            sessionErrors.delete(sessionId);
            return { sessionErrors };
          });
        }
        break;
      }

      case "message.part.removed": {
        const props = (event as unknown as { properties: { partID: string; messageID: string } }).properties;
        updateState((prev) => {
          const parts = new Map(prev.parts);
          parts.delete(props.partID);

          const messages = new Map(prev.messages);
          const msg = messages.get(props.messageID);
          if (msg?.parts) {
            messages.set(props.messageID, {
              ...msg,
              parts: msg.parts.filter((p) => p.id !== props.partID),
            });
          }

          return { parts, messages };
        });
        break;
      }

      case "session.updated": {
        const props = (event as unknown as { properties: { info: Session } }).properties;
        applySessionUpdate(props.info);
        break;
      }

      case "session.created": {
        const props = (event as unknown as { properties: { info: Session } }).properties;
        applySessionUpdate(props.info);
        break;
      }

      case "session.deleted": {
        const props = (event as unknown as { properties: { sessionID: string } }).properties;
        updateState((prev) => {
          const sessions = new Map(prev.sessions);
          sessions.delete(props.sessionID);

          const messages = new Map(prev.messages);
          const parts = new Map(prev.parts);
          for (const [id, msg] of messages) {
            if ((msg as Message & { sessionID?: string }).sessionID === props.sessionID) {
              messages.delete(id);
              for (const part of msg.parts ?? []) {
                parts.delete(part.id);
              }
            }
          }

          return { sessions, messages, parts };
        });
        break;
      }

      case "session.idle": {
        const props = (event as unknown as { properties: { sessionID?: string } }).properties;
        const sessionId = props.sessionID;
        if (sessionId) {
          updateState((prev) => {
            const thinkingSessions = new Set(prev.thinkingSessions);
            thinkingSessions.delete(sessionId);
            return { thinkingSessions };
          });
        }
        break;
      }

      case "session.error": {
        const props = (event as unknown as { properties: { sessionID?: string; error?: { data?: { message?: string } } } }).properties;
        const sessionId = props.sessionID;
        const errorMessage = props.error?.data?.message || "Unknown error";
        if (sessionId) {
          updateState((prev) => {
            const thinkingSessions = new Set(prev.thinkingSessions);
            thinkingSessions.delete(sessionId);

            const sessionErrors = new Map(prev.sessionErrors);
            sessionErrors.set(sessionId, errorMessage);

            return { thinkingSessions, sessionErrors };
          });
        }
        break;
      }

      case "permission.asked":
      case "permission.updated": {
        const permission = (event as unknown as { properties: Permission }).properties;
        applyPermissionUpdate(permission);
        break;
      }

      case "permission.replied": {
        const props = (event as unknown as { properties: { permissionID: string } }).properties;
        removePermission(props.permissionID);
        break;
      }

      case "server.instance.disposed": {
        break;
      }
    }
  }

  async function bootstrap(
    client: OpencodeClient,
    sessionId: string | null,
    workspaceRoot?: string
  ): Promise<void> {
    setStatus({ status: "bootstrapping" });

    try {
      const [agentsRes, sessionsRes, configRes] = await Promise.all([
        client.app.agents(),
        client.session.list(workspaceRoot ? { query: { directory: workspaceRoot } } : undefined),
        client.config.get(),
      ]);

      const agents = ((agentsRes?.data ?? []) as Agent[]).filter(
        (a) => a.mode === "primary" || a.mode === "all"
      );
      const sessions = (sessionsRes?.data ?? []) as Session[];

      let messages: Message[] = [];
      let contextInfo: ContextInfo | null = null;
      let fileChanges: FileChangesInfo | null = null;

      if (sessionId) {
        try {
          const [messagesRes, sessionRes] = await Promise.all([
            client.session.messages({ path: { id: sessionId } }),
            client.session.get({ path: { id: sessionId } }),
          ]);

          const rawMessages = (messagesRes?.data ?? []) as Array<{ info?: unknown; parts?: MessagePart[] }>;
          messages = rawMessages.map((raw) => {
            const m = (raw.info ?? raw) as Record<string, unknown>;
            const parts = (raw.parts ?? m.parts ?? []) as MessagePart[];
            const textParts = parts.filter(
              (p) =>
                p?.type === "text" &&
                typeof p.text === "string" &&
                !(p as { synthetic?: boolean }).synthetic &&
                !(p as { ignored?: boolean }).ignored
            );
            const text =
              (m.text as string) ??
              (textParts.length ? textParts.map((p) => p.text as string).join("\n") : "");
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
              sessionID: sessionId,
            } as Message & { sessionID: string };
          });

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
              const usedTokens =
                (tokens.input || 0) + (tokens.output || 0) + (tokens.cache?.read || 0);
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
          console.error("[SyncStore] Failed to load session messages:", err);
        }
      }

      batch(() => {
        const sessionMap = new Map<string, Session>();
        for (const s of sessions) {
          sessionMap.set(s.id, s);
        }

        const messageMap = new Map<string, Message>();
        const partMap = new Map<string, MessagePart>();
        for (const msg of messages) {
          messageMap.set(msg.id, msg);
          for (const part of msg.parts ?? []) {
            partMap.set(part.id, { ...part, messageID: msg.id });
          }
        }

        setState({
          sessions: sessionMap,
          messages: messageMap,
          parts: partMap,
          permissions: new Map(),
          agents,
          contextInfo,
          fileChanges,
          thinkingSessions: new Set(),
          sessionErrors: new Map(),
        });
      });

      setStatus({ status: "connected" });
    } catch (err) {
      console.error("[SyncStore] Bootstrap failed:", err);
      setStatus({ status: "error", message: (err as Error).message });
      throw err;
    }
  }

  function setContextInfo(info: ContextInfo | null): void {
    updateState(() => ({ contextInfo: info }));
  }

  function setFileChanges(info: FileChangesInfo | null): void {
    updateState(() => ({ fileChanges: info }));
  }

  function setSessionError(sessionId: string, error: string | null): void {
    updateState((prev) => {
      const sessionErrors = new Map(prev.sessionErrors);
      if (error === null) {
        sessionErrors.delete(sessionId);
      } else {
        sessionErrors.set(sessionId, error);
      }
      return { sessionErrors };
    });
  }

  function setThinking(sessionId: string, thinking: boolean): void {
    updateState((prev) => {
      const thinkingSessions = new Set(prev.thinkingSessions);
      if (thinking) {
        thinkingSessions.add(sessionId);
      } else {
        thinkingSessions.delete(sessionId);
      }
      return { thinkingSessions };
    });
  }

  function clearSession(sessionId: string): void {
    updateState((prev) => {
      const messages = new Map(prev.messages);
      const parts = new Map(prev.parts);
      const permissions = new Map(prev.permissions);

      for (const [id, msg] of messages) {
        if ((msg as Message & { sessionID?: string }).sessionID === sessionId) {
          messages.delete(id);
          for (const part of msg.parts ?? []) {
            parts.delete(part.id);
          }
        }
      }

      for (const [key, perm] of permissions) {
        if (perm.sessionID === sessionId) {
          permissions.delete(key);
        }
      }

      return { messages, parts, permissions };
    });
  }

  return {
    state,
    status,
    getSession,
    getMessage,
    getPart,
    getPermission,
    getMessagesForSession,
    getPartsForMessage,
    applyEvent,
    bootstrap,
    setStatus,
    setContextInfo,
    setFileChanges,
    setSessionError,
    setThinking,
    clearSession,
  };
}
