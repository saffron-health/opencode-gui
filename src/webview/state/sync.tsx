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
import type { QuestionRequest } from "@opencode-ai/sdk/v2/client";
import { type SyncState, type SyncStatus, createEmptyState } from "./types";
import { applyEvent, type EventHandlerContext } from "./eventHandlers";
import { fetchBootstrapData, commitBootstrapData } from "./bootstrap";
import { logger } from "../utils/logger";

export type { SyncStatus } from "./types";

function collectSessionTreeIds(
  sessions: SyncState["sessions"],
  rootId: string
): string[] {
  const seen = new Set<string>([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const session of sessions) {
      if (session.parentID !== currentId || seen.has(session.id)) continue;
      seen.add(session.id);
      queue.push(session.id);
    }
  }

  return Array.from(seen);
}

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

  // Event batching: queue events and flush every 30ms
  const EVENT_BATCH_MS = 30;
  const eventQueue: Event[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const eventContext: EventHandlerContext = {
    get store() { return store; },
    setStore,
    currentSessionId,
    messageToSession,
    sessionIdleCallbacks,
  };

  function flushEventQueue() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (eventQueue.length === 0) return;

    const events = eventQueue.splice(0);
    const eventTypes = events.map(e => e.type).join(", ");
    logger.debug("Flushing event queue", { count: events.length, types: eventTypes });
    batch(() => {
      for (const event of events) {
        applyEvent(event, eventContext);
      }
    });
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flushEventQueue, EVENT_BATCH_MS);
  }

  function setCurrentSessionId(id: string | null) {
    const prevId = currentSessionId();
    if (prevId && prevId !== id) {
      const prevMessages = store.message[prevId] ?? [];
      // Keep permission/question state across session switches so pending
      // prompts remain available when users return to the original session.
      batch(() => {
        setStore("message", produce((draft) => { delete draft[prevId]; }));
        setStore("part", produce((draft) => {
          for (const msg of prevMessages) { delete draft[msg.id]; }
        }));
      });
      // Clean up messageToSession mapping
      for (const msg of prevMessages) {
        messageToSession.delete(msg.id);
      }
    }
    setCurrentSessionIdInternal(id);
  }

  // Plain function (NOT createMemo) so that every reactive consumer directly
  // tracks the store proxy. A createMemo here would return the same proxy
  // reference after in-place mutations, suppressing downstream updates.
  const EMPTY_MESSAGES: Message[] = [];
  const messages = () => {
    const sessionId = currentSessionId();
    if (!sessionId) return EMPTY_MESSAGES;
    return store.message[sessionId] ?? EMPTY_MESSAGES;
  };

  // Use equals: false for arrays that may be mutated in place by SSE handlers
  const sessions = createMemo(() => store.sessions.slice(), undefined, { equals: false });
  const agents = createMemo(() => store.agents.slice(), undefined, { equals: false });

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

  const questions = createMemo(() => {
    const sessionId = currentSessionId();
    if (!sessionId) return new Map<string, QuestionRequest>();
    const questionList = store.question[sessionId] ?? [];
    const map = new Map<string, QuestionRequest>();
    for (const q of questionList) {
      map.set(q.id, q);
    }
    return map;
  });

  // Aggregate permissions across current session and its children
  const aggregatedPermissions = createMemo(() => {
    const sessionId = currentSessionId();
    if (!sessionId) return new Map<string, Permission>();

    const currentSession = store.sessions.find((s) => s.id === sessionId);
    
    // Find root session (current if no parent, otherwise its parent)
    let rootId = sessionId;
    if (currentSession?.parentID) {
      rootId = currentSession.parentID;
    }

    const relevantSessionIds = collectSessionTreeIds(store.sessions, rootId);

    // Flatten permissions from all relevant sessions
    const map = new Map<string, Permission>();
    for (const sid of relevantSessionIds) {
      const perms = store.permission[sid] ?? [];
      for (const p of perms) {
        const key = p.tool?.callID || p.id;
        map.set(key, p);
      }
    }
    return map;
  });

  // Aggregate questions across current session and its children
  const aggregatedQuestions = createMemo(() => {
    const sessionId = currentSessionId();
    if (!sessionId) return new Map<string, QuestionRequest>();

    const currentSession = store.sessions.find((s) => s.id === sessionId);

    // Find root session (current if no parent, otherwise its parent)
    let rootId = sessionId;
    if (currentSession?.parentID) {
      rootId = currentSession.parentID;
    }

    const relevantSessionIds = new Set(collectSessionTreeIds(store.sessions, rootId));
    const visibleMessageIds = new Set(messages().map((message) => message.id));

    // Flatten questions from relevant sessions.
    // Also include tool-bound questions that target currently visible messages,
    // even when their child session metadata is unavailable in store.sessions.
    const map = new Map<string, QuestionRequest>();
    for (const [sid, questionList] of Object.entries(store.question)) {
      const inRelevantSession = relevantSessionIds.has(sid);
      for (const q of questionList ?? []) {
        if (inRelevantSession) {
          map.set(q.id, q);
          continue;
        }
        const toolMessageID = q.tool?.messageID;
        if (toolMessageID && visibleMessageIds.has(toolMessageID)) {
          map.set(q.id, q);
        }
      }
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
          return;
        }
        if (startedForSession && startedForSession !== currentSessionId()) {
          return;
        }

        commitBootstrapData(data, sessionId, setStore);

        // Flush any events that arrived during bootstrap
        flushEventQueue();
        setStore("status", { status: "connected" });
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
    // Log all events for debugging
    logger.debug("SSE event received", { type: event.type, queueLength: eventQueue.length, status: store.status.status });
    
    // Log error events prominently
    if (event.type === "session.error") {
      logger.error("SSE session.error event received", { event });
    }
    
    if ((event.type as string) === "server.instance.disposed") {
      // Flush pending events before re-bootstrap
      flushEventQueue();
      logger.info("Server disposed, re-bootstrapping...");
      setBootstrapCount((c) => c + 1);
      return;
    }

    // Skip heartbeats - they carry no state and cause unnecessary batching
    if ((event.type as string) === "server.heartbeat") return;

    // Buffer events during bootstrap, queue for batched processing
    eventQueue.push(event);

    // If bootstrapping, don't schedule flush - will flush after commit
    if (store.status.status === "bootstrapping") {
      logger.debug("Event queued during bootstrap", { type: event.type, queueLength: eventQueue.length });
      return;
    }

    scheduleFlush();
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
    // Flush pending events before cleanup
    flushEventQueue();
    const cleanup = sseCleanup();
    if (cleanup) cleanup();
  });

  const getParts = (messageId: string) => store.part[messageId] ?? [];
  const getQuestionById = (requestId?: string) => {
    if (!requestId) return undefined;
    for (const questions of Object.values(store.question)) {
      const match = (questions ?? []).find((question) => question.id === requestId);
      if (match) return match;
    }
    return undefined;
  };
  const getQuestionByCallID = (callID?: string) =>
    getQuestionById(callID ? store.questionByCallID[callID] : undefined);
  const getQuestionByMessageID = (messageID?: string) =>
    getQuestionById(messageID ? store.questionByMessageID[messageID] : undefined);
  const sessionStatus = (sessionId: string) => store.sessionStatus[sessionId] ?? null;

  return {
    messages,
    sessions,
    agents,
    permissions,
    questions,
    aggregatedPermissions,
    aggregatedQuestions,
    isThinking,
    sessionError,
    sessionStatus,
    contextInfo,
    fileChanges,
    status: () => store.status,
    getParts,
    getQuestionByCallID,
    getQuestionByMessageID,

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

export const SyncContext = createContext<ReturnType<typeof createSync>>();

export function SyncProvider(props: ParentProps) {
  const value = createSync();
  return <SyncContext.Provider value={value}>{props.children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync must be used within SyncProvider");
  return context;
}

export type SyncContextValue = ReturnType<typeof createSync>;
