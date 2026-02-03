import { createSignal, createMemo, Show, onMount, onCleanup, createEffect, For } from "solid-js";
import { InputBar } from "./components/InputBar";
import { MessageList } from "./components/MessageList";
import { TopBar } from "./components/TopBar";
import { ContextIndicator } from "./components/ContextIndicator";
import { FileChangesSummary } from "./components/FileChangesSummary";
import { PermissionPrompt } from "./components/PermissionPrompt";
import { useOpenCode, type PromptPartInput } from "./hooks/useOpenCode";
import { useSync } from "./state/sync";
import type { FilePartInput } from "@opencode-ai/sdk/v2/client";
import type { Message, Agent, Session, Permission, FileChangesInfo, MessagePart } from "./types";
import { parseHostMessage } from "./types";

export interface QueuedMessage {
  id: string;
  text: string;
  agent: string | null;
  attachments: SelectionAttachment[];
}

// In-flight message tracking for the outbox
interface InFlightMessage {
  messageID: string;
  sessionId: string;
}
interface SelectionAttachment {
  id: string;
  filePath: string;
  fileUrl: string;
  startLine?: number;
  endLine?: number;
}
import { vscode } from "./utils/vscode";
import { Id } from "./utils/id";
import { logger } from "./utils/logger";

const NEW_SESSION_KEY = "__new__";

