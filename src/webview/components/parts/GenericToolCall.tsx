import { Show, createMemo } from "solid-js";
import type { MessagePart, Permission } from "../../types";
import { ToolCallTemplate } from "./ToolCallTemplate";
import { GenericToolIcon } from "./ToolCallIcons";
import { type ToolState } from "./ToolCallHelpers";

interface GenericToolCallProps {
  part: MessagePart;
  workspaceRoot?: string;
  pendingPermissions?: Map<string, Permission>;
  onPermissionResponse?: (
    permissionId: string,
    response: "once" | "always" | "reject",
  ) => void;
}

export function GenericToolCall(props: GenericToolCallProps) {
  const state = () => props.part.state as ToolState;
  const tool = () => props.part.tool as string;

  const permission = createMemo(() => {
    const perms = props.pendingPermissions;
    if (!perms) return undefined;
    const callID = props.part.callID;
    if (callID && perms.has(callID)) {
      return perms.get(callID);
    }
    if (perms.has(props.part.id)) {
      return perms.get(props.part.id);
    }
    return undefined;
  });

  // Convert tool name to action form: "web_search" -> "Web searching"
  const displayText = createMemo(() => {
    const toolName = tool();
    if (state().title) return state().title;
    
    const actionForm =
      toolName
        .split("_")
        .map((word, i) =>
          i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
        )
        .join(" ") + "ing";
    
    return actionForm;
  });

  const Header = () => (
    <span class="tool-header-text">
      <span class="tool-text">{displayText()}</span>
    </span>
  );

  const Output = () => <pre class="tool-output">{state().output}</pre>;

  const Footer = () => (
    <Show when={state().error}>
      <div class="tool-footer tool-footer--error">{state().error}</div>
    </Show>
  );

  return (
    <ToolCallTemplate
      icon={GenericToolIcon}
      header={Header}
      output={state().output ? Output : undefined}
      footer={state().error ? Footer : undefined}
      needsPermission={!!permission()}
      permission={permission()}
      onPermissionResponse={(response) => {
        const perm = permission();
        if (perm?.id && props.onPermissionResponse) {
          props.onPermissionResponse(perm.id, response);
        }
      }}
    />
  );
}
