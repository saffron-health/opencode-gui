import { Show, createMemo, type Accessor } from "solid-js";
import type { MessagePart, Permission, ToolState } from "../../types";
import { ToolCallTemplate } from "./ToolCallTemplate";
import { FileDiffIcon } from "./ToolCallIcons";
import {
  getToolInputs,
  toRelativePath,
  splitFilePath,
  usePermission,
  ErrorFooter,
} from "./ToolCallHelpers";
import { DiffViewer, getDiffStats } from "./DiffViewer";

interface EditToolCallProps {
  part: MessagePart;
  workspaceRoot?: string;
  pendingPermissions?: Accessor<Map<string, Permission>>;
  onPermissionResponse?: (
    permissionId: string,
    response: "once" | "always" | "reject",
  ) => void;
}

export function EditToolCall(props: EditToolCallProps) {
  const state = () => props.part.state as ToolState;
  const inputs = () => getToolInputs(state(), props.part);

  const relativePath = createMemo(() =>
    toRelativePath(
      (inputs().filePath as string) || (inputs().path as string),
      props.workspaceRoot,
    ),
  );

  const diffStats = createMemo(() => {
    const diff = state().metadata?.diff as string | undefined;
    return diff ? getDiffStats(diff) : null;
  });

  const diagnosticsCount = createMemo(() => {
    const diagnosticsMap = state().metadata?.diagnostics as
      | Record<string, Array<{ severity: number }>>
      | undefined;
    if (!diagnosticsMap) return null;

    const allDiagnostics = Object.values(diagnosticsMap).flat();
    const errorCount = allDiagnostics.filter((d) => d.severity === 1).length;
    const warningCount = allDiagnostics.filter((d) => d.severity === 2).length;

    return { errors: errorCount, warnings: warningCount };
  });

  const permission = usePermission(props.part, () =>
    props.pendingPermissions?.(),
  );

  const Header = () => (
    <>
      <span class="tool-header-text">
        <span class="tool-text tool-file-path">
          {(() => {
            const path = relativePath() || "Editing file";
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
      </span>
      <Show when={diffStats()}>
        <span class="tool-diff-stats">
          <Show when={diffStats()!.additions > 0}>
            <span class="tool-diff-stats__additions">
              +{diffStats()!.additions}
            </span>
          </Show>
          <Show when={diffStats()!.deletions > 0}>
            <span class="tool-diff-stats__deletions">
              -{diffStats()!.deletions}
            </span>
          </Show>
        </span>
      </Show>
    </>
  );

  const Output = () => (
    <Show when={state().metadata?.diff}>
      <DiffViewer diff={state().metadata!.diff as string} />
    </Show>
  );

  const Footer = () => (
    <>
      <ErrorFooter error={state().error} />
      <Show
        when={
          diagnosticsCount() &&
          (diagnosticsCount()!.errors > 0 || diagnosticsCount()!.warnings > 0)
        }
      >
        <div class="tool-footer tool-footer--diagnostics">
          <Show when={diagnosticsCount()!.errors > 0}>
            <span class="tool-diagnostics__errors">
              {diagnosticsCount()!.errors} diagnostic error
              {diagnosticsCount()!.errors !== 1 ? "s" : ""}
            </span>
          </Show>
          <Show when={diagnosticsCount()!.warnings > 0}>
            <span class="tool-diagnostics__warnings">
              {diagnosticsCount()!.warnings} warning
              {diagnosticsCount()!.warnings !== 1 ? "s" : ""}
            </span>
          </Show>
        </div>
      </Show>
    </>
  );

  const hasOutput = () => !!state().metadata?.diff;
  const hasFooter = () =>
    !!(
      state().error ||
      (diagnosticsCount() &&
        (diagnosticsCount()!.errors > 0 || diagnosticsCount()!.warnings > 0))
    );

  return (
    <ToolCallTemplate
      icon={FileDiffIcon}
      header={Header}
      output={hasOutput() ? Output : undefined}
      footer={hasFooter() ? Footer : undefined}
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
