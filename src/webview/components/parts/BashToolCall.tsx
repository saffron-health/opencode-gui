import { Show } from "solid-js";
import type { MessagePart, Permission } from "../../types";
import { ToolCallTemplate } from "./ToolCallTemplate";
import { TerminalIcon } from "./ToolCallIcons";
import { getToolInputs, usePermission, ErrorFooter, type ToolState } from "./ToolCallHelpers";

interface BashToolCallProps {
  part: MessagePart;
  workspaceRoot?: string;
  pendingPermissions?: Map<string, Permission>;
  onPermissionResponse?: (
    permissionId: string,
    response: "once" | "always" | "reject",
  ) => void;
}

export function BashToolCall(props: BashToolCallProps) {
  const state = () => props.part.state as ToolState;
  const inputs = () => getToolInputs(state(), props.part);

  const permission = usePermission(props.part, props.pendingPermissions);

  const Header = () => {
    const description = inputs().description as string | undefined;
    const command = inputs().command as string | undefined;
    const mainText = description || command || "Running command";
    const subText = description ? command : undefined;

    return (
      <span class="tool-header-text">
        <span
          class="tool-text tool-text--bash"
          style={{ "font-family": "monospace" }}
        >
          {mainText}
        </span>
        <Show when={subText}>
          <span class="tool-text-sub" style={{ "font-family": "monospace" }}>
            {subText}
          </span>
        </Show>
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
