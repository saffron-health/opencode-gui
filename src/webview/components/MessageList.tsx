/* @jsxImportSource solid-js */
import { For, createSignal, onMount, onCleanup, createEffect, on } from "solid-js";
import type { Message, Permission } from "../types";
import { MessageItem } from "./MessageItem";
import { ThinkingIndicator } from "./ThinkingIndicator";

interface MessageListProps {
  messages: Message[];
  isThinking: boolean;
  workspaceRoot?: string;
  pendingPermissions?: Map<string, Permission>;
  onPermissionResponse?: (permissionId: string, response: "once" | "always" | "reject") => void;
}

export function MessageList(props: MessageListProps) {
  let containerRef!: HTMLDivElement;
  let contentRef!: HTMLDivElement;
  
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
    const sig = !last
      ? ""
      : last.parts?.length
      ? last.parts
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

  return (
    <div class="messages-container" ref={containerRef!}>
      <div class="messages-content" ref={contentRef!}>
        <For each={props.messages}>
          {(message, index) => {
            const isLastMessage = () => index() === props.messages.length - 1;
            const isStreaming = () => isLastMessage() && props.isThinking && message.type === "assistant";
            return <MessageItem message={message} workspaceRoot={props.workspaceRoot} pendingPermissions={props.pendingPermissions} onPermissionResponse={props.onPermissionResponse} isStreaming={isStreaming()} />;
          }}
        </For>

        <ThinkingIndicator when={props.isThinking} />
      </div>
    </div>
  );
}
