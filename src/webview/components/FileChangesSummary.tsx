
import { Show } from "solid-js";
import type { FileChangesInfo } from "../types";

interface FileChangesSummaryProps {
  fileChanges: FileChangesInfo | null;
}

export function FileChangesSummary(props: FileChangesSummaryProps) {
  const hasChanges = () => {
    const changes = props.fileChanges;
    return changes && (changes.fileCount > 0 || changes.additions > 0 || changes.deletions > 0);
  };

  return (
    <Show when={hasChanges()}>
      <span class="file-changes-summary">
        {props.fileChanges!.fileCount} file{props.fileChanges!.fileCount !== 1 ? 's' : ''} changed{' '}
        <Show when={props.fileChanges!.additions > 0}>
          <span class="file-changes-summary__additions">+{props.fileChanges!.additions}</span>{' '}
        </Show>
        <Show when={props.fileChanges!.deletions > 0}>
          <span class="file-changes-summary__deletions">-{props.fileChanges!.deletions}</span>
        </Show>
      </span>
    </Show>
  );
}
