import { produce, reconcile, type SetStoreFunction } from "solid-js/store";
import type { Event } from "../hooks/useOpenCode";
import type {
  Message,
  MessagePart,
  Session,
  Permission,
  IncomingMessage,
} from "../types";
import type { SyncState } from "./types";
import { binarySearch, extractTextFromParts } from "./utils";

export interface EventHandlerContext {
  store: SyncState;
  setStore: SetStoreFunction<SyncState>;
  currentSessionId: () => string | null;
  messageToSession: Map<string, string>;
  sessionIdleCallbacks: Set<(sessionId: string) => void>;
}

export function applyEvent(event: Event, ctx: EventHandlerContext): void {
  const { store, setStore, currentSessionId, messageToSession, sessionIdleCallbacks } = ctx;
  const eventType = event.type as string;

  switch (eventType) {
    case "message.updated": {
      const props = (event as unknown as { properties: { info: IncomingMessage & { sessionID?: string } } }).properties;
      const info = props.info;
      const sessionId = info.sessionID ?? currentSessionId();
      if (!sessionId) break;

      setStore("sessionError", produce((draft) => {
        delete draft[sessionId];
      }));

      const messages = store.message[sessionId] ?? [];
      const result = binarySearch(messages, info.id, (m) => m.id);
      const prev = result.found ? messages[result.index] : undefined;

      const nextParts = info.parts !== undefined ? info.parts : (prev?.parts ?? []);
      const nextText = info.text !== undefined
        ? info.text
        : (info.parts !== undefined
            ? extractTextFromParts(nextParts)
            : (prev?.text ?? ""));

      const msg: Message = {
        id: info.id,
        type: info.role === "user" ? "user" : "assistant",
        text: nextText,
        parts: nextParts,
      };

      messageToSession.set(info.id, sessionId);

      if (!messages.length) {
        setStore("message", sessionId, [msg]);
      } else if (result.found) {
        setStore("message", sessionId, result.index, reconcile(msg));
      } else {
        // Insert at sorted position (IDs are lexicographically sortable)
        setStore("message", sessionId, produce((draft) => {
          draft.splice(result.index, 0, msg);
        }));
      }
      break;
    }

    case "message.removed": {
      const props = (event as unknown as { properties: { messageID: string; sessionID?: string } }).properties;
      const sessionId = props.sessionID ?? currentSessionId();
      if (!sessionId) break;

      const messages = store.message[sessionId];
      if (messages) {
        const result = binarySearch(messages, props.messageID, (m) => m.id);
        if (result.found) {
          setStore("message", sessionId, produce((draft) => {
            draft.splice(result.index, 1);
          }));
        }
      }
      setStore("part", produce((draft) => {
        delete draft[props.messageID];
      }));
      break;
    }

    case "message.part.updated": {
      const props = (event as unknown as { properties: { part: MessagePart & { messageID: string; sessionID?: string } } }).properties;
      const part = props.part;
      const sessionId = props.part.sessionID 
        ?? messageToSession.get(part.messageID) 
        ?? currentSessionId();

      if (sessionId) {
        setStore("sessionError", produce((draft) => {
          delete draft[sessionId];
        }));
      }

      const parts = store.part[part.messageID];
      if (!parts) {
        setStore("part", part.messageID, [part]);
      } else {
        const result = binarySearch(parts, part.id, (p) => p.id);
        if (result.found) {
          setStore("part", part.messageID, result.index, reconcile(part));
        } else {
          // Insert at sorted position (IDs are lexicographically sortable)
          setStore("part", part.messageID, produce((draft) => {
            draft.splice(result.index, 0, part);
          }));
        }
      }

      if (sessionId) {
        messageToSession.set(part.messageID, sessionId);
        
        const messages = store.message[sessionId];
        if (!messages) {
          const newMsg: Message = {
            id: part.messageID,
            type: "assistant",
            text: "",
            parts: [part],
          };
          setStore("message", sessionId, [newMsg]);
        } else {
          const msgResult = binarySearch(messages, part.messageID, (m) => m.id);
          if (msgResult.found) {
            const msg = messages[msgResult.index];
            const existingParts = msg.parts ?? [];
            const partResult = binarySearch(existingParts, part.id, (p) => p.id);
            
            const newParts = [...existingParts];
            if (partResult.found) {
              newParts[partResult.index] = part;
            } else {
              // Insert at sorted position (IDs are lexicographically sortable)
              newParts.splice(partResult.index, 0, part);
            }
            setStore("message", sessionId, msgResult.index, "parts", newParts);

            if (msg.type === "user") {
              setStore("message", sessionId, msgResult.index, "text", extractTextFromParts(newParts));
            }
          } else {
            // Insert new message at sorted position
            const newMsg: Message = {
              id: part.messageID,
              type: "assistant",
              text: "",
              parts: [part],
            };
            setStore("message", sessionId, produce((draft) => {
              draft.splice(msgResult.index, 0, newMsg);
            }));
          }
        }
      }
      break;
    }

    case "message.part.removed": {
      const props = (event as unknown as { properties: { partID: string; messageID: string } }).properties;
      const parts = store.part[props.messageID];
      if (parts) {
        const result = binarySearch(parts, props.partID, (p) => p.id);
        if (result.found) {
          setStore("part", props.messageID, produce((draft) => {
            draft.splice(result.index, 1);
          }));
        }
      }

      const sessionId = currentSessionId();
      if (sessionId) {
        const messages = store.message[sessionId];
        if (messages) {
          const msgResult = binarySearch(messages, props.messageID, (m) => m.id);
          if (msgResult.found) {
            const existingParts = messages[msgResult.index].parts ?? [];
            const newParts = existingParts.filter((p) => p.id !== props.partID);
            setStore("message", sessionId, msgResult.index, "parts", newParts);
          }
        }
      }
      break;
    }

    case "session.created":
    case "session.updated": {
      const props = (event as unknown as { properties: { info: Session } }).properties;
      const session = props.info;
      
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
      break;
    }

    case "session.deleted": {
      const props = (event as unknown as { properties: { info?: { id: string }; sessionID?: string } }).properties;
      const sessionId = props.info?.id ?? props.sessionID;
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
      const props = (event as unknown as { properties: { sessionID?: string } }).properties;
      const sessionId = props.sessionID;
      if (sessionId) {
        setStore("thinking", sessionId, false);
        for (const callback of sessionIdleCallbacks) {
          callback(sessionId);
        }
      }
      break;
    }

    case "session.error": {
      const props = (event as unknown as { properties: { sessionID?: string; error?: { data?: { message?: string } } } }).properties;
      const sessionId = props.sessionID;
      const errorMessage = props.error?.data?.message || "Unknown error";
      if (sessionId) {
        setStore("thinking", sessionId, false);
        setStore("sessionError", sessionId, errorMessage);
      }
      break;
    }

    case "permission.asked":
    case "permission.updated": {
      const permission = (event as unknown as { properties: Permission }).properties;
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
        // Insert at sorted position
        setStore("permission", sessionId, produce((draft) => {
          draft.splice(result.index, 0, permission);
        }));
      }
      break;
    }

    case "permission.replied": {
      const props = (event as unknown as { properties: { permissionID: string; sessionID?: string } }).properties;
      const sessionId = props.sessionID ?? currentSessionId();
      if (!sessionId) break;

      const permissions = store.permission[sessionId];
      if (!permissions) break;

      const result = binarySearch(permissions, props.permissionID, (p) => p.id);
      if (result.found) {
        setStore("permission", sessionId, produce((draft) => {
          draft.splice(result.index, 1);
        }));
      }
      break;
    }

    case "server.instance.disposed": {
      break;
    }
  }
}
