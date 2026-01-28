import { batch } from "solid-js";
import { produce, reconcile, type SetStoreFunction } from "solid-js/store";
import type {
  Event,
  Part,
  Session as SDKSession,
  Permission as SDKPermission,
} from "@opencode-ai/sdk/client";
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
      ? { diffs: sdkSession.summary.diffs ?? [] }
      : undefined,
  };
}

/** Convert SDK Permission to our internal Permission type */
function toPermission(sdkPerm: SDKPermission): Permission {
  return {
    id: sdkPerm.id,
    permission: sdkPerm.type,
    patterns: sdkPerm.pattern
      ? Array.isArray(sdkPerm.pattern)
        ? sdkPerm.pattern
        : [sdkPerm.pattern]
      : undefined,
    sessionID: sdkPerm.sessionID,
    metadata: sdkPerm.metadata,
    tool: sdkPerm.messageID
      ? { messageID: sdkPerm.messageID, callID: sdkPerm.callID ?? "" }
      : undefined,
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

      // The server may send parts with the message (not in SDK types but present at runtime)
      const incomingParts = (info as unknown as { parts?: Part[] }).parts;
      const incomingText = (info as unknown as { text?: string }).text;
      
      // If parts come with the message, store them in store.part (single source of truth)
      if (incomingParts && incomingParts.length > 0) {
        const sortedParts = incomingParts.map(toPart).sort((a, b) => a.id.localeCompare(b.id));
        setStore("part", info.id, sortedParts);
      }

      // Compute text: prioritize incoming text, then derive from parts, then preserve previous
      const partsForText = incomingParts?.map(toPart) ?? store.part[info.id] ?? [];
      const nextText = incomingText !== undefined
        ? incomingText
        : (incomingParts !== undefined
            ? extractTextFromParts(partsForText)
            : (prev?.text ?? extractTextFromParts(partsForText)));

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

      batch(() => {
        const result = binarySearch(store.sessions, session.id, (s) => s.id);
        if (result.found) {
          setStore("sessions", result.index, reconcile(session));
        } else {
          setStore("sessions", produce((draft) => {
            draft.splice(result.index, 0, session);
          }));
        }

        if (session.summary?.diffs) {
          const diffs = session.summary.diffs;
          setStore("fileChanges", {
            fileCount: diffs.length,
            additions: diffs.reduce((sum, d) => sum + (d.additions || 0), 0),
            deletions: diffs.reduce((sum, d) => sum + (d.deletions || 0), 0),
          });
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
        setStore("thinking", sessionID, false);
        for (const callback of sessionIdleCallbacks) {
          callback(sessionID);
        }
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
        batch(() => {
          setStore("thinking", sessionID, false);
          setStore("sessionError", produce((draft: Record<string, string>) => {
            draft[sessionID] = errorMessage;
          }));
        });
      }
      break;
    }

    case "permission.updated": {
      const permission = toPermission(event.properties);
      const sessionId = permission.sessionID;
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
      const { sessionID, permissionID } = event.properties;
      const sessionId = sessionID ?? currentSessionId();
      if (!sessionId) break;

      const permissions = store.permission[sessionId];
      if (!permissions) break;

      const result = binarySearch(permissions, permissionID, (p) => p.id);
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
