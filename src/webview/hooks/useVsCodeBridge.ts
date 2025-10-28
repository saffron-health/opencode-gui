import { onMount, onCleanup } from "solid-js";

// Get VS Code API at module level
declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

export interface MessagePart {
  id: string;
  type: "text" | "reasoning" | "tool" | "file" | "step-start" | "step-finish";
  text?: string;
  tool?: string;
  state?: any;
  snapshot?: string;
  messageID?: string; // Added by extension for streaming
}

export interface Agent {
  name: string;
  description?: string;
  mode: "subagent" | "primary" | "all";
  builtIn: boolean;
  options?: {
    color?: string;
    [key: string]: unknown;
  };
}

export interface IncomingMessage {
  id: string;
  role?: "user" | "assistant";
  text?: string;
  parts?: MessagePart[];
}

export interface VsCodeBridgeCallbacks {
  onInit: (ready: boolean) => void;
  onAgentList: (agents: Agent[]) => void;
  onThinking: (isThinking: boolean) => void;
  onPartUpdate: (part: MessagePart & { messageID: string }) => void;
  onMessageUpdate: (message: IncomingMessage) => void;
  onResponse: (payload: { text?: string; parts?: MessagePart[] }) => void;
  onError: (message: string) => void;
}

export function useVsCodeBridge(callbacks: VsCodeBridgeCallbacks) {
  onMount(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case "init":
          callbacks.onInit(message.ready);
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
      }
    };

    window.addEventListener("message", messageHandler);

    // Send initialization messages
    send({ type: "ready" });
    send({ type: "getAgents" });

    onCleanup(() => window.removeEventListener("message", messageHandler));
  });

  const send = (message: any) => {
    vscode.postMessage(message);
  };

  return { send };
}
