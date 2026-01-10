
import { For, Show } from "solid-js";
import type { Message, Permission } from "../types";
import { MessagePartRenderer } from "./MessagePartRenderer";
import { Streamdown } from "../lib/streamdown";

interface MessageItemProps {
  message: Message;
  workspaceRoot?: string;
  pendingPermissions?: Map<string, Permission>;
  onPermissionResponse?: (permissionId: string, response: "once" | "always" | "reject") => void;
  isStreaming?: boolean;
}

export function MessageItem(props: MessageItemProps) {
  const hasParts = () => props.message.parts && props.message.parts.length > 0;
  
  return (
    <div class={`message message--${props.message.type}`} role="article" aria-label={`${props.message.type} message`}>
      <div class="message-content">
        <Show 
          when={hasParts()} 
          fallback={
            <Show when={props.message.text}>
              <Streamdown mode={props.isStreaming ? "streaming" : "static"} class="message-text">
                {props.message.text!}
              </Streamdown>
            </Show>
          }
        >
          <For each={props.message.parts}>
            {(part) => <MessagePartRenderer part={part} workspaceRoot={props.workspaceRoot} pendingPermissions={props.pendingPermissions} onPermissionResponse={props.onPermissionResponse} isStreaming={props.isStreaming} />}
          </For>
        </Show>
      </div>
    </div>
  );
}
