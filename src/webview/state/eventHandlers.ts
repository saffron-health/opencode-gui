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
import { binarySearch, findById, extractTextFromParts } from "./utils";
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

export function applyEvent(event: Event, ctx: EventHandlerContext): void {
  const { store, setStore, currentSessionId, messageToSession, sessionIdleCallbacks } = ctx;

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
      const prev = result.found ? messages[result.index] : undefined;

      // Compute text from existing parts in the store
      const partsForText = store.part[info.id] ?? [];
      const nextText = partsForText.length > 0 
        ? extractTextFromParts(partsForText)
        : (prev?.text ?? "");

      const msg: Message = {
        id: info.id,
        type: info.role,
        text: nextText,
      };

      messageToSession.set(info.id, sessionId);

      if (!messages.length) {
        setStore("message", sessionId, [msg]);
      } else if (result.found) {
        setStore("message", sessionId, result.index, reconcile(msg));
      } else {
        // Append new messages (SSE events arrive in chronological order)
        setStore("message", sessionId, produce((draft) => {
          draft.push(msg);
        }));
      }

      // Cap messages at 100 per session (matching TUI)
      const updatedMessages = store.message[sessionId];
      if (updatedMessages && updatedMessages.length > 100) {
        const oldest = updatedMessages[0];
        batch(() => {
          setStore("message", sessionId, produce((draft) => { draft.shift(); }));
          setStore("part", produce((draft) => { delete draft[oldest.id]; }));
        });
        messageToSession.delete(oldest.id);
      }

      // Update context info from the last assistant message in the current session
      // This ensures we show cumulative context for the session being viewed
      const viewingSessionId = currentSessionId();
      if (viewingSessionId && sessionId === viewingSessionId && info.role === "assistant") {
        const assistantInfo = info as AssistantMessage;
        const tokens = assistantInfo.tokens;
        const usedTokens =
          tokens.input +
          tokens.output +
          tokens.reasoning +
          tokens.cache.read +
          tokens.cache.write;
        if (usedTokens > 0) {
          const limit = 200000; // Default context limit, could be fetched from config
          setStore("contextInfo", {
            usedTokens,
            limitTokens: limit,
            percentage: Math.min(100, (usedTokens / limit) * 100),
          });
        }
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
          setStore("message", sessionId, produce((draft) => {
            draft.splice(result.index, 1);
          }));
        }
      }
      setStore("part", produce((draft) => {
        delete draft[messageID];
      }));
      messageToSession.delete(messageID);
      break;
    }

    case "message.part.updated": {
      const { part: sdkPart } = event.properties;
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
            setStore("part", sdkPart.messageID, result.index, reconcile(part));
          } else {
            // Append new parts (SSE events arrive in order)
            setStore("part", sdkPart.messageID, produce((draft) => {
              draft.push(part);
            }));
          }
        }

        // Ensure the message exists (part may arrive before message.updated)
        if (sessionId) {
          messageToSession.set(sdkPart.messageID, sessionId);

          const messages = store.message[sessionId];
          if (!messages) {
            const newMsg: Message = {
              id: sdkPart.messageID,
              type: "assistant",
              text: "",
            };
            setStore("message", sessionId, [newMsg]);
          } else {
            const msgResult = findById(messages, sdkPart.messageID, (m) => m.id);
            if (!msgResult.found) {
              const newMsg: Message = {
                id: sdkPart.messageID,
                type: "assistant",
                text: "",
              };
              // Append new messages
              setStore("message", sessionId, produce((draft) => {
                draft.push(newMsg);
              }));
            }
          }
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

        if (session.summary) {
          if (session.summary.diffs && session.summary.diffs.length > 0) {
            // Use detailed diffs if available
            const diffs = session.summary.diffs;
            setStore("fileChanges", {
              fileCount: diffs.length,
              additions: diffs.reduce((sum, d) => sum + (d.additions || 0), 0),
              deletions: diffs.reduce((sum, d) => sum + (d.deletions || 0), 0),
            });
          } else if (session.summary.files > 0) {
            // Fallback to summary-level aggregates
            setStore("fileChanges", {
              fileCount: session.summary.files,
              additions: session.summary.additions,
              deletions: session.summary.deletions,
            });
          }
        }
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

      // Aggregate file changes from diff array
      setStore("fileChanges", {
        fileCount: diff.length,
        additions: diff.reduce((sum, d) => sum + (d.additions || 0), 0),
        deletions: diff.reduce((sum, d) => sum + (d.deletions || 0), 0),
      });
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

    case "server.instance.disposed":
      // Handled by sync.tsx separately
      break;

    // Ignore events we don't handle
    default:
      // TypeScript will warn if we add new event types without handling them
      break;
  }
}
