import { createSignal, createMemo, Show, onMount, onCleanup, createEffect, For } from "solid-js";
import { InputBar } from "./components/InputBar";
import { MessageList } from "./components/MessageList";
import { TopBar } from "./components/TopBar";
import { ContextIndicator } from "./components/ContextIndicator";
import { FileChangesSummary } from "./components/FileChangesSummary";
import { PermissionPrompt } from "./components/PermissionPrompt";
import { useOpenCode, type Event as OpenCodeEvent, type Session as SDKSession, type Agent as SDKAgent, type PromptPartInput } from "./hooks/useOpenCode";
import { applyPartUpdate, applyMessageUpdate } from "./utils/messageUtils";
import type { Message, Agent, Session, Permission, ContextInfo, FileChangesInfo, MessagePart, IncomingMessage } from "./types";
import { parseHostMessage } from "./types";

export interface QueuedMessage {
  id: string;
  text: string;
  agent: string | null;
  attachments: SelectionAttachment[];
}
interface SelectionAttachment {
  id: string;
  filePath: string;
  fileUrl: string;
  startLine?: number;
  endLine?: number;
}
import { vscode } from "./utils/vscode";

const DEBUG = false;
const NEW_SESSION_KEY = "__new__";

function App() {
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [thinkingSessions, setThinkingSessions] = createSignal<Set<string>>(new Set());
  const [agents, setAgents] = createSignal<Agent[]>([]);
  const [defaultAgent, setDefaultAgent] = createSignal<string | null>(null);
  const [sessions, setSessions] = createSignal<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = createSignal<string | null>(null);
  const [currentSessionTitle, setCurrentSessionTitle] = createSignal<string>("New Session");
  const [contextInfo, setContextInfo] = createSignal<ContextInfo | null>(null);
  const [fileChanges, setFileChanges] = createSignal<FileChangesInfo | null>(null);
  const [currentModelContextLimit, setCurrentModelContextLimit] = createSignal<number>(200000);
  
  // Per-session drafts and agent selection
  const [drafts, setDrafts] = createSignal<Map<string, string>>(new Map());
  const [sessionAgents, setSessionAgents] = createSignal<Map<string, string>>(new Map());
  const [selectionAttachmentsBySession, setSelectionAttachmentsBySession] = createSignal<
    Map<string, SelectionAttachment[]>
  >(new Map());
  
  // Pending permissions
  const [pendingPermissions, setPendingPermissions] = createSignal<Map<string, Permission>>(new Map());
  
  // Editing state for previous messages
  const [editingMessageId, setEditingMessageId] = createSignal<string | null>(null);
  const [editingText, setEditingText] = createSignal<string>("");
  
  // Message queue for queuing messages while generating
  const [messageQueue, setMessageQueue] = createSignal<QueuedMessage[]>([]);
  
  // Session errors (shown inline like tool call errors)
  const [sessionErrors, setSessionErrors] = createSignal<Map<string, string>>(new Map());

  // Get SDK hook
  const {
    isReady: sdkIsReady,
    workspaceRoot: sdkWorkspaceRoot,
    initData,
    listSessions,
    getSession,
    createSession,
    getAgents,
    getMessages,
    getConfig,
    abortSession,
    sendPrompt,
    subscribeToEvents,
    respondToPermission,
    revertToMessage,
    client,
    hostError,
    setHostError,
    clearHostError,
  } = useOpenCode();

  // Get the current session key for drafts/agents
  const sessionKey = () => currentSessionId() || NEW_SESSION_KEY;

  // Current input for the active session
  const input = () => drafts().get(sessionKey()) || "";
  const setInput = (value: string) => {
    const key = sessionKey();
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(key, value);
      return next;
    });
  };

  // Current agent for the active session
  const selectedAgent = () => sessionAgents().get(sessionKey()) || defaultAgent();
  const setSelectedAgent = (agent: string | null) => {
    if (!agent) return;
    const key = sessionKey();
    setSessionAgents((prev) => {
      const next = new Map(prev);
      next.set(key, agent);
      return next;
    });
  };

  const selectionAttachments = () => selectionAttachmentsBySession().get(sessionKey()) || [];
  const setSelectionAttachmentsForKey = (
    key: string,
    value: SelectionAttachment[] | ((prev: SelectionAttachment[]) => SelectionAttachment[])
  ) => {
    setSelectionAttachmentsBySession((prev) => {
      const next = new Map(prev);
      const current = next.get(key) || [];
      const updated = typeof value === "function" ? value(current) : value;
      next.set(key, updated);
      return next;
    });
  };
  const setSelectionAttachments = (
    value: SelectionAttachment[] | ((prev: SelectionAttachment[]) => SelectionAttachment[])
  ) => {
    setSelectionAttachmentsForKey(sessionKey(), value);
  };

  const getFilename = (filePath: string) => {
    const normalized = filePath.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts[parts.length - 1] || filePath;
  };

  const formatSelectionLabel = (attachment: SelectionAttachment) => {
    const filename = getFilename(attachment.filePath);
    if (attachment.startLine && attachment.endLine && attachment.startLine !== attachment.endLine) {
      return `${filename} L${attachment.startLine}-${attachment.endLine}`;
    }
    if (attachment.startLine) {
      return `${filename} L${attachment.startLine}`;
    }
    return filename;
  };

  const buildSelectionParts = (attachments: SelectionAttachment[]): PromptPartInput[] => {
    return attachments.map((attachment) => {
      const url = new URL(attachment.fileUrl);
      if (attachment.startLine) {
        const start = attachment.endLine
          ? Math.min(attachment.startLine, attachment.endLine)
          : attachment.startLine;
        const end = attachment.endLine
          ? Math.max(attachment.startLine, attachment.endLine)
          : attachment.startLine;
        url.searchParams.set("start", String(start));
        url.searchParams.set("end", String(end));
      }
      return {
        type: "file" as const,
        mime: "text/plain",
        url: url.toString(),
        filename: getFilename(attachment.filePath),
      };
    });
  };

  const attachmentChips = createMemo(() =>
    selectionAttachments().map((attachment) => ({
      id: attachment.id,
      label: formatSelectionLabel(attachment),
      title: attachment.filePath,
    }))
  );

  const hasMessages = createMemo(() =>
    messages().some((m) => m.type === "user" || m.type === "assistant")
  );

  const isThinking = () => {
    const sessionId = currentSessionId();
    return sessionId ? thinkingSessions().has(sessionId) : false;
  };

  const setIsThinking = (sessionId: string, thinking: boolean) => {
    setThinkingSessions((prev) => {
      const next = new Set(prev);
      if (thinking) {
        next.add(sessionId);
      } else {
        next.delete(sessionId);
      }
      return next;
    });
  };

  // Find permissions that don't have matching tool calls (standalone permissions)
  const standalonePermissions = createMemo(() => {
    const perms = pendingPermissions();
    const msgs = messages();
    const result: Permission[] = [];
    
    console.log("[App] standalonePermissions check:", {
      pendingPermissionsCount: perms.size,
      permissions: Array.from(perms.entries()).map(([k, p]) => ({ 
        key: k, 
        id: p.id, 
        permission: p.permission, 
        toolCallID: p.tool?.callID 
      })),
    });
    
    // Collect all callIDs from tool parts in messages
    const toolCallIDs = new Set<string>();
    for (const msg of msgs) {
      if (msg.parts) {
        for (const part of msg.parts) {
          if (part.type === "tool" && part.callID) {
            toolCallIDs.add(part.callID);
          }
        }
      }
    }
    
    console.log("[App] toolCallIDs found:", Array.from(toolCallIDs));
    
    // Find permissions that don't match any tool call
    // Since we now tie permissions to tool calls via tool.callID,
    // all permissions should show up in their respective tool calls
    // So standalone permissions are now rare/unused
    for (const [key, perm] of perms.entries()) {
      if (perm.tool?.callID && toolCallIDs.has(perm.tool.callID)) {
        // This permission has a matching tool call, skip it
        console.log("[App] Skipping permission with matching tool call:", perm.id, perm.tool.callID);
        continue;
      }
      console.log("[App] Found standalone permission:", perm.id, perm.permission, perm.tool?.callID);
      result.push(perm);
    }
    
    console.log("[App] Standalone permissions result:", result.length);
    return result;
  });

  const sessionsToShow = createMemo(() => {
    const root = sdkWorkspaceRoot();
    const currentId = currentSessionId();
    
    return sessions()
      .filter(s => {
        // Only list sessions with primary agents (no parentID)
        if (s.parentID) return false;
        
        // Filter to sessions in the same repo/worktree
        if (root && s.directory !== root) return false;
        
        // Filter out the current session from the switcher list
        return s.id !== currentId;
      })
      // Sort by edited time (updated) instead of started time (created)
      .sort((a, b) => b.time.updated - a.time.updated);
  });

  // Helper: check if title is default timestamp-based
  const isDefaultTitle = (title: string) => /^(New session|Child session) - \d{4}-\d{2}-\d{2}T/.test(title);

  // Helper: map legacy/SDK messages to UI format
  function mapMessagesToUI(incomingMessages: unknown[]): Message[] {
    return incomingMessages.map((raw: unknown) => {
      const r = raw as Record<string, unknown>;
      const m = (r?.info ?? r) as Record<string, unknown>;
      const parts = (r?.parts ?? m?.parts ?? []) as MessagePart[];
      const textParts = Array.isArray(parts)
        ? parts.filter(
            (p) =>
              p?.type === "text" &&
              typeof p.text === "string" &&
              !(p as { synthetic?: boolean }).synthetic &&
              !(p as { ignored?: boolean }).ignored
          )
        : [];
      const text =
        (m?.text as string) ??
        (textParts.length ? textParts.map((p) => p.text as string).join("\n") : "");
      const role = (m?.role as string) ?? "assistant";
      let normalizedParts = parts;
      if (role === "user") {
        normalizedParts = parts.filter(
          (p) =>
            p.type !== "text" ||
            (!(p as { synthetic?: boolean }).synthetic && !(p as { ignored?: boolean }).ignored)
        );
      }
      return {
        id: m.id as string,
        type: role === "user" ? "user" : "assistant",
        text,
        parts: normalizedParts,
      } as Message;
    });
  }

  onMount(() => {
    const handleHostMessage = (event: MessageEvent) => {
      const parsed = parseHostMessage(event.data);
      if (!parsed) return;
      if (parsed.type !== "editor-selection") return;

      const startLine = parsed.selection?.startLine;
      const endLine = parsed.selection?.endLine ?? startLine;
      const normalizedStart =
        startLine !== undefined && endLine !== undefined ? Math.min(startLine, endLine) : startLine;
      const normalizedEnd =
        startLine !== undefined && endLine !== undefined ? Math.max(startLine, endLine) : endLine;

      setSelectionAttachments((prev) => {
        if (
          prev.some(
            (item) =>
              item.fileUrl === parsed.fileUrl &&
              item.startLine === normalizedStart &&
              item.endLine === normalizedEnd
          )
        ) {
          return prev;
        }
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            filePath: parsed.filePath,
            fileUrl: parsed.fileUrl,
            startLine: normalizedStart,
            endLine: normalizedEnd,
          },
        ];
      });
    };

    window.addEventListener("message", handleHostMessage);
    onCleanup(() => window.removeEventListener("message", handleHostMessage));
  });

  // Initialize from initData when SDK is ready
  createEffect(async () => {
    if (!sdkIsReady()) return;
    const init = initData();
    if (!init) return;

    // Restore current session
    const sessionId = init.currentSessionId ?? null;
    const title = init.currentSessionTitle ?? "New Session";
    setCurrentSessionId(sessionId);
    setCurrentSessionTitle(isDefaultTitle(title) ? "New Session" : title);

    // Load messages for current session
    if (sessionId && init.currentSessionMessages && init.currentSessionMessages.length > 0) {
      const msgs = mapMessagesToUI(init.currentSessionMessages);
      setMessages(msgs);

      // Extract agent from last user message
      const lastUserMsg = [...init.currentSessionMessages].reverse().find((raw: unknown) => {
        const r = raw as Record<string, unknown>;
        const m = (r?.info ?? r) as Record<string, unknown>;
        return m?.role === "user";
      });
      if (lastUserMsg) {
        const info = ((lastUserMsg as Record<string, unknown>)?.info ?? lastUserMsg) as Record<string, unknown>;
        if (info?.agent) {
          setSessionAgents((prev) => {
            const next = new Map(prev);
            next.set(sessionId, info.agent as string);
            return next;
          });
        }
      }
    }
  });

  // Load agents when SDK is ready
  createEffect(async () => {
    if (!sdkIsReady()) return;
    try {
      const res = await getAgents();
      const agentList = (res?.data ?? []) as Agent[];
      // Filter to primary/all agents
      const filteredAgents = agentList.filter(a => a.mode === "primary" || a.mode === "all");
      setAgents(filteredAgents);

      // Use persisted default from extension, or first agent
      const init = initData();
      const persistedDefault = init?.defaultAgent;
      if (persistedDefault && filteredAgents.some(a => a.name === persistedDefault)) {
        setDefaultAgent(persistedDefault);
      } else if (!defaultAgent() && filteredAgents.length > 0) {
        setDefaultAgent(filteredAgents[0].name);
      }
    } catch (err) {
      console.error("[App] Failed to load agents:", err);
    }
  });

  // Load sessions when SDK is ready
  createEffect(async () => {
    if (!sdkIsReady()) return;
    await refreshSessions();
  });

  // Refresh sessions function
  async function refreshSessions() {
    try {
      const res = await listSessions();
      const sessionList = (res?.data ?? []) as Session[];
      setSessions(sessionList);
    } catch (err) {
      console.error("[App] Failed to load sessions:", err);
    }
  }

  // Update context info from assistant message tokens
  async function updateContextInfo(tokens: Record<string, unknown>, modelID: string, providerID: string) {
    try {
      const c = client();
      if (!c) return;

      // Try to get model context limit from config
      const configResult = await c.config.providers();
      const providers = configResult?.data as Record<string, { models?: Record<string, { limit?: { context?: number } }> }> | undefined;
      const contextLimit = providers?.[providerID]?.models?.[modelID]?.limit?.context;
      if (contextLimit) {
        setCurrentModelContextLimit(contextLimit);
      }

      const cache = tokens.cache as { read?: number } | undefined;
      const usedTokens = ((tokens.input as number) || 0) + ((tokens.output as number) || 0) + (cache?.read || 0);
      
      if (usedTokens === 0) return;
      
      const limit = currentModelContextLimit();
      const percentage = Math.min(100, (usedTokens / limit) * 100);

      setContextInfo({
        usedTokens,
        limitTokens: limit,
        percentage,
      });
    } catch (error) {
      console.error("[App] Error updating context info:", error);
    }
  }

  // Handle SSE events
  function handleEvent(event: OpenCodeEvent) {
    console.log("[App] Received SSE event:", event.type);
    
    const activeSessionId = currentSessionId();

    // Helper to get session ID from event
    const getEventSessionId = (e: OpenCodeEvent): string | undefined => {
      const props = (e as unknown as { properties: Record<string, unknown> }).properties;
      return (props?.sessionID as string) ??
             (props?.info as Record<string, unknown>)?.sessionID as string ??
             ((props?.part as Record<string, unknown>)?.sessionID as string) ??
             ((props?.info as Record<string, unknown>)?.id === activeSessionId ? activeSessionId : undefined);
    };

    const evSessionId = getEventSessionId(event);

    // Filter events for current session only (for message/part events)
    const shouldFilterBySession = ["message.updated", "message.removed", "message.part.updated", "message.part.removed"].includes(event.type);
    if (shouldFilterBySession && activeSessionId && evSessionId && evSessionId !== activeSessionId) {
      if (DEBUG) console.log("[App] Ignoring event for inactive session:", evSessionId);
      return;
    }

    if (DEBUG) console.log("[App] SSE event:", event.type, event);

    // Handle permission.asked (same as permission.updated)
    // Note: permission.asked is not in the SDK Event type yet, so we cast to string
    const eventType = event.type as string;
    if (eventType === "permission.asked" || eventType === "permission.updated") {
      const permission = (event as unknown as { properties: Permission }).properties;
      console.log("[App] Permission required:", permission);
      // Use tool.callID if available (ties permission to specific tool call)
      // Otherwise use permission.id (standalone permission)
      const key = permission.tool?.callID || permission.id;
      setPendingPermissions((prev) => {
        const next = new Map(prev);
        next.set(key, permission);
        return next;
      });
      return;
    }

    switch (event.type) {
      case "message.part.updated": {
        const props = (event as unknown as { properties: { part: MessagePart & { messageID: string }; delta?: string } }).properties;
        const part = props.part;
        if (DEBUG) console.log("[App] Part update:", part);
        setMessages((prev) => applyPartUpdate(prev, part));
        
        // Clear session error on successful message
        const sessionId = evSessionId || activeSessionId;
        if (sessionId) {
          setSessionErrors((prev) => {
            const next = new Map(prev);
            next.delete(sessionId);
            return next;
          });
        }
        break;
      }

      case "message.updated": {
        const props = (event as unknown as { properties: { info: IncomingMessage & { tokens?: Record<string, unknown>; modelID?: string; providerID?: string } } }).properties;
        const info = props.info;
        if (DEBUG) console.log("[App] Message update:", info);
        setMessages((prev) => applyMessageUpdate(prev, info));

        // Update context info for assistant messages
        if (info.role === "assistant" && info.tokens) {
          updateContextInfo(info.tokens, info.modelID || "", info.providerID || "");
        }
        break;
      }

      case "message.removed": {
        const props = (event as unknown as { properties: { messageID: string } }).properties;
        console.log("[App] Message removed:", props.messageID);
        setMessages((prev) => prev.filter((m) => m.id !== props.messageID));
        break;
      }

      case "session.idle": {
        const sessionId = evSessionId || activeSessionId;
        console.log("[App] Session idle - streaming complete", sessionId);
        if (sessionId) setIsThinking(sessionId, false);
        // Process next queued message if any
        processNextQueuedMessage();
        break;
      }

      case "session.updated": {
        const props = (event as unknown as { properties: { info: Session } }).properties;
        const session = props.info;
        
        // Update session title if it changed
        if (session.id === activeSessionId && session.title && !isDefaultTitle(session.title)) {
          setCurrentSessionTitle(session.title);
        }

        // Update sessions list
        setSessions((prev) => prev.map((s) => s.id === session.id ? { ...s, ...session } : s));

        // Update file changes from session summary
        if (session.summary?.diffs) {
          const diffs = session.summary.diffs;
          setFileChanges({
            fileCount: diffs.length,
            additions: diffs.reduce((sum, d) => sum + (d.additions || 0), 0),
            deletions: diffs.reduce((sum, d) => sum + (d.deletions || 0), 0),
          });
        }
        break;
      }

      case "session.created": {
        const props = (event as unknown as { properties: { info: Session } }).properties;
        const session = props.info;
        setSessions((prev) => {
          if (prev.some((s) => s.id === session.id)) return prev;
          return [...prev, session];
        });
        break;
      }

      case "permission.replied": {
        const props = (event as unknown as { properties: { permissionID: string } }).properties;
        console.log("[App] Permission replied:", props.permissionID);
        break;
      }

      case "session.error": {
        const props = (event as unknown as { properties: { error?: { data?: { message?: string } } } }).properties;
        const errorMessage = props.error?.data?.message || "Unknown error";
        const sessionId = evSessionId || activeSessionId;
        console.error("[App] Session error:", errorMessage);
        if (sessionId) {
          setIsThinking(sessionId, false);
          setSessionErrors((prev) => {
            const next = new Map(prev);
            next.set(sessionId, errorMessage);
            return next;
          });
        }
        break;
      }

      default:
        if (DEBUG) console.log("[App] Unhandled event:", event.type);
    }
  }

  // Start SSE subscription
  onMount(() => {
    let cleanup: (() => void) | undefined;

    const startSSE = async () => {
      // Wait for SDK to be ready
      while (!sdkIsReady()) {
        await new Promise((r) => setTimeout(r, 100));
      }

      try {
        console.log("[App] Starting SSE subscription");
        cleanup = subscribeToEvents((event) => {
          handleEvent(event);
        });
      } catch (err) {
        console.error("[App] SSE subscription failed:", err);
      }
    };

    startSSE();

    onCleanup(() => {
      cleanup?.();
    });
  });

  // Handlers
  const handleSubmit = async () => {
    const text = input().trim();
    if (!text || !sdkIsReady()) return;

    const agent = agents().some((a) => a.name === selectedAgent())
      ? selectedAgent()
      : null;
    const attachmentsKey = sessionKey();
    const attachments = selectionAttachments();
    const extraParts = buildSelectionParts(attachments);

    // Ensure we have a session
    let sessionId = currentSessionId();
    if (!sessionId) {
      try {
        const res = await createSession();
        const newSession = res?.data as Session | undefined;
        if (!newSession?.id) {
          console.error("[App] Failed to create session");
          return;
        }
        sessionId = newSession.id;
        setCurrentSessionId(sessionId);
        setCurrentSessionTitle("New Session");
        setSessions((prev) => [...prev, newSession]);
      } catch (err) {
        console.error("[App] Failed to create session:", err);
        return;
      }
    }

    setInput("");
    setIsThinking(sessionId, true);

    try {
      await sendPrompt(sessionId, text, agent, extraParts);
      if (attachments.length > 0) {
        setSelectionAttachmentsForKey(attachmentsKey, []);
      }
    } catch (err) {
      console.error("[App] sendPrompt failed:", err);
      const errorMessage = (err as Error).message;
      const lowerMsg = errorMessage.toLowerCase();
      
      // Ignore "Proxy fetch timed out" and "Aborted" errors
      // These are expected because sendPrompt returns immediately but the session continues via SSE
      if (lowerMsg.includes("proxy fetch timed out") || lowerMsg.includes("aborted")) {
        console.log("[App] Ignoring expected timeout/abort error");
        return;
      }
      
      // For real errors, show them inline
      setIsThinking(sessionId, false);
      setSessionErrors((prev) => {
        const next = new Map(prev);
        next.set(sessionId, errorMessage);
        return next;
      });
    }
  };

  const processNextQueuedMessage = async () => {
    const queue = messageQueue();
    if (queue.length === 0) return;
    
    const [next, ...rest] = queue;
    setMessageQueue(rest);
    
    const sessionId = currentSessionId();
    if (!sessionId || !sdkIsReady()) return;
    
    setIsThinking(sessionId, true);
    
    try {
      const extraParts = buildSelectionParts(next.attachments);
      await sendPrompt(sessionId, next.text, next.agent, extraParts);
    } catch (err) {
      console.error("[App] Queue sendPrompt failed:", err);
      const errorMessage = (err as Error).message;
      const lowerMsg = errorMessage.toLowerCase();
      
      // Ignore "Proxy fetch timed out" and "Aborted" errors
      if (lowerMsg.includes("proxy fetch timed out") || lowerMsg.includes("aborted")) {
        console.log("[App] Ignoring expected timeout/abort error");
        return;
      }
      
      // For real errors, show them inline and clear queue
      setIsThinking(sessionId, false);
      setMessageQueue([]);
      setSessionErrors((prev) => {
        const next = new Map(prev);
        next.set(sessionId, errorMessage);
        return next;
      });
    }
  };

  const handleQueueMessage = () => {
    const text = input().trim();
    if (!text || !sdkIsReady()) return;
    
    const agent = agents().some((a) => a.name === selectedAgent())
      ? selectedAgent()
      : null;
    const attachmentsKey = sessionKey();
    const attachments = selectionAttachments();
    
    const queuedMessage: QueuedMessage = {
      id: crypto.randomUUID(),
      text,
      agent,
      attachments,
    };
    
    setMessageQueue((prev) => [...prev, queuedMessage]);
    setInput("");
    if (attachments.length > 0) {
      setSelectionAttachmentsForKey(attachmentsKey, []);
    }
  };

  const handleRemoveFromQueue = (id: string) => {
    setMessageQueue((prev) => prev.filter((m) => m.id !== id));
  };

  const handleEditQueuedMessage = (id: string) => {
    const queue = messageQueue();
    const index = queue.findIndex((m) => m.id === id);
    if (index === -1) return;
    
    const message = queue[index];
    // Remove this message and all after it
    setMessageQueue(queue.slice(0, index));
    // Put the message text in the input
    setInput(message.text);
    setSelectionAttachments(message.attachments);
    // Set the agent if different
    if (message.agent) {
      setSelectedAgent(message.agent);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setSelectionAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSessionSelect = async (sessionId: string) => {
    if (!sdkIsReady()) return;
    
    setCurrentSessionId(sessionId);
    setFileChanges(null);
    setContextInfo(null);
    setMessageQueue([]); // Clear queue on session switch

    try {
      // Load messages
      const res = await getMessages(sessionId);
      const sdkMessages = (res?.data ?? []) as unknown[];
      setMessages(mapMessagesToUI(sdkMessages));

      // Extract agent from last user message
      const lastUser = [...sdkMessages].reverse().find((m: unknown) => {
        const msg = m as Record<string, unknown>;
        const info = (msg?.info ?? msg) as Record<string, unknown>;
        return info?.role === "user";
      });
      if (lastUser) {
        const info = ((lastUser as Record<string, unknown>)?.info ?? lastUser) as Record<string, unknown>;
        if (info?.agent) {
          setSessionAgents((prev) => {
            const next = new Map(prev);
            next.set(sessionId, info.agent as string);
            return next;
          });
        }
      }

      // Get session title
      const sessionRes = await getSession(sessionId);
      const session = sessionRes?.data as Session | undefined;
      if (session?.title) {
        setCurrentSessionTitle(isDefaultTitle(session.title) ? "New Session" : session.title);
      }

      // Update file changes if available
      if (session?.summary?.diffs) {
        const diffs = session.summary.diffs;
        setFileChanges({
          fileCount: diffs.length,
          additions: diffs.reduce((sum, d) => sum + (d.additions || 0), 0),
          deletions: diffs.reduce((sum, d) => sum + (d.deletions || 0), 0),
        });
      }

      // Find last assistant message to restore context info
      const lastAssistantMsg = [...sdkMessages].reverse().find((m: unknown) => {
        const msg = m as Record<string, unknown>;
        const info = (msg?.info ?? msg) as Record<string, unknown>;
        return info?.role === "assistant" && info?.tokens;
      });
      if (lastAssistantMsg) {
        const info = ((lastAssistantMsg as Record<string, unknown>)?.info ?? lastAssistantMsg) as Record<string, unknown>;
        if (info.tokens) {
          updateContextInfo(
            info.tokens as Record<string, unknown>,
            (info.modelID as string) || "",
            (info.providerID as string) || ""
          );
        }
      }
    } catch (err) {
      console.error("[App] Failed to switch session:", err);
    }
  };

  const handleNewSession = async () => {
    if (!sdkIsReady()) return;
    try {
      const res = await createSession();
      const newSession = res?.data as Session | undefined;
      if (!newSession?.id) return;

      setSessions((prev) => [...prev, newSession]);
      setCurrentSessionId(newSession.id);
      setCurrentSessionTitle("New Session");
      setMessages([]);
      setFileChanges(null);
      setContextInfo(null);
      setMessageQueue([]);
    } catch (err) {
      console.error("[App] Failed to create session:", err);
    }
  };

  const handleCancel = async () => {
    const sessionId = currentSessionId();
    if (!sdkIsReady() || !sessionId) return;
    try {
      await abortSession(sessionId);
    } finally {
      setIsThinking(sessionId, false);
    }
  };

  const handleAgentChange = (agent: string | null) => {
    setSelectedAgent(agent);
    // Persist as global default for new sessions
    if (agent && !currentSessionId()) {
      vscode.postMessage({ type: "agent-changed", agent });
    }
  };

  const handleStartEdit = (messageId: string, text: string) => {
    setEditingMessageId(messageId);
    setEditingText(text);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const handleSubmitEdit = async (newText: string) => {
    const messageId = editingMessageId();
    const sessionId = currentSessionId();
    if (!messageId || !sessionId || !newText.trim() || !sdkIsReady()) return;

    const agent = agents().some((a) => a.name === selectedAgent())
      ? selectedAgent()
      : null;

    // Optimistically truncate messages
    const messageIndex = messages().findIndex((m) => m.id === messageId);
    if (messageIndex !== -1) {
      setMessages(messages().slice(0, messageIndex));
    }

    setIsThinking(sessionId, true);
    setEditingMessageId(null);
    setEditingText("");

    try {
      await revertToMessage(sessionId, messageId);
      await sendPrompt(sessionId, newText.trim(), agent, []);
    } catch (err) {
      console.error("[App] Failed to edit message:", err);
      const errorMessage = (err as Error).message;
      const lowerMsg = errorMessage.toLowerCase();
      
      // Ignore "Proxy fetch timed out" and "Aborted" errors
      if (lowerMsg.includes("proxy fetch timed out") || lowerMsg.includes("aborted")) {
        console.log("[App] Ignoring expected timeout/abort error");
        return;
      }
      
      // For real errors, show them inline
      setIsThinking(sessionId, false);
      setSessionErrors((prev) => {
        const next = new Map(prev);
        next.set(sessionId, `Error editing message: ${errorMessage}`);
        return next;
      });
    }
  };

  const handlePermissionResponse = async (
    permissionId: string,
    response: "once" | "always" | "reject"
  ) => {
    console.log(`[App] Permission response: ${response} for ${permissionId}`);

    const perms = pendingPermissions();
    let permission: Permission | undefined;
    for (const [, perm] of perms.entries()) {
      if (perm.id === permissionId) {
        permission = perm;
        break;
      }
    }

    const sessionId = permission?.sessionID || currentSessionId();
    if (!sessionId || !sdkIsReady()) {
      console.error("[App] Cannot respond to permission: no session ID");
      return;
    }

    try {
      await respondToPermission(sessionId, permissionId, response);
    } finally {
      setPendingPermissions((prev) => {
        const next = new Map(prev);
        for (const [key, perm] of next.entries()) {
          if (perm.id === permissionId) {
            next.delete(key);
            break;
          }
        }
        return next;
      });
    }
  };

  return (
    <div class={`app ${hasMessages() ? "app--has-messages" : ""}`}>
      <Show when={hostError()}>
        <div class="error-banner">
          <span class="error-banner__message">{hostError()}</span>
          <button class="error-banner__dismiss" onClick={clearHostError} aria-label="Dismiss error">×</button>
        </div>
      </Show>
      
      <TopBar
        sessions={sessionsToShow()}
        currentSessionId={currentSessionId()}
        currentSessionTitle={currentSessionTitle()}
        onSessionSelect={handleSessionSelect}
        onNewSession={handleNewSession}
        onRefreshSessions={refreshSessions}
      />

      <Show when={!hasMessages()}>
        <Show when={standalonePermissions().length > 0}>
          <div class="standalone-permissions">
            <For each={standalonePermissions()}>
              {(permission) => (
                <PermissionPrompt
                  permission={permission}
                  onResponse={handlePermissionResponse}
                />
              )}
            </For>
          </div>
        </Show>
        
        <InputBar
          value={input()}
          onInput={setInput}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onQueue={handleQueueMessage}
          disabled={!sdkIsReady()}
          isThinking={isThinking()}
          selectedAgent={selectedAgent()}
          agents={agents()}
          onAgentChange={handleAgentChange}
          queuedMessages={messageQueue()}
          onRemoveFromQueue={handleRemoveFromQueue}
          onEditQueuedMessage={handleEditQueuedMessage}
          attachments={attachmentChips()}
          onRemoveAttachment={handleRemoveAttachment}
        />
      </Show>

      <MessageList
        messages={messages()}
        isThinking={isThinking()}
        workspaceRoot={sdkWorkspaceRoot()}
        pendingPermissions={pendingPermissions()}
        onPermissionResponse={handlePermissionResponse}
        editingMessageId={editingMessageId()}
        editingText={editingText()}
        onStartEdit={handleStartEdit}
        onCancelEdit={handleCancelEdit}
        onSubmitEdit={handleSubmitEdit}
        onEditTextChange={setEditingText}
        sessionError={currentSessionId() ? sessionErrors().get(currentSessionId()!) : null}
      />

      <Show when={hasMessages()}>
        <div class="input-divider" />
        <div class="input-status-row">
          <FileChangesSummary fileChanges={fileChanges()} />
          <ContextIndicator contextInfo={contextInfo()} />
        </div>
        
        <Show when={standalonePermissions().length > 0}>
          <div class="standalone-permissions">
            <For each={standalonePermissions()}>
              {(permission) => (
                <PermissionPrompt
                  permission={permission}
                  onResponse={handlePermissionResponse}
                />
              )}
            </For>
          </div>
        </Show>
        
        <InputBar
          value={input()}
          onInput={setInput}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onQueue={handleQueueMessage}
          disabled={!sdkIsReady()}
          isThinking={isThinking()}
          selectedAgent={selectedAgent()}
          agents={agents()}
          onAgentChange={handleAgentChange}
          queuedMessages={messageQueue()}
          onRemoveFromQueue={handleRemoveFromQueue}
          onEditQueuedMessage={handleEditQueuedMessage}
          attachments={attachmentChips()}
          onRemoveAttachment={handleRemoveAttachment}
        />
      </Show>
    </div>
  );
}

export default App;
