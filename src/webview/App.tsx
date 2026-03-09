import { createSignal, createMemo, Show, onMount, onCleanup, createEffect, For } from "solid-js";
import { InputBar } from "./components/InputBar";
import type { TiptapEditorMethods } from "./components/TiptapEditor";
import { MessageList } from "./components/MessageList";
import { TopBar } from "./components/TopBar";
import { ContextIndicator } from "./components/ContextIndicator";
import { FileChangesSummary } from "./components/FileChangesSummary";
import { PermissionPrompt } from "./components/PermissionPrompt";
import { QuestionPrompt } from "./components/QuestionPrompt";
import { useOpenCode, type PromptPartInput } from "./hooks/useOpenCode";
import { useSync } from "./state/sync";
import type { FilePartInput, QuestionAnswer, QuestionRequest } from "@opencode-ai/sdk/v2/client";
import type { Message, Agent, Session, Permission, FileChangesInfo, MessagePart } from "./types";
import { parseHostMessage } from "./types";

export interface QueuedMessage {
  id: string;
  text: string;
  agent: string | null;
  attachments: SelectionAttachment[];
}

// In-flight message tracking for the outbox (used for queue draining)
interface InFlightMessage {
  messageID: string;
  sessionId: string;
}

interface FileMentionInsertRequest {
  filePath: string;
  startLine?: number;
  endLine?: number;
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
import { extractMentions } from "./utils/editorContent";
import {
  encodeFileMentionReference,
  parseFileMentionReference,
} from "./utils/fileMentionReference";

const NEW_SESSION_KEY = "__new__";

function App() {
  // Use the sync context for server-owned state
  const sync = useSync();
  
  // Local UI-only state
  const [defaultAgent, setDefaultAgent] = createSignal<string | null>(null);
  const [drafts, setDrafts] = createSignal<Map<string, string>>(new Map());
  const [draftContents, setDraftContents] = createSignal<Map<string, any>>(new Map()); // TipTap JSON content
  const [sessionAgents, setSessionAgents] = createSignal<Map<string, string>>(new Map());
  const [selectionAttachmentsBySession, setSelectionAttachmentsBySession] = createSignal<
    Map<string, SelectionAttachment[]>
  >(new Map());
  
  // Editing state for previous messages
  const [editingMessageId, setEditingMessageId] = createSignal<string | null>(null);
  const [editingText, setEditingText] = createSignal<string>("");
  
  // Message queue for queuing messages while generating
  const [messageQueue, setMessageQueue] = createSignal<QueuedMessage[]>([]);

  // Host selections received before editor methods are available
  const [pendingMentionInsertions, setPendingMentionInsertions] = createSignal<FileMentionInsertRequest[]>([]);
  const [pendingEditorFocus, setPendingEditorFocus] = createSignal(false);
  
  // In-flight message tracking for outbox pattern
  const [inFlightMessage, setInFlightMessage] = createSignal<InFlightMessage | null>(null);
  
  // Editor methods for managing content
  let editorMethods: TiptapEditorMethods | null = null;

  // Get SDK hook for actions only
  const {
    initData,
    createSession,
    abortSession,
    sendPrompt,
    respondToPermission,
    respondToQuestion,
    rejectQuestion,
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
    
    // Also save the editor JSON content when available
    if (editorMethods) {
      try {
        const json = editorMethods.getJSON();
        setDraftContents((prev) => {
          const next = new Map(prev);
          next.set(key, json);
          return next;
        });
      } catch (err) {
        // Editor might not be ready yet
      }
    }
  };

  // Current agent for the active session.
  // New-session mode always uses the global default; existing sessions can override it.
  const selectedAgent = () => {
    const sessionId = sync.currentSessionId();
    return sessionId ? sessionAgents().get(sessionId) || defaultAgent() : defaultAgent();
  };
  const setSelectedAgent = (agent: string | null) => {
    if (!agent) return;
    const sessionId = sync.currentSessionId();
    if (!sessionId) {
      // In new-session mode, agent choice defines the default for subsequent sessions.
      setDefaultAgent(agent);
      return;
    }
    setSessionAgents((prev) => {
      const next = new Map(prev);
      next.set(sessionId, agent);
      return next;
    });
  };
  
  // Convenience accessors from sync store
  // Use the sync memos directly (not wrapped in functions) to maintain reactivity
  const messages = sync.messages;
  const agents = sync.agents;
  const sessions = sync.sessions;
  const pendingPermissions = sync.aggregatedPermissions;
  const pendingQuestions = sync.aggregatedQuestions;
  const contextInfo = sync.contextInfo;
  const fileChanges = sync.fileChanges;
  const isThinking = sync.isThinking;
  const sessionError = sync.sessionError;

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

  const buildWorkspaceFileUrl = (workspaceRoot: string, relativePath: string) => {
    const normalizedRoot = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const normalizedPath = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    const base = `file://${normalizedRoot}/`;
    return new URL(normalizedPath, base).toString();
  };

  const openFileFromMention = (filePath: string) => {
    const workspaceRoot = sync.workspaceRoot();
    if (!workspaceRoot) {
      logger.error("Cannot open mention: workspace root unavailable", { filePath });
      return;
    }
    vscode.postMessage({
      type: "open-file",
      url: buildWorkspaceFileUrl(workspaceRoot, filePath),
    });
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

  // Questions associated with tool calls render inline at the tool location.
  // Keep standalone rendering only for non-tool questions.
  const standaloneQuestions = createMemo(() => {
    const result: QuestionRequest[] = [];
    for (const [, question] of pendingQuestions().entries()) {
      if (!question.tool) {
        result.push(question);
      }
    }
    return result;
  });

  const hasPendingQuestions = createMemo(() => pendingQuestions().size > 0);

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

  const normalizeSelectionRange = (startLine?: number, endLine?: number) => {
    if (startLine === undefined && endLine === undefined) return {};
    if (startLine === undefined || endLine === undefined) {
      const line = startLine ?? endLine;
      return { startLine: line, endLine: line };
    }
    return {
      startLine: Math.min(startLine, endLine),
      endLine: Math.max(startLine, endLine),
    };
  };

  const mentionInsertionKey = (request: FileMentionInsertRequest) =>
    encodeFileMentionReference({
      filePath: request.filePath,
      startLine: request.startLine,
      endLine: request.endLine,
    });

  const insertMentionFromHostSelection = (request: FileMentionInsertRequest): boolean => {
    if (!editorMethods) {
      return false;
    }

    try {
      const existingMentions = new Set(extractMentions(editorMethods.getJSON()));
      const requestKey = mentionInsertionKey(request);
      if (!existingMentions.has(requestKey)) {
        editorMethods.insertFileMention(request.filePath, request.startLine, request.endLine);
      }
      return true;
    } catch (err) {
      logger.error("Failed to insert file mention from editor selection", {
        error: err,
        filePath: request.filePath,
        startLine: request.startLine,
        endLine: request.endLine,
      });
      return false;
    }
  };

  const queueMentionInsertion = (request: FileMentionInsertRequest) => {
    const requestKey = mentionInsertionKey(request);
    setPendingMentionInsertions((prev) => {
      if (prev.some((item) => mentionInsertionKey(item) === requestKey)) {
        return prev;
      }
      return [...prev, request];
    });
  };

  const flushPendingMentionInsertions = () => {
    if (!editorMethods) return;
    const pending = pendingMentionInsertions();
    if (pending.length === 0) return;

    const failed: FileMentionInsertRequest[] = [];
    for (const request of pending) {
      if (!insertMentionFromHostSelection(request)) {
        failed.push(request);
      }
    }
    setPendingMentionInsertions(failed);
  };

  const focusEditorOrQueue = () => {
    if (!editorMethods) {
      setPendingEditorFocus(true);
      return;
    }
    editorMethods.focus();
    setPendingEditorFocus(false);
  };

  const handleEditorMethodsReady = (methods: TiptapEditorMethods) => {
    editorMethods = methods;
    if (pendingEditorFocus()) {
      editorMethods.focus();
      setPendingEditorFocus(false);
    }
    flushPendingMentionInsertions();
  };

  const insertMentionOrQueue = (request: FileMentionInsertRequest) => {
    if (insertMentionFromHostSelection(request)) {
      return;
    }
    queueMentionInsertion(request);
  };

  onMount(() => {
    const handleHostMessage = (event: MessageEvent) => {
      const parsed = parseHostMessage(event.data);
      if (!parsed) return;
      if (parsed.type !== "editor-selection") return;

      focusEditorOrQueue();
      const normalizedRange = normalizeSelectionRange(
        parsed.selection?.startLine,
        parsed.selection?.endLine
      );
      insertMentionOrQueue({
        filePath: parsed.filePath,
        startLine: normalizedRange.startLine,
        endLine: normalizedRange.endLine,
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

  // Restore editor content when session changes
  createEffect(() => {
    const key = sessionKey();
    const savedContent = draftContents().get(key);
    
    if (editorMethods && savedContent) {
      try {
        editorMethods.setContent(savedContent);
      } catch (err) {
        logger.error("Failed to restore editor content", { error: err });
      }
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

  // If a question request arrives for an in-flight session, clear the in-flight
  // marker so the app can transition into question-response mode immediately.
  createEffect(() => {
    const inflight = inFlightMessage();
    if (!inflight) return;

    for (const [, question] of pendingQuestions().entries()) {
      if (question.sessionID === inflight.sessionId) {
        setInFlightMessage(null);
        return;
      }
    }
  });

  // Handlers
  const handleSubmit = async () => {
    const text = input().trim();
    if (!text || !sync.isReady()) {
      return;
    }
    if (hasPendingQuestions()) {
      const sessionId = sync.currentSessionId();
      if (sessionId) {
        sync.setSessionError(sessionId, "Answer pending questions before sending another prompt.");
      }
      return;
    }

    const agent = agents().some((a) => a.name === selectedAgent())
      ? selectedAgent()
      : null;
    const attachmentsKey = sessionKey();
    let attachments = selectionAttachments();
    
    // Extract mentions from editor and add to attachments
    if (editorMethods) {
      try {
        const editorJSON = editorMethods.getJSON();
        const mentionedFiles = extractMentions(editorJSON);
        const workspaceRoot = sync.workspaceRoot();
        if (!workspaceRoot) {
          throw new Error("workspace root unavailable while extracting mentions");
        }
        
        // Convert mention references to SelectionAttachment objects
        const mentionAttachments: SelectionAttachment[] = mentionedFiles
          .map((mentionReference) => {
            const parsedMention = parseFileMentionReference(mentionReference);
            if (!parsedMention.filePath) return null;
            return {
              id: `mention-${mentionReference}`,
              filePath: parsedMention.filePath,
              fileUrl: buildWorkspaceFileUrl(workspaceRoot, parsedMention.filePath),
              startLine: parsedMention.startLine,
              endLine: parsedMention.endLine,
            } satisfies SelectionAttachment;
          })
          .filter((attachment): attachment is SelectionAttachment => attachment !== null);
        
        // Merge with existing attachments (avoid exact duplicates)
        const attachmentKey = (attachment: SelectionAttachment) =>
          `${attachment.filePath}:${attachment.startLine ?? ""}:${attachment.endLine ?? ""}`;
        const existingKeys = new Set(attachments.map(attachmentKey));
        const newAttachments = mentionAttachments.filter(
          (attachment) => !existingKeys.has(attachmentKey(attachment))
        );
        attachments = [...attachments, ...newAttachments];
      } catch (err) {
        logger.error("Failed to extract mentions", { error: err });
      }
    }
    
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

    // Clear both text and JSON content
    setInput("");
    if (editorMethods) {
      editorMethods.clear();
    }
    const key = sessionKey();
    setDraftContents((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
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

    if (hasPendingQuestions()) {
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
    if (hasPendingQuestions()) {
      const sessionId = sync.currentSessionId();
      if (sessionId) {
        sync.setSessionError(sessionId, "Answer pending questions before queueing another prompt.");
      }
      return;
    }
    
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
    if (editorMethods) {
      editorMethods.clear();
    }
    const key = sessionKey();
    setDraftContents((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
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
    // Set plain text content in editor (JSON not saved for queued messages)
    if (editorMethods) {
      editorMethods.setContent(message.text);
    }
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

  const handleQuestionSubmit = async (requestId: string, answers: Array<QuestionAnswer>) => {
    const question = pendingQuestions().get(requestId);
    const sessionId = question?.sessionID ?? sync.currentSessionId();
    if (!sessionId || !sync.isReady()) {
      console.error("[App] Cannot respond to question: no session ID");
      return;
    }

    try {
      await respondToQuestion(requestId, answers);
    } catch (err) {
      const errorMessage = (err as Error).message;
      sync.setSessionError(sessionId, errorMessage);
    }
  };

  const handleQuestionReject = async (requestId: string) => {
    const question = pendingQuestions().get(requestId);
    const sessionId = question?.sessionID ?? sync.currentSessionId();
    if (!sessionId || !sync.isReady()) {
      console.error("[App] Cannot reject question: no session ID");
      return;
    }

    try {
      await rejectQuestion(requestId);
    } catch (err) {
      const errorMessage = (err as Error).message;
      sync.setSessionError(sessionId, errorMessage);
    }
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
        sessionStatus={sync.sessionStatus}
        onSessionSelect={handleSessionSelect}
        onNewSession={handleNewSession}
        onRefreshSessions={refreshSessions}
      />

      <Show when={!hasMessages()}>
        <Show when={standaloneQuestions().length > 0}>
          <div class="standalone-permissions">
            <For each={standaloneQuestions()}>
              {(question) => (
                <QuestionPrompt
                  request={question}
                  onSubmit={handleQuestionSubmit}
                  onReject={handleQuestionReject}
                />
              )}
            </For>
          </div>
        </Show>

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
          disabled={!sync.isReady() || hasPendingQuestions()}
          isThinking={isThinking()}
          selectedAgent={selectedAgent()}
          agents={agents()}
          onAgentChange={handleAgentChange}
          queuedMessages={messageQueue()}
          onRemoveFromQueue={handleRemoveFromQueue}
          onEditQueuedMessage={handleEditQueuedMessage}
          attachments={attachmentChips()}
          onRemoveAttachment={handleRemoveAttachment}
          onFileMentionClick={openFileFromMention}
          editorRef={handleEditorMethodsReady}
        />
      </Show>

      <MessageList
        messages={messages()}
        isThinking={isThinking()}
        workspaceRoot={sync.workspaceRoot()}
        pendingPermissions={pendingPermissions}
        pendingQuestions={pendingQuestions}
        onPermissionResponse={handlePermissionResponse}
        onQuestionSubmit={handleQuestionSubmit}
        onQuestionReject={handleQuestionReject}
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

        <Show when={standaloneQuestions().length > 0}>
          <div class="standalone-permissions">
            <For each={standaloneQuestions()}>
              {(question) => (
                <QuestionPrompt
                  request={question}
                  onSubmit={handleQuestionSubmit}
                  onReject={handleQuestionReject}
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
          disabled={!sync.isReady() || hasPendingQuestions()}
          isThinking={isThinking()}
          selectedAgent={selectedAgent()}
          agents={agents()}
          onAgentChange={handleAgentChange}
          queuedMessages={messageQueue()}
          onRemoveFromQueue={handleRemoveFromQueue}
          onEditQueuedMessage={handleEditQueuedMessage}
          attachments={attachmentChips()}
          onRemoveAttachment={handleRemoveAttachment}
          onFileMentionClick={openFileFromMention}
          editorRef={handleEditorMethodsReady}
        />
      </Show>
    </div>
  );
}

export default App;
