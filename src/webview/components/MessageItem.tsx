/* @jsxImportSource solid-js */
import { For, Show } from "solid-js";
import type { Message, Permission } from "../types";
import { MessagePartRenderer } from "./MessagePartRenderer";

interface MessageItemProps {
  message: Message;
  workspaceRoot?: string;
  pendingPermissions?: Map<string, Permission>;
  onPermissionResponse?: (permissionId: string, response: "once" | "always" | "reject") => void;
  isStreaming?: boolean;
}

export function MessageItem(props: MessageItemProps) {
  return (
    <div class={`message message--${props.message.type}`}>
      <div class="message-content">
        <Show when={props.message.parts} fallback={props.message.text}>
          <For each={props.message.parts}>
            {(part) => <MessagePartRenderer part={part} workspaceRoot={props.workspaceRoot} pendingPermissions={props.pendingPermissions} onPermissionResponse={props.onPermissionResponse} isStreaming={props.isStreaming} />}
          </For>
        </Show>
      </div>
    </div>
  );
}
