import { Show, createMemo } from "solid-js";
import type { MessagePart, Permission } from "../../types";
import { ToolCallTemplate } from "./ToolCallTemplate";
import { FileIcon } from "./ToolCallIcons";
import {
  getToolInputs,
  toRelativePath,
  splitFilePath,
  type ToolState,
} from "./ToolCallHelpers";

interface ReadToolCallProps {
  part: MessagePart;
  workspaceRoot?: string;
  pendingPermissions?: Map<string, Permission>;
  onPermissionResponse?: (
    permissionId: string,
    response: "once" | "always" | "reject",
  ) => void;
}

export function ReadToolCall(props: ReadToolCallProps) {
  const state = () => props.part.state as ToolState;
  const inputs = () => getToolInputs(state(), props.part);

  const relativePath = createMemo(() =>
    toRelativePath(
      (inputs().filePath as string) || (inputs().path as string),
      props.workspaceRoot,
    ),
  );

  const lineRange = createMemo(() => {
    const offset = inputs().offset as number | undefined;
    const limit = inputs().limit as number | undefined;
    if (offset !== undefined || limit !== undefined) {
      const start = (offset || 0) + 1;
      const end = limit !== undefined ? start + limit - 1 : undefined;
      return end !== undefined ? `L${start}-${end}` : `L${start}+`;
    }
    return undefined;
  });

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
      <span class="tool-text tool-file-path">
        {(() => {
          const path = relativePath() || "Reading file";
          const { dirPath, fileName, slash } = splitFilePath(path);
          return (
            <>
              <span class="tool-file-dir">{dirPath}</span>
              <span class="tool-file-slash">{slash}</span>
              <span class="tool-file-name">{fileName}</span>
            </>
          );
        })()}
      </span>
      <Show when={lineRange()}>
        <span class="tool-sub-text">{lineRange()}</span>
      </Show>
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
      icon={FileIcon}
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
