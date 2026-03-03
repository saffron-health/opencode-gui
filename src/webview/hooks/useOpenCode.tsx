import { createSignal, onMount, onCleanup, createContext, useContext, type ParentProps } from "solid-js";
import {
  createOpencodeClient,
  type OpencodeClient,
  type Event,
  type Agent,
  type Session,
  type Message as SDKMessage,
  type Part,
  type TextPartInput,
  type FilePartInput,
  type AgentPartInput,
  type SubtaskPartInput,
} from "@opencode-ai/sdk/v2/client";

import { hasVscodeApi, vscode } from "../utils/vscode";
import { proxyFetch } from "../utils/proxyFetch";
import { proxyEventSource } from "../utils/proxyEventSource";

// Re-export types for convenience
export type { Event, Agent, Session, SDKMessage, Part };
export type PromptPartInput = TextPartInput | FilePartInput | AgentPartInput | SubtaskPartInput;

export type SSEStatus = {
  status: "connecting" | "connected" | "reconnecting" | "closed";
  attempt?: number;
  nextRetryMs?: number;
  reason?: "aborted" | "error" | "manual";
};

interface GlobalConfig {
  serverUrl: string;
  workspaceRoot?: string;
}

export interface InitData {
  currentSessionId?: string | null;
  currentSessionTitle?: string;
  currentSessionMessages?: Array<{ id: string; role: string }>;
  defaultAgent?: string;
}

function createOpenCode() {
  const [client, setClient] = createSignal<OpencodeClient | null>(null);
  const [isReady, setIsReady] = createSignal(false);
  const [workspaceRoot, setWorkspaceRoot] = createSignal<string | undefined>(undefined);
  const [initData, setInitData] = createSignal<InitData | null>(null);
  const [serverUrl, setServerUrl] = createSignal<string | undefined>(undefined);
  const [hostError, setHostError] = createSignal<string | null>(null);

  onMount(() => {
    // Check for standalone config (for E2E tests / web app)
    const globalConfig = (window as { OPENCODE_CONFIG?: GlobalConfig }).OPENCODE_CONFIG;
    if (globalConfig?.serverUrl) {
      const opencodeClient = createOpencodeClient({
        baseUrl: globalConfig.serverUrl,
        fetch: proxyFetch,
        directory: globalConfig.workspaceRoot,
      });
      setClient(opencodeClient);
      setServerUrl(globalConfig.serverUrl);
      setIsReady(true);
      if (globalConfig.workspaceRoot) {
        setWorkspaceRoot(globalConfig.workspaceRoot);
      }
      return; // Skip VSCode handshake
    }

    const handleMessage = (e: MessageEvent) => {
      const data = e.data;
      
      // Handle error messages from host
      if (data?.type === "error") {
        setHostError(data.message ?? "An unknown error occurred");
        return;
      }
      
      // Support both legacy 'init' and future 'server-url' message types
      if (data?.type === "init" || data?.type === "server-url") {
        const url = data.serverUrl ?? data.url;
        if (!url) return;

        // Store workspaceRoot for SSE subscriptions
        const wsRoot = data.workspaceRoot;
        if (wsRoot) {
          setWorkspaceRoot(wsRoot);
        }

        const opencodeClient = createOpencodeClient({
          baseUrl: url,
          fetch: proxyFetch,
          directory: wsRoot,
        });
        setClient(opencodeClient);
        setServerUrl(url);
        setIsReady(true);

        // Store initial session data from 'init' message
        if (data.type === "init") {
          setInitData({
            currentSessionId: data.currentSessionId,
            currentSessionTitle: data.currentSessionTitle,
            currentSessionMessages: data.currentSessionMessages,
            defaultAgent: data.defaultAgent,
          });
        }
      }
    };

    window.addEventListener("message", handleMessage);
    if (hasVscodeApi) {
      vscode.postMessage({ type: "ready" });
    }

    onCleanup(() => {
      window.removeEventListener("message", handleMessage);
    });
  });

  // High-level helper to send a prompt
  // Accepts optional messageID for idempotent sends
  async function sendPrompt(
    sessionId: string,
    text: string,
    agent?: string | null,
    extraParts: PromptPartInput[] = [],
    messageID?: string
  ) {
    const c = client();
    if (!c) throw new Error("Not connected");

    return c.session.prompt({
      sessionID: sessionId,
      parts: [{ type: "text", text }, ...extraParts],
      ...(agent ? { agent } : {}),
      ...(messageID ? { messageID } : {}),
    });
  }

  // Subscribe to events for the workspace through the extension proxy
  // (native EventSource has CORS issues in webview)
  function subscribeToEvents(
    onEvent: (event: Event) => void,
    onStatus?: (status: SSEStatus) => void
  ): () => void {
    const baseUrl = serverUrl();
    const dir = workspaceRoot();
    if (!baseUrl) throw new Error("Not connected");

    const url = new URL("/event", baseUrl);
    if (dir) {
      url.searchParams.set("directory", dir);
    }

    return proxyEventSource(
      url.toString(),
      (data) => {
        try {
          const parsed = JSON.parse(data);
          onEvent(parsed as Event);
        } catch (err) {
          console.error("[SSE] Failed to parse event:", err);
        }
      },
      (err) => {
        console.error("[SSE] EventSource error:", err);
      },
      onStatus
    );
  }

  // Respond to permission request
  async function respondToPermission(
    sessionId: string,
    permissionId: string,
    response: "once" | "always" | "reject"
  ) {
    const c = client();
    if (!c) throw new Error("Not connected");

    const dir = workspaceRoot();
    return c.permission.reply({
      reply: response,
      requestID: permissionId,
      ...(dir ? { directory: dir } : {}),
    });
  }

  // Revert to a previous message
  async function revertToMessage(sessionId: string, messageId: string) {
    const c = client();
    if (!c) throw new Error("Not connected");

    return c.session.revert({
      sessionID: sessionId,
      messageID: messageId,
    });
  }

  return {
    client,
    isReady,
    workspaceRoot,
    initData,
    hostError,
    setHostError,
    clearHostError: () => setHostError(null),
    // Expose SDK methods directly
    listSessions: () => {
      const dir = workspaceRoot();
      return client()?.session.list(dir ? { directory: dir } : undefined);
    },
    getSession: (id: string) => client()?.session.get({ sessionID: id }),
    createSession: () => {
      const dir = workspaceRoot();
      return client()?.session.create(dir ? { directory: dir } : undefined);
    },
    getAgents: () => client()?.app.agents(),
    getMessages: (id: string) => client()?.session.messages({ sessionID: id }),
    getConfig: () => {
      const dir = workspaceRoot();
      return client()?.config.get(dir ? { directory: dir } : undefined);
    },
    abortSession: (id: string) => client()?.session.abort({ sessionID: id }),
    // High-level helpers
    sendPrompt,
    subscribeToEvents,
    respondToPermission,
    revertToMessage,
  };
}

// Context
const OpenCodeContext = createContext<ReturnType<typeof createOpenCode>>();

export function OpenCodeProvider(props: ParentProps) {
  const value = createOpenCode();
  return <OpenCodeContext.Provider value={value}>{props.children}</OpenCodeContext.Provider>;
}

export function useOpenCode() {
  const context = useContext(OpenCodeContext);
  if (!context) throw new Error("useOpenCode must be used within OpenCodeProvider");
  return context;
}
