import type { Accessor } from "solid-js";
import type { MessagePart, Permission, ToolState } from "../../types";
import { ToolCallTemplate } from "./ToolCallTemplate";
import { ChecklistIcon } from "./ToolCallIcons";
import { usePermission, ErrorFooter } from "./ToolCallHelpers";

interface TodoToolCallProps {
  part: MessagePart;
  workspaceRoot?: string;
  pendingPermissions?: Accessor<Map<string, Permission>>;
  onPermissionResponse?: (
    permissionId: string,
    response: "once" | "always" | "reject",
  ) => void;
}

export function TodoToolCall(props: TodoToolCallProps) {
  const state = () => props.part.state as ToolState;
  const tool = () => props.part.tool as string;

  const permission = usePermission(props.part, () =>
    props.pendingPermissions?.(),
  );

  const Header = () => (
    <span class="tool-header-text">
      <span class="tool-text">
        {tool() === "todowrite" ? "Updating todos" : "Reading todos"}
      </span>
    </span>
  );

  const Output = () => <pre class="tool-output">{state().output}</pre>;

  return (
    <ToolCallTemplate
      icon={ChecklistIcon}
      header={Header}
      output={state().output ? Output : undefined}
      footer={state().error ? () => <ErrorFooter error={state().error} /> : undefined}
      isLight={true}
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
