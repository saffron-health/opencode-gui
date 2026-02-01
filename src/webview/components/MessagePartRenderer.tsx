
import type { Accessor } from "solid-js";
import type { MessagePart, Permission } from "../types";
import { TextBlock } from "./parts/TextBlock";
import { ReasoningBlock } from "./parts/ReasoningBlock";
import { ToolCall } from "./parts/ToolCall";

// System subagent types that should be hidden from the UI
const HIDDEN_SUBAGENT_TYPES = new Set(["compaction", "title", "summary"]);

interface MessagePartRendererProps {
  part: MessagePart;
  workspaceRoot?: string;
  pendingPermissions?: Accessor<Map<string, Permission>>;
  onPermissionResponse?: (permissionId: string, response: "once" | "always" | "reject") => void;
  isStreaming?: boolean;
}

function isHiddenSystemTask(part: MessagePart): boolean {
  if (part.type !== "tool") return false;
  if (part.tool !== "task") return false;
  const subagentType = part.state?.input?.subagent_type as string | undefined;
  return !!subagentType && HIDDEN_SUBAGENT_TYPES.has(subagentType);
}

export function MessagePartRenderer(props: MessagePartRendererProps) {
  // Hide system task tool calls (compaction, title, summary)
  if (isHiddenSystemTask(props.part)) {
    return null;
  }

  switch (props.part.type) {
    case "text":
      return <TextBlock part={props.part} isStreaming={props.isStreaming} />;
    case "reasoning":
      return <ReasoningBlock part={props.part} />;
    case "tool":
      return <ToolCall part={props.part} workspaceRoot={props.workspaceRoot} pendingPermissions={props.pendingPermissions} onPermissionResponse={props.onPermissionResponse} />;
    case "step-start":
    case "step-finish":
      return null;
    default:
      return null;
  }
}
