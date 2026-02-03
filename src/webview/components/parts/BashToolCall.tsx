import { Show, type Accessor } from "solid-js";
import type { MessagePart, Permission, ToolState } from "../../types";
import { ToolCallTemplate } from "./ToolCallTemplate";
import { TerminalIcon } from "./ToolCallIcons";
import { getToolInputs, usePermission, ErrorFooter } from "./ToolCallHelpers";

interface BashToolCallProps {
  part: MessagePart;
  workspaceRoot?: string;
  pendingPermissions?: Accessor<Map<string, Permission>>;
  onPermissionResponse?: (
    permissionId: string,
    response: "once" | "always" | "reject",
  ) => void;
}

export function BashToolCall(props: BashToolCallProps) {
  // IMPORTANT: don't memoize raw objects from the store.
  // Returning the object from createMemo prevents downstream tracking of nested keys
  // (e.g. state.input.command) when reconcile mutates in place. Use accessors.
  const state = () => props.part.state as ToolState;
  const inputs = () => getToolInputs(state(), props.part);

  const permission = usePermission(props.part, () =>
    props.pendingPermissions?.(),
  );

  // Show the actual bash command (e.g., "ls -la"), not the AI-generated description
  const command = () => inputs().command as string | undefined;

  const Header = () => {
    return (
      <span class="tool-header-text">
        <span
          class="tool-text tool-text--bash"
          style={{ "font-family": "monospace" }}
        >
          {command() || "Running command"}
        </span>
      </span>
    );
  };

  const Output = () => (
    <pre class="tool-output tool-output--bash">{state().output}</pre>
  );

  return (
    <ToolCallTemplate
      icon={TerminalIcon}
      header={Header}
      output={state().output ? Output : undefined}
      footer={state().error ? () => <ErrorFooter error={state().error} /> : undefined}
      defaultOpen={true}
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
