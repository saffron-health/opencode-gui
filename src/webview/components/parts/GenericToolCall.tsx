import { createMemo, type Accessor } from "solid-js";
import type { MessagePart, Permission, ToolState } from "../../types";
import { ToolCallTemplate } from "./ToolCallTemplate";
import { GenericToolIcon } from "./ToolCallIcons";
import { usePermission, ErrorFooter } from "./ToolCallHelpers";

interface GenericToolCallProps {
  part: MessagePart;
  workspaceRoot?: string;
  pendingPermissions?: Accessor<Map<string, Permission>>;
  onPermissionResponse?: (
    permissionId: string,
    response: "once" | "always" | "reject",
  ) => void;
}

export function GenericToolCall(props: GenericToolCallProps) {
  const state = () => props.part.state as ToolState;
  const tool = () => props.part.tool as string;

  const permission = usePermission(props.part, () =>
    props.pendingPermissions?.(),
  );

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

  return (
    <ToolCallTemplate
      icon={GenericToolIcon}
      header={Header}
      output={state().output ? Output : undefined}
      footer={state().error ? () => <ErrorFooter error={state().error} /> : undefined}
      isPending={props.part.state?.status === "pending"}
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
