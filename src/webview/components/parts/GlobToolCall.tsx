import { Show, createMemo, type Accessor } from "solid-js";
import type { MessagePart, Permission, ToolState } from "../../types";
import { ToolCallTemplate } from "./ToolCallTemplate";
import { MagnifyingGlassIcon } from "./ToolCallIcons";
import { getToolInputs, usePermission, ErrorFooter } from "./ToolCallHelpers";

interface GlobToolCallProps {
  part: MessagePart;
  workspaceRoot?: string;
  pendingPermissions?: Accessor<Map<string, Permission>>;
  onPermissionResponse?: (
    permissionId: string,
    response: "once" | "always" | "reject",
  ) => void;
}

export function GlobToolCall(props: GlobToolCallProps) {
  const state = () => props.part.state as ToolState;
  const inputs = () => getToolInputs(state(), props.part);

  const resultsCount = createMemo(() => {
    const count = state().metadata?.count as number | undefined;
    return count ?? null;
  });

  const permission = usePermission(props.part, () =>
    props.pendingPermissions?.(),
  );

  const Header = () => (
    <>
      <span class="tool-header-text">
        <span class="tool-text" style={{ "font-family": "monospace" }}>
          {(inputs().pattern as string) || "Searching files"}
        </span>
        <Show when={resultsCount() !== null && resultsCount()! > 0}>
          <span class="tool-sub-text">{resultsCount()} results</span>
        </Show>
      </span>
    </>
  );

  const Output = () => <pre class="tool-output">{state().output}</pre>;

  return (
    <ToolCallTemplate
      icon={MagnifyingGlassIcon}
      header={Header}
      output={state().output ? Output : undefined}
      footer={
        state().error ? () => <ErrorFooter error={state().error} /> : undefined
      }
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
