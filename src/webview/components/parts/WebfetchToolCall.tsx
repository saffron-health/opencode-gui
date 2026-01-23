import { Show, createMemo } from "solid-js";
import type { MessagePart, Permission } from "../../types";
import { ToolCallTemplate } from "./ToolCallTemplate";
import { GlobeIcon } from "./ToolCallIcons";
import { getToolInputs, type ToolState } from "./ToolCallHelpers";

interface WebfetchToolCallProps {
  part: MessagePart;
  workspaceRoot?: string;
  pendingPermissions?: Map<string, Permission>;
  onPermissionResponse?: (
    permissionId: string,
    response: "once" | "always" | "reject",
  ) => void;
}

export function WebfetchToolCall(props: WebfetchToolCallProps) {
  const state = () => props.part.state as ToolState;
  const inputs = () => getToolInputs(state(), props.part);

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

  const Header = () => (
    <span class="tool-header-text">
      <span class="tool-text">
        {(inputs().url as string) || "Fetching page"}
      </span>
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
      icon={GlobeIcon}
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
