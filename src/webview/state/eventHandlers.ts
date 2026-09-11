import { batch } from "solid-js";
import { produce, reconcile, type SetStoreFunction } from "solid-js/store";
import type {
  Event,
  Part,
  Session as SDKSession,
  PermissionRequest as SDKPermission,
  AssistantMessage,
} from "@opencode-ai/sdk/v2/client";
import type { Message, MessagePart, Session, Permission } from "../types";
import type { SyncState } from "./types";
import { binarySearch, findById } from "./utils";
import {
  deriveContextInfo,
  deriveFileChangesFromDiff,
  deriveFileChangesFromSummary,
} from "./derive";
import { logger } from "../utils/logger";

export interface EventHandlerContext {
  store: SyncState;
  setStore: SetStoreFunction<SyncState>;
  currentSessionId: () => string | null;
  messageToSession: Map<string, string>;
  sessionIdleCallbacks: Set<(sessionId: string) => void>;
}

/** Convert SDK Part to our internal MessagePart type */
function toPart(sdkPart: Part): MessagePart {
  return sdkPart as MessagePart;
}

/** Convert SDK Session to our internal Session type */
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

/** Convert SDK Permission to our internal Permission type */
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

/** Apply a delta (append) to a possibly nested field path (e.g. "text" or "state.output") */
function applyFieldDelta(obj: Record<string, unknown>, field: string, delta: string): void {
  const segments = field.split(".");
  let target: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    if (target[segments[i]] == null || typeof target[segments[i]] !== "object") {
      target[segments[i]] = {};
    }
    target = target[segments[i]] as Record<string, unknown>;
  }
  const lastKey = segments[segments.length - 1];
  target[lastKey] = ((target[lastKey] as string) ?? "") + delta;
}

/**
 * Ensure a message entry exists for the session. Message text is derived from
 * store.part at render time, so entries carry no text field here.
 */
function ensureMessage(
  ctx: EventHandlerContext,
  sessionId: string,
  messageId: string,
  role: "user" | "assistant",
): void {
  const { store, setStore, messageToSession } = ctx;
  messageToSession.set(messageId, sessionId);
  const messages = store.message[sessionId];
  if (!messages) {
    setStore("message", sessionId, [{ id: messageId, type: role }]);
    return;
  }
  if (!findById(messages, messageId, (m) => m.id).found) {
    // Replace the array (not in-place) so downstream subscribers see a new ref.
    setStore("message", sessionId, [...messages, { id: messageId, type: role }]);
  }
}

