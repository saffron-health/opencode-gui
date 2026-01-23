import { createMemo } from "solid-js";
import { Show } from "solid-js";
import type { ToolState as BaseToolState, MessagePart, Permission } from "../../types";

export type ToolState = Omit<BaseToolState, "input"> & {
  input?: Record<string, unknown>;
};

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
    return { dirPath: "", fileName: filePath, slash: "/" };
  }

  return {
    dirPath: filePath.substring(0, lastSlash),
    fileName: filePath.substring(lastSlash + 1),
    slash: "/",
  };
}

// Safely extract the tool inputs from either state.input or part.input (SDK may send either)
export function getToolInputs(
  state: ToolState,
  part?: MessagePart,
): Record<string, unknown> {
  const raw = (state?.input ??
    (part as unknown as { input?: unknown })?.input) as unknown;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

// Shared permission lookup logic
export function usePermission(
  part: MessagePart,
  pendingPermissions?: Map<string, Permission>,
) {
  return createMemo(() => {
    const perms = pendingPermissions;
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
