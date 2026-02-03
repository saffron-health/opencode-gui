import { createMemo } from "solid-js";
import { Show } from "solid-js";
import type { ToolState, MessagePart, Permission } from "../../types";

export function toRelativePath(
  absolutePath: string | undefined,
  workspaceRoot?: string,
): string | undefined {
  if (!absolutePath || !workspaceRoot) return absolutePath;

  // Ensure paths have consistent separators
  const normalizedAbsolute = absolutePath.replace(/\\/g, "/");
  const normalizedRoot = workspaceRoot.replace(/\\/g, "/");

  // Check if the path starts with the workspace root
  if (normalizedAbsolute.startsWith(normalizedRoot)) {
    let relativePath = normalizedAbsolute.slice(normalizedRoot.length);
    // Remove leading slash if present
    if (relativePath.startsWith("/")) {
      relativePath = relativePath.slice(1);
    }
    return relativePath || ".";
  }

  return absolutePath;
}

export function splitFilePath(filePath: string): {
  dirPath: string;
  fileName: string;
  slash: string;
} {
  const lastSlash = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\"),
  );

  if (lastSlash === -1) {
    // No directory, just filename
    return { dirPath: "", fileName: filePath, slash: "" };
  }

  const dirPath = filePath.substring(0, lastSlash);
  return {
    dirPath,
    fileName: filePath.substring(lastSlash + 1),
    // Only show slash if there's actually a directory
    slash: dirPath ? "/" : "",
  };
}

// Extract the tool inputs from state
export function getToolInputs(
  state: ToolState,
  _part?: MessagePart,
): Record<string, unknown> {
  return state?.input ?? {};
}

// Shared permission lookup logic
export function usePermission(
  part: MessagePart,
  pendingPermissions: () => Map<string, Permission> | undefined,
) {
  return createMemo(() => {
    // Call the accessor inside memo to track it as a dependency
    const perms = pendingPermissions();
    if (!perms) return undefined;
    const callID = part.callID;

    if (callID && perms.has(callID)) {
      return perms.get(callID);
    }
    if (perms.has(part.id)) {
      return perms.get(part.id);
    }

    return undefined;
  });
}

// Shared error footer component
export function ErrorFooter(props: { error?: string }) {
  const isInterrupted = () =>
    props.error?.toLowerCase().includes("interrupted");

  return (
    <Show when={props.error}>
      <div class="tool-footer tool-footer--error">
        <Show when={isInterrupted()} fallback={props.error}>
          Interrupted
        </Show>
      </div>
    </Show>
  );
}
