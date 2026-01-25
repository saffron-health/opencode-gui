/**
 * SolidJS hook that provides a synchronized store with SSE event handling
 * and automatic bootstrap/reconnect behavior.
 */

import { createSignal, onMount, onCleanup, createEffect, batch } from "solid-js";
import { createSyncStore, type SyncStore, type SyncStatus } from "./syncStore";
import { useOpenCode, type Event, type SSEStatus } from "../hooks/useOpenCode";
import type { Message, Agent, Session, Permission, ContextInfo, FileChangesInfo } from "../types";

export interface UseSyncStoreResult {
  store: SyncStore;

  messages: () => Message[];
  sessions: () => Session[];
  agents: () => Agent[];
  permissions: () => Map<string, Permission>;

  currentSessionId: () => string | null;
  setCurrentSessionId: (id: string | null) => void;

  isThinking: () => boolean;
  setThinking: (sessionId: string, thinking: boolean) => void;

  sessionError: () => string | null;
  setSessionError: (sessionId: string, error: string | null) => void;

  contextInfo: () => ContextInfo | null;
  fileChanges: () => FileChangesInfo | null;

  status: () => SyncStatus;
  isReady: () => boolean;
  workspaceRoot: () => string | undefined;

  reconnect: () => void;
  bootstrap: () => Promise<void>;
}

export function useSyncStore(): UseSyncStoreResult {
  const store = createSyncStore();
  const sdk = useOpenCode();

  const [currentSessionId, setCurrentSessionIdInternal] = createSignal<string | null>(null);
  const [sseCleanup, setSseCleanup] = createSignal<(() => void) | null>(null);
  const [bootstrapCount, setBootstrapCount] = createSignal(0);

  function setCurrentSessionId(id: string | null) {
    const prevId = currentSessionId();
    if (prevId && prevId !== id) {
      store.clearSession(prevId);
    }
    setCurrentSessionIdInternal(id);
  }

  function messages(): Message[] {
    const sessionId = currentSessionId();
    if (!sessionId) return [];

    const result: Message[] = [];
    for (const msg of store.state().messages.values()) {
      const msgWithSession = msg as Message & { sessionID?: string };
      if (!msgWithSession.sessionID || msgWithSession.sessionID === sessionId) {
        result.push(msg);
      }
    }
    return result;
  }

  function sessions(): Session[] {
    const arr: Session[] = [];
    for (const s of store.state().sessions.values()) {
      arr.push(s);
    }
    return arr;
  }

  function agents(): Agent[] {
    return store.state().agents;
  }

  function permissions(): Map<string, Permission> {
    return store.state().permissions;
  }

  function isThinking(): boolean {
    const sessionId = currentSessionId();
    return sessionId ? store.state().thinkingSessions.has(sessionId) : false;
  }

  function sessionError(): string | null {
    const sessionId = currentSessionId();
    return sessionId ? store.state().sessionErrors.get(sessionId) ?? null : null;
  }

  function contextInfo(): ContextInfo | null {
    return store.state().contextInfo;
  }

  function fileChanges(): FileChangesInfo | null {
    return store.state().fileChanges;
  }

  async function bootstrap(): Promise<void> {
    const client = sdk.client();
    if (!client) {
      console.warn("[useSyncStore] Cannot bootstrap: SDK client not ready");
      return;
    }

    try {
      await store.bootstrap(client, currentSessionId(), sdk.workspaceRoot());
    } catch (err) {
      console.error("[useSyncStore] Bootstrap failed:", err);
    }
  }

  function handleEvent(event: Event) {
    const eventType = event.type as string;

    if (eventType === "server.instance.disposed") {
      console.log("[useSyncStore] Server disposed, re-bootstrapping...");
      setBootstrapCount((c) => c + 1);
      return;
    }

    store.applyEvent(event);
  }

  function handleStatus(status: SSEStatus) {
    if (status.status === "connecting") {
      store.setStatus({ status: "connecting" });
    } else if (status.status === "connected") {
      store.setStatus({ status: "connected" });
      setBootstrapCount((c) => c + 1);
    } else if (status.status === "reconnecting") {
      store.setStatus({ status: "reconnecting", attempt: status.attempt ?? 0 });
    } else if (status.status === "closed") {
      store.setStatus({ status: "disconnected" });
    }
  }

  function startSSE() {
    const cleanup = sseCleanup();
    if (cleanup) {
      cleanup();
    }

    if (!sdk.isReady()) {
      return;
    }

    try {
      const newCleanup = sdk.subscribeToEvents(handleEvent, handleStatus);
      setSseCleanup(() => newCleanup);
    } catch (err) {
      console.error("[useSyncStore] Failed to start SSE:", err);
    }
  }

  function reconnect() {
    startSSE();
    setBootstrapCount((c) => c + 1);
  }

  createEffect(() => {
    if (!sdk.isReady()) return;
    startSSE();
  });

  createEffect(async () => {
    const count = bootstrapCount();
    if (count === 0) return;
    if (!sdk.isReady()) return;

    await bootstrap();
  });

  createEffect(() => {
    const init = sdk.initData();
    if (!init) return;

    batch(() => {
      if (init.currentSessionId) {
        setCurrentSessionIdInternal(init.currentSessionId);
      }
    });
  });

  onCleanup(() => {
    const cleanup = sseCleanup();
    if (cleanup) {
      cleanup();
    }
  });

  return {
    store,
    messages,
    sessions,
    agents,
    permissions,
    currentSessionId,
    setCurrentSessionId,
    isThinking,
    setThinking: store.setThinking,
    sessionError,
    setSessionError: store.setSessionError,
    contextInfo,
    fileChanges,
    status: store.status,
    isReady: sdk.isReady,
    workspaceRoot: sdk.workspaceRoot,
    reconnect,
    bootstrap,
  };
}
