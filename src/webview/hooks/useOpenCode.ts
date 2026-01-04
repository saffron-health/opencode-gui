import { createSignal, onMount, onCleanup } from "solid-js";
import {
  createOpencodeClient,
  type OpencodeClient,
  type Event,
} from "@opencode-ai/sdk";
import type { Agent, Session, Message as SDKMessage, Part } from "@opencode-ai/sdk";

declare const vscode: {
  postMessage: (message: unknown) => void;
};

// Re-export types for convenience
export type { Event, Agent, Session, SDKMessage, Part };

export interface InitData {
  currentSessionId?: string | null;
  currentSessionTitle?: string;
  currentSessionMessages?: unknown[];
}

export function useOpenCode() {
  const [client, setClient] = createSignal<OpencodeClient | null>(null);
  const [isReady, setIsReady] = createSignal(false);
  const [workspaceRoot, setWorkspaceRoot] = createSignal<string | undefined>(undefined);
  const [initData, setInitData] = createSignal<InitData | null>(null);

  onMount(() => {
    const handleMessage = (e: MessageEvent) => {
      const data = e.data;
      // Support both legacy 'init' and future 'server-url' message types
      if (data?.type === "init" || data?.type === "server-url") {
        const url = data.serverUrl ?? data.url;
        if (!url) return;

        const opencodeClient = createOpencodeClient({ baseUrl: url });
        setClient(opencodeClient);
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
          });
        }
      }
    };

    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "ready" });

    onCleanup(() => {
      window.removeEventListener("message", handleMessage);
    });
  });

  // High-level helper to send a prompt
  async function sendPrompt(sessionId: string, text: string, agent?: string | null) {
    const c = client();
    if (!c) throw new Error("Not connected");

    const configResult = await c.config.get();
    const model = configResult.data?.model || "anthropic/claude-sonnet-4-5-20250929";
    const [providerID, modelID] = model.split("/");

    return c.session.prompt({
      path: { id: sessionId },
      body: {
        model: { providerID, modelID },
        parts: [{ type: "text", text }],
        ...(agent ? { agent } : {}),
      },
    });
  }

  // Subscribe to events for the workspace
  async function subscribeToEvents(onEvent: (event: Event) => void) {
    const c = client();
    const dir = workspaceRoot();
    if (!c || !dir) throw new Error("Not connected");

    const result = await c.event.subscribe({ query: { directory: dir } });

    for await (const event of result.stream) {
      onEvent(event as Event);
    }
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
    // Expose SDK methods directly
    listSessions: () => client()?.session.list(),
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
