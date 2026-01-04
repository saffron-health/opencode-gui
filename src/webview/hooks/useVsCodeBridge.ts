import { onMount, onCleanup } from "solid-js";
import type {
  MessagePart,
  Agent,
  IncomingMessage,
  WebviewMessage,
  Session,
  Permission,
  ContextInfo,
  FileChangesInfo,
  HostMessage,
} from "../types";
import { parseHostMessage } from "../types";

declare const acquireVsCodeApi: () => { postMessage: (msg: unknown) => void };
const vscode = acquireVsCodeApi();

export interface VsCodeBridgeCallbacks {
  onInit: (ready: boolean, workspaceRoot?: string, currentSessionId?: string | null, currentSessionTitle?: string, messages?: IncomingMessage[]) => void;
  onAgentList: (agents: Agent[], defaultAgent?: string) => void;
  onThinking: (isThinking: boolean) => void;
  onPartUpdate: (part: MessagePart & { messageID: string }) => void;
  onMessageUpdate: (message: IncomingMessage) => void;
  onMessageRemoved: (messageId: string) => void;
  onResponse: (payload: { text?: string; parts?: MessagePart[] }) => void;
  onError: (message: string) => void;
  onSessionList: (sessions: Session[]) => void;
  onSessionSwitched: (sessionId: string, title: string, messages?: IncomingMessage[]) => void;
  onSessionTitleUpdate: (sessionId: string, title: string) => void;
  onPermissionRequired: (permission: Permission) => void;
  onContextUpdate: (contextInfo: ContextInfo) => void;
  onFileChangesUpdate: (fileChanges: FileChangesInfo) => void;
}

export function useVsCodeBridge(callbacks: VsCodeBridgeCallbacks) {
  onMount(() => {
    const messageHandler = (event: MessageEvent) => {
      const parsed = parseHostMessage(event.data);
      if (!parsed) return;

      handleHostMessage(parsed, callbacks);
    };

    window.addEventListener("message", messageHandler);

    send({ type: "ready" });
    send({ type: "getAgents" });

    onCleanup(() => window.removeEventListener("message", messageHandler));
  });

  const send = (message: WebviewMessage) => {
    vscode.postMessage(message);
  };

  return { send };
}

function handleHostMessage(message: HostMessage, callbacks: VsCodeBridgeCallbacks) {
  switch (message.type) {
    case "init":
      callbacks.onInit(
        message.ready,
        message.workspaceRoot,
        message.currentSessionId,
        message.currentSessionTitle,
        message.currentSessionMessages
      );
      break;

    case "agentList":
      callbacks.onAgentList(message.agents, message.defaultAgent);
      break;

    case "thinking":
      callbacks.onThinking(message.isThinking);
      break;

    case "part-update":
      callbacks.onPartUpdate(message.part);
      break;

    case "message-update":
      callbacks.onMessageUpdate(message.message);
      break;

    case "message-removed":
      callbacks.onMessageRemoved(message.messageId);
      break;

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
      callbacks.onSessionList(message.sessions);
      break;

    case "session-switched":
      callbacks.onSessionSwitched(message.sessionId, message.title, message.messages);
      break;

    case "session-title-update":
      callbacks.onSessionTitleUpdate(message.sessionId, message.title);
      break;

    case "permission-required":
      callbacks.onPermissionRequired(message.permission);
      break;

    case "context-update":
      callbacks.onContextUpdate(message.contextInfo);
      break;

    case "file-changes-update":
      callbacks.onFileChangesUpdate(message.fileChanges);
      break;
  }
}
