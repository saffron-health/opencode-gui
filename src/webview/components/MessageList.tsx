
import { For, Show, createSignal, onMount, onCleanup, createEffect, createMemo, on, type Accessor } from "solid-js";
import type { Message, Permission } from "../types";
import { MessageItem } from "./MessageItem";
import { EditableUserMessage } from "./EditableUserMessage";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { useSync } from "../state/sync";

interface MessageListProps {
  messages: Message[];
  isThinking: boolean;
  workspaceRoot?: string;
  pendingPermissions?: Accessor<Map<string, Permission>>;
  onPermissionResponse?: (permissionId: string, response: "once" | "always" | "reject") => void;
  editingMessageId?: string | null;
  editingText?: string;
  onStartEdit?: (messageId: string, text: string) => void;
  onCancelEdit?: () => void;
  onSubmitEdit?: (newText: string) => void;
  onEditTextChange?: (text: string) => void;
  sessionError?: string | null;
}

export function MessageList(props: MessageListProps) {
  const sync = useSync();
  let containerRef!: HTMLDivElement;
  let contentRef!: HTMLDivElement;
  
  console.log("[MessageList] Rendering with messages count:", props.messages.length);
  
  const [pinned, setPinned] = createSignal(true);
  let userInteracting = false;
  let pendingRAF = false;

  const scrollToBottom = () => {
    if (!containerRef) return;
    containerRef.scrollTop = containerRef.scrollHeight;
  };

  const scheduleAutoScroll = () => {
    if (!pinned() || pendingRAF) return;
    pendingRAF = true;
    requestAnimationFrame(() => {
      pendingRAF = false;
      scrollToBottom();
    });
  };

  const isAtBottom = () => {
    if (!containerRef) return true;
    const { scrollHeight, scrollTop, clientHeight } = containerRef;
    return scrollTop + clientHeight >= scrollHeight - 2;
  };

  const handleScroll = () => {
    // Only react to scroll if the user is interacting
    if (!userInteracting) return;
    setPinned(isAtBottom());
  };

  onMount(() => {
    setPinned(true);

    const startUser = () => { userInteracting = true; };
    const endUser = () => { userInteracting = false; };

    containerRef.addEventListener("scroll", handleScroll, { passive: true });
    containerRef.addEventListener("wheel", startUser, { passive: true });
    containerRef.addEventListener("pointerdown", startUser, { passive: true });
    containerRef.addEventListener("touchstart", startUser, { passive: true });

    window.addEventListener("pointerup", endUser, { passive: true });
    window.addEventListener("touchend", endUser, { passive: true });

    const resizeObserver = new ResizeObserver(() => scheduleAutoScroll());
    resizeObserver.observe(contentRef);

    onCleanup(() => {
      containerRef.removeEventListener("scroll", handleScroll);
      containerRef.removeEventListener("wheel", startUser);
      containerRef.removeEventListener("pointerdown", startUser);
      containerRef.removeEventListener("touchstart", startUser);
      window.removeEventListener("pointerup", endUser);
      window.removeEventListener("touchend", endUser);
      resizeObserver.disconnect();
    });
  });

  // Handle new messages
  createEffect(
    on(
      () => props.messages.length,
      () => {
        setPinned(true);
        scheduleAutoScroll();
      }
    )
  );

  // Handle message content changes (streaming)
  createEffect(() => {
    const msgs = props.messages;
    const last = msgs[msgs.length - 1];
    
    // Build a signature that changes when streaming updates arrive
    const lastParts = last ? sync.getParts(last.id) : [];
    const sig = !last
      ? ""
      : lastParts.length
      ? lastParts
          .map(
            (p) =>
              `${p.id}:${p.type}:${p.text?.length ?? 0}:${p.state?.status ?? ""}:${
                p.state?.output?.length ?? 0
              }`
          )
          .join("|")
      : `text:${last.text?.length ?? 0}`;
    
    // Access sig to create reactive dependency
    void sig;
    
    // Trigger auto-scroll if pinned
    scheduleAutoScroll();
  });

  // Handle thinking indicator appearing/disappearing
  createEffect(
    on(
      () => props.isThinking,
      () => scheduleAutoScroll()
    )
  );

  // Handle session error appearing/disappearing
  createEffect(
    on(
      () => props.sessionError,
      () => scheduleAutoScroll()
    )
  );

  const getMessageIndex = (messageId: string) => {
    return props.messages.findIndex(m => m.id === messageId);
  };

  // Find the last assistant message that hasn't completed yet
  const pendingAssistantMessageId = createMemo(() => {
    const msgs = props.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i];
      if (msg.type === "assistant" && !msg.time?.completed) {
        return msg.id;
      }
    }
    return null;
  });

  const isMessageQueued = (messageId: string, message: Message) => {
    // User messages are queued if sent after pending assistant message started
    const pending = pendingAssistantMessageId();
    return pending && message.type === "user" && messageId > pending;
  };

  const isMessageDimmed = (messageId: string) => {
    const editingId = props.editingMessageId;
    if (!editingId) return false;
    
    const editingIndex = getMessageIndex(editingId);
    const currentIndex = getMessageIndex(messageId);
    
    // Dim messages that come after the one being edited
    return currentIndex > editingIndex;
  };

  // Split messages into non-queued and queued
  const nonQueuedMessages = createMemo(() => {
    const result = props.messages.filter(msg => !isMessageQueued(msg.id, msg));
    console.log("[MessageList] nonQueuedMessages memo recomputed", { total: props.messages.length, nonQueued: result.length });
    return result;
  });

  const queuedMessages = createMemo(() => {
    const result = props.messages.filter(msg => isMessageQueued(msg.id, msg));
    console.log("[MessageList] queuedMessages memo recomputed", { total: props.messages.length, queued: result.length });
    return result;
  });

  const renderMessage = (message: Message, index: () => number) => {
    const isLastMessage = () => index() === props.messages.length - 1;
    const isStreaming = () => isLastMessage() && props.isThinking && message.type === "assistant";
    const isEditing = () => props.editingMessageId === message.id;
    const isQueued = () => isMessageQueued(message.id, message);
    const isDimmed = () => isQueued() || isMessageDimmed(message.id);
    
    // Get the text content of the message for editing
    const messageText = () => {
      if (message.text) return message.text;
      const msgParts = sync.getParts(message.id);
      if (msgParts.length > 0) {
        return msgParts
          .filter(
            (p) =>
              p.type === "text" &&
              p.text &&
              !(p as { synthetic?: boolean }).synthetic
          )
          .map(p => p.text)
          .join("\n");
      }
      return "";
    };
    
    return (
      <Show 
        when={message.type === "user" && isEditing()}
        fallback={
          <div 
            class={`message-wrapper ${isDimmed() ? "message-wrapper--dimmed" : ""}`}
            onClick={() => {
              if (message.type === "user" && props.onStartEdit && !props.isThinking) {
                props.onStartEdit(message.id, messageText());
              }
            }}
            style={{ cursor: message.type === "user" && !props.isThinking ? "text" : "default" }}
          >
            <MessageItem 
              message={message}
              parts={sync.getParts(message.id)}
              workspaceRoot={props.workspaceRoot} 
              pendingPermissions={props.pendingPermissions} 
              onPermissionResponse={props.onPermissionResponse} 
              isStreaming={isStreaming()} 
            />
          </div>
        }
      >
        <EditableUserMessage
          text={props.editingText || ""}
          onTextChange={props.onEditTextChange || (() => {})}
          onSubmit={() => props.onSubmitEdit?.(props.editingText || "")}
          onCancel={props.onCancelEdit || (() => {})}
        />
      </Show>
    );
  };

  return (
    <div class="messages-container" ref={containerRef!} role="log" aria-label="Messages">
      <div class="messages-content" ref={contentRef!}>
        <For each={nonQueuedMessages()} fallback={null}>
          {(message, index) => renderMessage(message, index)}
        </For>

        <ThinkingIndicator when={props.isThinking} />

        <For each={queuedMessages()}>
          {(message, index) => renderMessage(message, index)}
        </For>
        
        <Show when={props.sessionError}>
          <div class="session-error" role="alert">
            {props.sessionError}
          </div>
        </Show>
      </div>
    </div>
  );
}
