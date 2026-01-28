/**
 * Sync context for managing server state.
 * 
 * Uses createStore with nested objects keyed by ID for efficient updates.
 */

import {
  createSignal,
  createEffect,
  createMemo,
  onCleanup,
  batch,
  createContext,
  useContext,
  type ParentProps,
} from "solid-js";
import { createStore, produce } from "solid-js/store";
import { useOpenCode, type Event, type SSEStatus } from "../hooks/useOpenCode";
import type { Message, Permission } from "../types";
import { type SyncState, type SyncStatus, createEmptyState } from "./types";
import { applyEvent, type EventHandlerContext } from "./eventHandlers";
import { fetchBootstrapData, commitBootstrapData } from "./bootstrap";

export type { SyncStatus } from "./types";

function createSync() {
  const sdk = useOpenCode();
  const [store, setStore] = createStore<SyncState>(createEmptyState());
  const [currentSessionId, setCurrentSessionIdInternal] = createSignal<string | null>(null);
  const [sseCleanup, setSseCleanup] = createSignal<(() => void) | null>(null);
  const [bootstrapCount, setBootstrapCount] = createSignal(0);

  const inflight = new Map<string, Promise<void>>();
  let bootstrapToken = 0;
  const messageToSession = new Map<string, string>();
  const sessionIdleCallbacks = new Set<(sessionId: string) => void>();

  const eventContext: EventHandlerContext = {
    get store() { return store; },
    setStore,
    currentSessionId,
    messageToSession,
    sessionIdleCallbacks,
  };

  function setCurrentSessionId(id: string | null) {
    const prevId = currentSessionId();
    if (prevId && prevId !== id) {
      const prevMessages = store.message[prevId] ?? [];
      batch(() => {
        setStore("message", produce((draft) => { delete draft[prevId]; }));
        setStore("part", produce((draft) => {
          for (const msg of prevMessages) { delete draft[msg.id]; }
        }));
        setStore("permission", produce((draft) => { delete draft[prevId]; }));
      });
    }
    setCurrentSessionIdInternal(id);
  }

  // Derived state
  const messages = createMemo(() => {
    const sessionId = currentSessionId();
    if (!sessionId) return [];
    return store.message[sessionId] ?? [];
  });

  const sessions = createMemo(() => store.sessions);
  const agents = createMemo(() => store.agents);

  const permissions = createMemo(() => {
    const sessionId = currentSessionId();
    if (!sessionId) return new Map<string, Permission>();
    const perms = store.permission[sessionId] ?? [];
    const map = new Map<string, Permission>();
    for (const p of perms) {
      const key = p.tool?.callID || p.id;
      map.set(key, p);
    }
    return map;
  });

  const isThinking = createMemo(() => {
    const sessionId = currentSessionId();
    return sessionId ? store.thinking[sessionId] ?? false : false;
  });

  const sessionError = createMemo(() => {
    const sessionId = currentSessionId();
    return sessionId ? store.sessionError[sessionId] ?? null : null;
  });

  const contextInfo = createMemo(() => store.contextInfo);
  const fileChanges = createMemo(() => store.fileChanges);

  function setThinking(sessionId: string, thinking: boolean) {
    setStore("thinking", sessionId, thinking);
  }

  function setSessionError(sessionId: string, error: string | null) {
    if (error === null) {
      setStore("sessionError", produce((draft) => { delete draft[sessionId]; }));
    } else {
      setStore("sessionError", sessionId, error);
    }
  }

  async function bootstrap(): Promise<void> {
    const client = sdk.client();
    if (!client) {
      console.warn("[Sync] Cannot bootstrap: SDK client not ready");
      return;
    }

    const sessionId = currentSessionId();
    const workspaceRoot = sdk.workspaceRoot();
    const key = `bootstrap:${sessionId ?? "none"}`;

    const pending = inflight.get(key);
    if (pending) return pending;

    const thisToken = ++bootstrapToken;
    const startedForSession = sessionId;

    setStore("status", { status: "bootstrapping" });

    const promise = (async () => {
      try {
        const data = await fetchBootstrapData({
          client: client as Parameters<typeof fetchBootstrapData>[0]["client"],
          sessionId,
          workspaceRoot,
        });

        if (thisToken !== bootstrapToken) {
          console.log("[Sync] Bootstrap stale (token mismatch), discarding");
          return;
        }
        if (startedForSession && startedForSession !== currentSessionId()) {
          console.log("[Sync] Bootstrap stale (session changed), discarding");
          return;
        }

        commitBootstrapData(data, sessionId, setStore);
      } catch (err) {
        console.error("[Sync] Bootstrap failed:", err);
        setStore("status", { status: "error", message: (err as Error).message });
        throw err;
      }
    })();

    inflight.set(key, promise);
    promise.finally(() => inflight.delete(key));
    return promise;
  }

  function handleEvent(event: Event) {
    if ((event.type as string) === "server.instance.disposed") {
      console.log("[Sync] Server disposed, re-bootstrapping...");
      setBootstrapCount((c) => c + 1);
      return;
    }
    applyEvent(event, eventContext);
  }

  function handleStatus(status: SSEStatus) {
    if (status.status === "connecting") {
      setStore("status", { status: "connecting" });
    } else if (status.status === "connected") {
      setStore("status", { status: "connected" });
      setBootstrapCount((c) => c + 1);
    } else if (status.status === "reconnecting") {
      setStore("status", { status: "reconnecting", attempt: status.attempt ?? 0 });
    } else if (status.status === "closed") {
      setStore("status", { status: "disconnected" });
    }
  }

  function startSSE() {
    const cleanup = sseCleanup();
    if (cleanup) cleanup();

    if (!sdk.isReady()) return;

    try {
      const newCleanup = sdk.subscribeToEvents(handleEvent, handleStatus);
      setSseCleanup(() => newCleanup);
    } catch (err) {
      console.error("[Sync] Failed to start SSE:", err);
    }
  }

  function reconnect() {
    startSSE();
    setBootstrapCount((c) => c + 1);
  }

  function onSessionIdle(callback: (sessionId: string) => void): () => void {
    sessionIdleCallbacks.add(callback);
    return () => sessionIdleCallbacks.delete(callback);
  }

  // SSE startup
  let sseStarted = false;
  createEffect(() => {
    if (!sdk.isReady()) return;
    if (sseStarted) return;
    sseStarted = true;
    startSSE();
  });

  // Bootstrap on count change
  createEffect(async () => {
    const count = bootstrapCount();
    if (count === 0) return;
    if (!sdk.isReady()) return;
    await bootstrap();
  });

  // Initialize from SDK init data
  createEffect(() => {
    const init = sdk.initData();
    if (!init) return;
    if (init.currentSessionId) {
      setCurrentSessionIdInternal(init.currentSessionId);
    }
  });

  onCleanup(() => {
    const cleanup = sseCleanup();
    if (cleanup) cleanup();
  });

  return {
    messages,
    sessions,
    agents,
    permissions,
    isThinking,
    sessionError,
    contextInfo,
    fileChanges,
    status: () => store.status,

    currentSessionId,
    setCurrentSessionId,

    setThinking,
    setSessionError,
    bootstrap,
    reconnect,
    onSessionIdle,

    isReady: sdk.isReady,
    workspaceRoot: sdk.workspaceRoot,
  };
}

const SyncContext = createContext<ReturnType<typeof createSync>>();

export function SyncProvider(props: ParentProps) {
  const value = createSync();
  return <SyncContext.Provider value={value}>{props.children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync must be used within SyncProvider");
  return context;
}
