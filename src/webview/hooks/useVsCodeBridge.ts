import { onMount, onCleanup } from "solid-js";
import type { MessagePart, Agent, IncomingMessage, WebviewMessage, Session, Permission, ContextInfo, FileChangesInfo } from "../types";

declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

export interface VsCodeBridgeCallbacks {
  onInit: (ready: boolean, workspaceRoot?: string, currentSessionId?: string | null, currentSessionTitle?: string, messages?: IncomingMessage[]) => void;
  onAgentList: (agents: Agent[]) => void;
  onThinking: (isThinking: boolean) => void;
  onPartUpdate: (part: MessagePart & { messageID: string }) => void;
  onMessageUpdate: (message: IncomingMessage) => void;
  onResponse: (payload: { text?: string; parts?: MessagePart[] }) => void;
  onError: (message: string) => void;
  onSessionList: (sessions: Session[]) => void;
  onSessionSwitched: (sessionId: string, title: string, messages?: IncomingMessage[]) => void;
  onPermissionRequired: (permission: Permission) => void;
  onContextUpdate: (contextInfo: ContextInfo) => void;
  onFileChangesUpdate: (fileChanges: FileChangesInfo) => void;
}

export function useVsCodeBridge(callbacks: VsCodeBridgeCallbacks) {
  onMount(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case "init":
          callbacks.onInit(message.ready, message.workspaceRoot, message.currentSessionId, message.currentSessionTitle, message.currentSessionMessages);
          break;

        case "agentList":
          callbacks.onAgentList(message.agents || []);
          break;

        case "thinking":
          callbacks.onThinking(message.isThinking);
          break;

        case "part-update": {
          const { part } = message;
          callbacks.onPartUpdate(part);
          break;
        }

        case "message-update": {
          const { message: finalMessage } = message;
          callbacks.onMessageUpdate(finalMessage);
          break;
        }

        case "response":
          callbacks.onResponse({
            text: message.text,
            parts: message.parts,
          });
          break;

        case "error":
          callbacks.onError(message.message);
          break;

        case "session-list":
          callbacks.onSessionList(message.sessions || []);
          break;

        case "session-switched":
          callbacks.onSessionSwitched(message.sessionId, message.title, message.messages);
          break;

        case "permission-required":
          console.log('[Bridge] Received permission-required message:', message.permission);
          callbacks.onPermissionRequired(message.permission);
          break;

        case "context-update":
          callbacks.onContextUpdate(message.contextInfo);
          break;

        case "file-changes-update":
          callbacks.onFileChangesUpdate(message.fileChanges);
          break;
      }
    };

    window.addEventListener("message", messageHandler);

    // Send initialization messages
    send({ type: "ready" });
    send({ type: "getAgents" });

    onCleanup(() => window.removeEventListener("message", messageHandler));
  });

  const send = (message: WebviewMessage) => {
    vscode.postMessage(message);
  };

  return { send };
}
