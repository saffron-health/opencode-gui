
import { For, Show, createMemo, type Accessor } from "solid-js";
import type { Message, Permission, MessagePart } from "../types";
import { MessagePartRenderer } from "./MessagePartRenderer";
import { isRenderablePart } from "./MessagePartRenderer";
import { vscode } from "../utils/vscode";
import { useSync } from "../state/sync";
import { extractTextFromParts } from "../state/utils";

interface MessageItemProps {
  message: Message;
  parts: MessagePart[];
  workspaceRoot?: string;
  pendingPermissions?: Accessor<Map<string, Permission>>;
  onPermissionResponse?: (permissionId: string, response: "once" | "always" | "reject") => void;
  isStreaming?: boolean;
}

export function MessageItem(props: MessageItemProps) {
  const sync = useSync();
  // TUI pattern: parts are passed as prop, already reactive
  const isUser = () => props.message.type === "user";
  const hasAnyParts = () => props.parts.length > 0;
  const renderableParts = createMemo(() => props.parts.filter(isRenderablePart));
  const hasRenderableParts = () => renderableParts().length > 0;
  
  // Message text is derived from parts (text parts only, excluding synthetic/ignored).
  const userText = createMemo(() => extractTextFromParts(props.parts));
  
  const userAttachments = createMemo(() => {
    return props.parts
      .filter((part) => part.type === "file")
      .map((part) => {
        const filePart = part as MessagePart & { url?: string; filename?: string };
        const url = filePart.url || "";
        let filename = filePart.filename || "";
        let start: number | undefined;
        let end: number | undefined;

        if (url) {
          try {
            const parsed = new URL(url);
            const startRaw = parsed.searchParams.get("start");
            const endRaw = parsed.searchParams.get("end");
            start = startRaw ? Number(startRaw) : undefined;
            end = endRaw ? Number(endRaw) : undefined;
            if (!filename && parsed.pathname) {
              const pathname = decodeURIComponent(parsed.pathname);
              const parts = pathname.split("/");
              filename = parts[parts.length - 1] || pathname;
            }
          } catch {
            // Ignore non-file URLs
          }
        }

        const labelBase = filename || url || "attachment";
        const label =
          Number.isFinite(start) && start !== undefined
            ? `${labelBase} L${start}${Number.isFinite(end) && end !== start ? `-${end}` : ""}`
            : labelBase;

        return {
          id: filePart.id || `${url}-${label}`,
          label,
          title: filename ? labelBase : url,
          url,
          startLine: Number.isFinite(start) ? start : undefined,
          endLine: Number.isFinite(end) ? end : undefined,
        };
      });
  });

  const shouldRenderAssistantMessage = createMemo(
    () => isUser() || hasAnyParts()
  );

  return (
    <Show when={shouldRenderAssistantMessage()}>
      <div class={`message message--${props.message.type}`} role="article" aria-label={`${props.message.type} message`}>
        <div class="message-content">
          <Show when={isUser()}>
            <Show when={userAttachments().length > 0}>
              <div class="message-attachments">
                <For each={userAttachments()}>
                  {(attachment) => (
                    <button
                      type="button"
                      class="file-chip message-attachment"
                      title={attachment.title ?? attachment.label}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!attachment.url) return;
                        vscode.postMessage({
                          type: "open-file",
                          url: attachment.url,
                          startLine: attachment.startLine,
                          endLine: attachment.endLine,
                        });
                      }}
                    >
                      <span class="message-attachment__text">{attachment.label}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <Show when={userText()}>
              <div class="message-text user-message-text">{userText()}</div>
            </Show>
          </Show>
          <Show when={!isUser()}>
            <Show when={hasRenderableParts()}>
              <For each={renderableParts()}>
                {(part) => <MessagePartRenderer part={part} workspaceRoot={props.workspaceRoot} pendingPermissions={props.pendingPermissions} onPermissionResponse={props.onPermissionResponse} isStreaming={props.isStreaming} />}
              </For>
            </Show>
          </Show>
        </div>
      </div>
    </Show>
  );
}