function App() {
  // Use the sync context for server-owned state
  const sync = useSync();
  
  // Local UI-only state
  const [defaultAgent, setDefaultAgent] = createSignal<string | null>(null);
  const [drafts, setDrafts] = createSignal<Map<string, string>>(new Map());
  const [sessionAgents, setSessionAgents] = createSignal<Map<string, string>>(new Map());
  const [selectionAttachmentsBySession, setSelectionAttachmentsBySession] = createSignal<
    Map<string, SelectionAttachment[]>
  >(new Map());
  
  // Editing state for previous messages
  const [editingMessageId, setEditingMessageId] = createSignal<string | null>(null);
  const [editingText, setEditingText] = createSignal<string>("");
  
  // Message queue for queuing messages while generating
  const [messageQueue, setMessageQueue] = createSignal<QueuedMessage[]>([]);
  
  // In-flight message tracking for outbox pattern
  const [inFlightMessage, setInFlightMessage] = createSignal<InFlightMessage | null>(null);

  // Get SDK hook for actions only
  const {
    initData,
    createSession,
    abortSession,
    sendPrompt,
    respondToPermission,
    revertToMessage,
    hostError,
    clearHostError,
  } = useOpenCode();

  // Get the current session key for drafts/agents
  const sessionKey = () => sync.currentSessionId() || NEW_SESSION_KEY;
  
  // Derive current session title from store
  const isDefaultTitle = (title: string) => /^(New session|Child session) - \d{4}-\d{2}-\d{2}T/.test(title);
  const currentSessionTitle = createMemo(() => {
    const id = sync.currentSessionId();
    if (!id) return "New Session";
    const sessions = sync.sessions();
    const session = sessions.find(s => s.id === id);
    const title = session?.title;
    return title && !isDefaultTitle(title) ? title : "New Session";
  });

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
  
  // Convenience accessors from sync store
  const messages = () => sync.messages();
  const agents = () => sync.agents();
  const sessions = () => sync.sessions();
  const pendingPermissions = () => sync.aggregatedPermissions();
  const contextInfo = () => sync.contextInfo();
  const fileChanges = () => sync.fileChanges();
  const isThinking = () => sync.isThinking();
  const sessionError = () => sync.sessionError();

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

  const buildSelectionParts = (attachments: SelectionAttachment[]): FilePartInput[] => {
    return attachments.map((attachment) => {
      const url = new URL(attachment.fileUrl);
      
      if (attachment.startLine !== undefined) {
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
        source: {
          type: "file" as const,
          path: attachment.filePath,
          text: {
            value: "",
            start: 0,
            end: 0,
          },
        },
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

  // Find permissions that should show as standalone modals (not inline with tools)
  const standalonePermissions = createMemo(() => {
    const result: Permission[] = [];
    for (const [, perm] of pendingPermissions().entries()) {
      if (!perm.tool) {
        result.push(perm);
      }
    }
    return result;
  });

  const sessionsToShow = createMemo(() => {
    const root = sync.workspaceRoot();
    const currentId = sync.currentSessionId();
    
    return sessions()
      .filter(s => {
        // Only list sessions with primary agents (no parentID)
        if (s.parentID) return false;
        
        // Filter to sessions in the same repo/worktree
        if (root && s.directory !== root) return false;
        
        return true;
      })
      // Sort by edited time (updated) instead of started time (created)
      .sort((a, b) => b.time.updated - a.time.updated);
  });

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

  // Set default agent from initData once available
  createEffect(() => {
    const init = initData();
    if (!init) return;
    
    const agentList = agents();
    const persistedDefault = init.defaultAgent;
    if (persistedDefault && agentList.some(a => a.name === persistedDefault)) {
      setDefaultAgent(persistedDefault);
    } else if (!defaultAgent() && agentList.length > 0) {
      setDefaultAgent(agentList[0].name);
    }
  });
  
  // Clear inFlightMessage when session becomes idle and trigger queue drain
  onMount(() => {
    const cleanup = sync.onSessionIdle((sessionId) => {
      const inflight = inFlightMessage();
      
      if (inflight?.sessionId !== sessionId) {
        return;
      }
      
      setInFlightMessage(null);
      
      // Schedule queue drain in a microtask to avoid interleaving with SSE batch
      queueMicrotask(() => {
        void processNextQueuedMessage();
      });
    });
    onCleanup(cleanup);
  });

  // Handlers
  const handleSubmit = async () => {
    const text = input().trim();
    if (!text || !sync.isReady()) {
      return;
    }

    const agent = agents().some((a) => a.name === selectedAgent())
      ? selectedAgent()
      : null;
    const attachmentsKey = sessionKey();
    const attachments = selectionAttachments();
    const extraParts = buildSelectionParts(attachments);

    // Generate sortable client-side messageID for idempotent sends
    const messageID = Id.ascending("message");

    // Ensure we have a session
    let sessionId = sync.currentSessionId();
    if (!sessionId) {
      try {
        const res = await createSession();
        const newSession = res?.data as Session | undefined;
        if (!newSession?.id) {
          console.error("[App] Failed to create session");
          return;
        }
        sessionId = newSession.id;
        sync.setCurrentSessionId(sessionId);
      } catch (err) {
        console.error("[App] Failed to create session:", err);
        return;
      }
    }

    setInput("");
    sync.setThinking(sessionId, true);

    // Track this message as in-flight
    setInFlightMessage({ messageID, sessionId });

    logger.info("Sending prompt", { sessionId, messageID, textLen: text.length });

    try {
      const result = await sendPrompt(sessionId, text, agent, extraParts, messageID);
      
      // Log the full result for debugging
      logger.info("sendPrompt result", { 
        hasError: !!result?.error, 
        hasData: !!result?.data,
        response: result?.response?.status,
      });
      
      // Check for SDK error in result (SDK doesn't throw by default)
      if (result?.error) {
        // Log full error structure for debugging
        logger.error("sendPrompt returned error", { 
          error: result.error,
          response: result?.response,
        });
        
        // Extract error message from nested structure: result.error may be { error: { data: { message } } } or { data: { message } }
        const errorData = result.error as { data?: { message?: string }; error?: { data?: { message?: string } } };
        const errorMessage = 
          errorData.data?.message || 
          errorData.error?.data?.message || 
          (typeof errorData === 'string' ? errorData : JSON.stringify(errorData)) ||
          "Unknown error";
        sync.setThinking(sessionId, false);
        setInFlightMessage(null);
        sync.setSessionError(sessionId, errorMessage);
        return;
      }
      
      if (attachments.length > 0) {
        setSelectionAttachmentsForKey(attachmentsKey, []);
      }
    } catch (err) {
      logger.error("sendPrompt exception", { error: String(err), stack: (err as Error).stack });
      const errorMessage = (err as Error).message;
      
      // Show all errors inline and clear in-flight
      sync.setThinking(sessionId, false);
      setInFlightMessage(null);
      sync.setSessionError(sessionId, errorMessage);
    }
  };

  const processNextQueuedMessage = async () => {
    const queue = messageQueue();
    const inflight = inFlightMessage();
    const sessionId = sync.currentSessionId();
    
    if (queue.length === 0) {
      return;
    }
    
    // Don't process if there's already an in-flight message
    if (inflight) {
      return;
    }
    
    if (!sessionId || !sync.isReady()) {
      return;
    }
    
    const [next, ...rest] = queue;
    
    // Generate a FRESH messageID right before sending to ensure it's newer than the last assistant message
    // This is critical - IDs generated earlier (when queueing) will be older than assistant responses
    const messageID = Id.ascending("message");
    
    setMessageQueue(rest);
    sync.setThinking(sessionId, true);
    
    // Track this queued message as in-flight using the fresh messageID
    setInFlightMessage({ messageID, sessionId });

    try {
      const extraParts = buildSelectionParts(next.attachments);
      
      const result = await sendPrompt(sessionId, next.text, next.agent, extraParts, messageID);
      
      // Check for SDK error in result (SDK doesn't throw by default)
      if (result?.error) {
        const errorData = result.error as { data?: { message?: string }; error?: { data?: { message?: string } } };
        const errorMessage = 
          errorData.data?.message || 
          errorData.error?.data?.message || 
          (typeof errorData === 'string' ? errorData : JSON.stringify(errorData)) ||
          "Unknown error";
        sync.setThinking(sessionId, false);
        setInFlightMessage(null);
        setMessageQueue([]);
        sync.setSessionError(sessionId, errorMessage);
        return;
      }
    } catch (err) {
      console.error("[App] Queue sendPrompt failed:", err);
      const errorMessage = (err as Error).message;
      
      // Show all errors inline and clear queue + in-flight
      sync.setThinking(sessionId, false);
      setInFlightMessage(null);
      setMessageQueue([]);
      sync.setSessionError(sessionId, errorMessage);
    }
  };

  const handleQueueMessage = () => {
    const text = input().trim();
    if (!text || !sync.isReady()) return;
    
    const agent = agents().some((a) => a.name === selectedAgent())
      ? selectedAgent()
      : null;
    const attachmentsKey = sessionKey();
    const attachments = selectionAttachments();
    
    // Queue the message without a messageID - we'll generate it fresh when sending
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
    if (!sync.isReady()) return;
    
    // Clear local UI state
    setMessageQueue([]);
    setInFlightMessage(null);
    setEditingMessageId(null);
    setEditingText("");
    
    // Set session and bootstrap to load messages
    sync.setCurrentSessionId(sessionId);
    await sync.bootstrap();
  };

  const handleNewSession = async () => {
    if (!sync.isReady()) return;
    try {
      const res = await createSession();
      const newSession = res?.data as Session | undefined;
      if (!newSession?.id) return;

      // Clear local UI state
      setMessageQueue([]);
      setInFlightMessage(null);
      setEditingMessageId(null);
      setEditingText("");
      
      // Set new session and bootstrap
      sync.setCurrentSessionId(newSession.id);
      await sync.bootstrap();
    } catch (err) {
      console.error("[App] Failed to create session:", err);
    }
  };

  const handleCancel = async () => {
    const sessionId = sync.currentSessionId();
    if (!sync.isReady() || !sessionId) return;
    try {
      await abortSession(sessionId);
    } finally {
      sync.setThinking(sessionId, false);
      setInFlightMessage(null);
    }
  };

  const handleAgentChange = (agent: string | null) => {
    setSelectedAgent(agent);
    // Persist as global default for new sessions
    if (agent && !sync.currentSessionId()) {
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
    const sessionId = sync.currentSessionId();
    if (!messageId || !sessionId || !newText.trim() || !sync.isReady()) return;

    const agent = agents().some((a) => a.name === selectedAgent())
      ? selectedAgent()
      : null;

    // Generate sortable client-side messageID for the new prompt
    const newMessageID = Id.ascending("message");

    sync.setThinking(sessionId, true);
    setEditingMessageId(null);
    setEditingText("");

    // Track this as in-flight
    setInFlightMessage({ messageID: newMessageID, sessionId });

    try {
      await revertToMessage(sessionId, messageId);
      const result = await sendPrompt(sessionId, newText.trim(), agent, [], newMessageID);
      
      // Check for SDK error in result (SDK doesn't throw by default)
      if (result?.error) {
        const errorData = result.error as { data?: { message?: string }; error?: { data?: { message?: string } } };
        const errorMessage = 
          errorData.data?.message || 
          errorData.error?.data?.message || 
          (typeof errorData === 'string' ? errorData : JSON.stringify(errorData)) ||
          "Unknown error";
        sync.setThinking(sessionId, false);
        setInFlightMessage(null);
        sync.setSessionError(sessionId, `Error editing message: ${errorMessage}`);
        return;
      }
    } catch (err) {
      console.error("[App] Failed to edit message:", err);
      const errorMessage = (err as Error).message;
      
      // Show all errors inline and clear in-flight
      sync.setThinking(sessionId, false);
      setInFlightMessage(null);
      sync.setSessionError(sessionId, `Error editing message: ${errorMessage}`);
    }
  };

  const handlePermissionResponse = async (
    permissionId: string,
    response: "once" | "always" | "reject"
  ) => {
    const perms = pendingPermissions();
    let permission: Permission | undefined;
    for (const [, perm] of perms.entries()) {
      if (perm.id === permissionId) {
        permission = perm;
        break;
      }
    }

    const sessionId = permission?.sessionID || sync.currentSessionId();
    if (!sessionId || !sync.isReady()) {
      console.error("[App] Cannot respond to permission: no session ID");
      return;
    }

    await respondToPermission(sessionId, permissionId, response);
    // Permission removal is handled by store via SSE events
  };

  // Refresh sessions - just re-bootstrap
  const refreshSessions = async () => {
    await sync.bootstrap();
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
        currentSessionId={sync.currentSessionId()}
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
                  workspaceRoot={sync.workspaceRoot()}
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
          disabled={!sync.isReady()}
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
        workspaceRoot={sync.workspaceRoot()}
        pendingPermissions={pendingPermissions}
        onPermissionResponse={handlePermissionResponse}
        editingMessageId={editingMessageId()}
        editingText={editingText()}
        onStartEdit={handleStartEdit}
        onCancelEdit={handleCancelEdit}
        onSubmitEdit={handleSubmitEdit}
        onEditTextChange={setEditingText}
        sessionError={sessionError()}
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
                  workspaceRoot={sync.workspaceRoot()}
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
          disabled={!sync.isReady()}
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
