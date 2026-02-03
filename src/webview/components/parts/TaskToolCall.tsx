import { Show, type Accessor } from "solid-js";
import type { MessagePart, Permission, ToolState } from "../../types";
import { ToolCallTemplate } from "./ToolCallTemplate";
import { GenericToolIcon } from "./ToolCallIcons";
import { getToolInputs, usePermission, ErrorFooter } from "./ToolCallHelpers";

interface TaskToolCallProps {
  part: MessagePart;
  workspaceRoot?: string;
  pendingPermissions?: Accessor<Map<string, Permission>>;
  onPermissionResponse?: (
    permissionId: string,
    response: "once" | "always" | "reject",
  ) => void;
}

export function TaskToolCall(props: TaskToolCallProps) {
  const state = () => props.part.state as ToolState;
  const inputs = () => getToolInputs(state(), props.part);

  const permission = usePermission(props.part, () =>
    props.pendingPermissions?.(),
  );

  const isPending = () => props.part.state?.status === "pending";

  const description = () => inputs().description as string | undefined;
  const subagentType = () => {
    const type = inputs().subagent_type as string | undefined;
    return type ? type.charAt(0).toUpperCase() + type.slice(1) : undefined;
  };
  const mainText = () => state().title || description() || (isPending() ? "Running task" : "Task");

  const Header = () => (
    <span class="tool-header-text">
      <span class="tool-text">{mainText()}</span>
      <Show when={subagentType()}>
        <span class="tool-sub-text">{subagentType()}</span>
      </Show>
    </span>
  );

  const Output = () => <pre class="tool-output">{state().output}</pre>;

  return (
    <ToolCallTemplate
      icon={GenericToolIcon}
      header={Header}
      output={state().output ? Output : undefined}
      footer={state().error ? () => <ErrorFooter error={state().error} /> : undefined}
      isPending={isPending()}
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
