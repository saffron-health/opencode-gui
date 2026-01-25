import { createSignal, onMount, onCleanup } from "solid-js";
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
} from "@opencode-ai/sdk/client";

import { hasVscodeApi, vscode } from "../utils/vscode";
import { proxyFetch } from "../utils/proxyFetch";
import { proxyEventSource } from "../utils/proxyEventSource";

// Re-export types for convenience
export type { Event, Agent, Session, SDKMessage, Part };
export type PromptPartInput = TextPartInput | FilePartInput | AgentPartInput | SubtaskPartInput;

interface GlobalConfig {
  serverUrl: string;
  workspaceRoot?: string;
}

export interface InitData {
  currentSessionId?: string | null;
  currentSessionTitle?: string;
  currentSessionMessages?: unknown[];
  defaultAgent?: string;
}

export function useOpenCode() {
  const [client, setClient] = createSignal<OpencodeClient | null>(null);
  const [isReady, setIsReady] = createSignal(false);
  const [workspaceRoot, setWorkspaceRoot] = createSignal<string | undefined>(undefined);
  const [initData, setInitData] = createSignal<InitData | null>(null);
  const [serverUrl, setServerUrl] = createSignal<string | undefined>(undefined);
  const [hostError, setHostError] = createSignal<string | null>(null);

  onMount(() => {
    // Check for standalone config (for E2E tests / web app)
    const globalConfig = (window as unknown as { OPENCODE_CONFIG?: GlobalConfig }).OPENCODE_CONFIG;
    if (globalConfig?.serverUrl) {
      const opencodeClient = createOpencodeClient({
        baseUrl: globalConfig.serverUrl,
        fetch: proxyFetch,
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

        const opencodeClient = createOpencodeClient({
          baseUrl: url,
          fetch: proxyFetch,
        });
        setClient(opencodeClient);
        setServerUrl(url);
        setIsReady(true);

        // Store workspaceRoot for SSE subscriptions
        if (data.workspaceRoot) {
          setWorkspaceRoot(data.workspaceRoot);
        }

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
  async function sendPrompt(
    sessionId: string,
    text: string,
    agent?: string | null,
    extraParts: PromptPartInput[] = []
  ) {
    const c = client();
    if (!c) throw new Error("Not connected");

    const configResult = await c.config.get();
    const model = configResult.data?.model || "anthropic/claude-sonnet-4-5-20250929";
    const [providerID, modelID] = model.split("/");

    return c.session.prompt({
      path: { id: sessionId },
      body: {
        model: { providerID, modelID },
        parts: [{ type: "text", text }, ...extraParts],
        ...(agent ? { agent } : {}),
      },
    });
  }

  // Subscribe to events for the workspace through the extension proxy
  // (native EventSource has CORS issues in webview)
  function subscribeToEvents(onEvent: (event: Event) => void): () => void {
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
      }
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

    return c.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: permissionId },
      body: { response },
    });
  }

  // Revert to a previous message
  async function revertToMessage(sessionId: string, messageId: string) {
    const c = client();
    if (!c) throw new Error("Not connected");

    return c.session.revert({
      path: { id: sessionId },
      body: { messageID: messageId },
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
      return client()?.session.list(dir ? { query: { directory: dir } } : undefined);
    },
    getSession: (id: string) => client()?.session.get({ path: { id } }),
    createSession: () => client()?.session.create({ body: {} }),
    getAgents: () => client()?.app.agents(),
    getMessages: (id: string) => client()?.session.messages({ path: { id } }),
    getConfig: () => client()?.config.get(),
    abortSession: (id: string) => client()?.session.abort({ path: { id } }),
    // High-level helpers
    sendPrompt,
    subscribeToEvents,
    respondToPermission,
    revertToMessage,
  };
}
