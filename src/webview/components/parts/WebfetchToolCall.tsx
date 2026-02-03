import type { Accessor } from "solid-js";
import type { MessagePart, Permission, ToolState } from "../../types";
import { ToolCallTemplate } from "./ToolCallTemplate";
import { GlobeIcon } from "./ToolCallIcons";
import { getToolInputs, usePermission, ErrorFooter } from "./ToolCallHelpers";

interface WebfetchToolCallProps {
  part: MessagePart;
  workspaceRoot?: string;
  pendingPermissions?: Accessor<Map<string, Permission>>;
  onPermissionResponse?: (
    permissionId: string,
    response: "once" | "always" | "reject",
  ) => void;
}

export function WebfetchToolCall(props: WebfetchToolCallProps) {
  const state = () => props.part.state as ToolState;
  const inputs = () => getToolInputs(state(), props.part);

  const permission = usePermission(props.part, () =>
    props.pendingPermissions?.(),
  );

  const Header = () => (
    <span class="tool-header-text">
      <span class="tool-text">
        {(inputs().url as string) || "Fetching page"}
      </span>
    </span>
  );

  const Output = () => <pre class="tool-output">{state().output}</pre>;

  return (
    <ToolCallTemplate
      icon={GlobeIcon}
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