export function applyEvent(event: Event, ctx: EventHandlerContext): void {
  const { store, setStore, currentSessionId, messageToSession, sessionIdleCallbacks } = ctx;
  
  logger.debug("Applying event", { type: event.type });

  switch (event.type) {
    case "message.updated": {
      const { info } = event.properties;
      const sessionId = info.sessionID ?? currentSessionId();
      if (!sessionId) break;

      setStore("sessionError", produce((draft) => {
        delete draft[sessionId];
      }));

      const messages = store.message[sessionId] ?? [];
      // Use linear search for messages (client and server IDs have incompatible sort orders)
      const result = findById(messages, info.id, (m) => m.id);

      const msg: Message = {
        id: info.id,
        type: info.role,
        time: info.time,
      };

      messageToSession.set(info.id, sessionId);

      if (!messages.length) {
        console.log(
          `[EventHandler] Creating message array for session sessionId=${sessionId} msgId=${msg.id}`
        );
        setStore("message", sessionId, [msg]);
      } else if (result.found) {
        setStore("message", sessionId, result.index, msg);
      } else {
        // Replace the array (not in-place mutate) so downstream subscribers
        // see a new reference and propagate updates.
        setStore("message", sessionId, [...messages, msg]);
      }

      // Cap messages at 100 per session (matching TUI)
      const updatedMessages = store.message[sessionId];
      if (updatedMessages && updatedMessages.length > 100) {
        const oldest = updatedMessages[0];
        batch(() => {
          setStore("message", sessionId, updatedMessages.slice(1));
          setStore("part", produce((draft) => { delete draft[oldest.id]; }));
        });
        messageToSession.delete(oldest.id);
      }

      // Update context info from the last assistant message in the current session
      // This ensures we show cumulative context for the session being viewed
      const viewingSessionId = currentSessionId();
      if (viewingSessionId && sessionId === viewingSessionId && info.role === "assistant") {
        const context = deriveContextInfo(info as AssistantMessage);
        if (context) setStore("contextInfo", context);
      }
      break;
    }

    case "message.removed": {
      const { sessionID, messageID } = event.properties;
      const sessionId = sessionID ?? currentSessionId();
      if (!sessionId) break;

      const messages = store.message[sessionId];
      if (messages) {
        const result = findById(messages, messageID, (m) => m.id);
        if (result.found) {
          // Replace array to ensure messages memo propagates
          setStore("message", sessionId, [
            ...messages.slice(0, result.index),
            ...messages.slice(result.index + 1),
          ]);
        }
      }
      setStore("part", produce((draft) => {
        delete draft[messageID];
      }));
      messageToSession.delete(messageID);
      break;
    }

    case "message.part.delta": {
      const delta = event.properties as {
        sessionID?: string;
        messageID?: string;
        partID?: string;
        field?: string;
        delta?: string;
      };
      const dMessageID = delta.messageID;
      const dPartID = delta.partID;
      const dField = delta.field;
      const dDelta = delta.delta;
      if (!dMessageID || !dPartID || !dField || dDelta === undefined) break;

      const dSessionId = delta.sessionID
        ?? messageToSession.get(dMessageID)
        ?? currentSessionId();

      batch(() => {
        if (dSessionId) {
          setStore("sessionError", produce((draft) => { delete draft[dSessionId]; }));
        }

        // Update or create the part
        const parts = store.part[dMessageID];
        if (!parts) {
          const newPart: Record<string, unknown> = {
            id: dPartID,
            sessionID: delta.sessionID,
            messageID: dMessageID,
            type: "text",
          };
          applyFieldDelta(newPart, dField, dDelta);
          setStore("part", dMessageID, [newPart as MessagePart]);
        } else {
          const result = findById(parts, dPartID, (p) => p.id);
          if (result.found) {
            // Append delta to existing part's field using produce
            setStore("part", dMessageID, result.index, produce((draft: Record<string, unknown>) => {
              applyFieldDelta(draft, dField, dDelta);
            }));
          } else {
            // Create new part and append (use array replacement, not produce+push)
            const newPart: Record<string, unknown> = {
              id: dPartID,
              sessionID: delta.sessionID,
              messageID: dMessageID,
              type: "text",
            };
            applyFieldDelta(newPart, dField, dDelta);
            setStore("part", dMessageID, [...parts, newPart as MessagePart]);
          }
        }

        // Ensure the message exists (text is derived from parts at render time)
        if (dSessionId) {
          ensureMessage(ctx, dSessionId, dMessageID, "assistant");
        }
      });
      break;
    }
    
    case "message.part.updated": {
      const { part: sdkPart } = event.properties as { part?: any };
      if (!sdkPart) {
        console.warn("[EventHandler] No part in message.part.updated event", event);
        break;
      }
      const part = toPart(sdkPart);
      const sessionId = sdkPart.sessionID
        ?? messageToSession.get(sdkPart.messageID)
        ?? currentSessionId();
      
      batch(() => {
        if (sessionId) {
          setStore("sessionError", produce((draft) => {
            delete draft[sessionId];
          }));
        }

        // Update store.part (single source of truth) - use linear search + append
        const parts = store.part[sdkPart.messageID];
        if (!parts) {
          setStore("part", sdkPart.messageID, [part]);
        } else {
          const result = findById(parts, part.id, (p) => p.id);
          if (result.found) {
            // Merge partial updates into the existing part so we don't drop
            // streamed fields (for example text accumulated via delta events).
            setStore("part", sdkPart.messageID, result.index, produce((draft: MessagePart) => {
              const incoming = part as Record<string, unknown>;
              const draftRecord = draft as Record<string, unknown>;
              for (const [key, value] of Object.entries(incoming)) {
                if (key === "state" || value === undefined) continue;
                draftRecord[key] = value;
              }
              if (part.state !== undefined) {
                draft.state = {
                  ...(draft.state ?? {}),
                  ...part.state,
                };
              }
            }));
          } else {
            // Append new parts using array replacement (not produce+push)
            setStore("part", sdkPart.messageID, [...parts, part]);
          }
        }

        // Ensure the message exists (part may arrive before message.updated).
        // Text is derived from parts at render time, so no text bookkeeping here.
        if (sessionId) {
          ensureMessage(ctx, sessionId, sdkPart.messageID, "assistant");
        }
      });
      break;
    }

    case "message.part.removed": {
      const { messageID, partID } = event.properties;
      const parts = store.part[messageID];
      if (parts) {
        const result = findById(parts, partID, (p) => p.id);
        if (result.found) {
          setStore("part", messageID, produce((draft) => {
            draft.splice(result.index, 1);
          }));
        }
      }
      break;
    }

    case "session.created":
    case "session.updated": {
      const session = toSession(event.properties.info);

      // Skip child sessions (system agents like title, compaction, etc.)
      if (session.parentID) break;

      batch(() => {
        const result = binarySearch(store.sessions, session.id, (s) => s.id);
        if (result.found) {
          setStore("sessions", result.index, reconcile(session));
        } else {
          setStore("sessions", produce((draft) => {
            draft.splice(result.index, 0, session);
          }));
        }

        const fileChanges = deriveFileChangesFromSummary(session.summary);
        if (fileChanges) setStore("fileChanges", fileChanges);
      });
      break;
    }

    case "session.deleted": {
      const sessionId = event.properties.info.id;
      if (!sessionId) break;

      const result = binarySearch(store.sessions, sessionId, (s) => s.id);
      if (result.found) {
        setStore("sessions", produce((draft) => {
          draft.splice(result.index, 1);
        }));
      }
      break;
    }

    case "session.idle": {
      const { sessionID } = event.properties;
      
      if (sessionID) {
        // Fire callbacks first to clear inFlightMessage
        for (const callback of sessionIdleCallbacks) {
          callback(sessionID);
        }
        setStore("thinking", sessionID, false);
      }
      break;
    }

    case "session.error": {
      const { sessionID, error } = event.properties;
      const errorMessage: string = String(error?.data?.message ?? "Unknown error");
      
      // Log session errors for debugging
      logger.error("Session error received", {
        sessionID,
        errorName: error?.name,
        errorMessage,
        errorData: error?.data,
      });
      
      if (sessionID) {
        // Fire callbacks to clear inFlightMessage so queue can drain after errors
        for (const callback of sessionIdleCallbacks) {
          callback(sessionID);
        }
        batch(() => {
          setStore("thinking", sessionID, false);
          setStore("sessionError", produce((draft: Record<string, string>) => {
            draft[sessionID] = errorMessage;
          }));
        });
      }
      break;
    }

    case "session.diff": {
      const { sessionID, diff } = event.properties as { sessionID?: string; diff?: Array<{ file: string; additions: number; deletions: number }> };
      const sessionId = sessionID ?? currentSessionId();
      if (!sessionId || !diff) break;

      setStore("fileChanges", deriveFileChangesFromDiff(diff));
      break;
    }

    case "permission.asked": {
      const permission = toPermission(event.properties);
      const sessionId = permission.sessionID;
      
      logger.debug("Permission event received", {
        permissionId: permission.id,
        sessionId,
        type: permission.permission,
        patterns: permission.patterns,
        tool: permission.tool,
      });
      
      if (!sessionId) break;

      const permissions = store.permission[sessionId];
      if (!permissions) {
        setStore("permission", sessionId, [permission]);
        break;
      }

      const result = binarySearch(permissions, permission.id, (p) => p.id);
      if (result.found) {
        setStore("permission", sessionId, result.index, reconcile(permission));
      } else {
        setStore("permission", sessionId, produce((draft) => {
          draft.splice(result.index, 0, permission);
        }));
      }
      break;
    }

    case "permission.replied": {
      const { sessionID, requestID } = event.properties;
      const sessionId = sessionID ?? currentSessionId();
      if (!sessionId) break;

      const permissions = store.permission[sessionId];
      if (!permissions) break;

      const result = binarySearch(permissions, requestID, (p) => p.id);
      if (result.found) {
        setStore("permission", sessionId, produce((draft) => {
          draft.splice(result.index, 1);
        }));
      }
      break;
    }

    case "session.status": {
      const { sessionID, status } = event.properties;
      if (sessionID) {
        setStore("sessionStatus", sessionID, status);
      }
      break;
    }

    case "server.instance.disposed":
      // Handled by sync.tsx separately
      break;

    // Ignore events we don't handle
    default:
      // TypeScript will warn if we add new event types without handling them
      break;
  }
}
