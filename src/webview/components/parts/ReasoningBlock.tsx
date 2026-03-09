
import type { MessagePart } from "../../types";

interface ReasoningBlockProps {
  part: MessagePart;
}

const DEFAULT_REASONING_TITLE = "Thinking";
const LEADING_BOLD_TITLE_REGEX = /^\s*\*\*([^\n]+?)\*\*/;

function getReasoningTitle(text: string): string {
  const match = text.match(LEADING_BOLD_TITLE_REGEX);
  if (!match) return DEFAULT_REASONING_TITLE;

  const title = match[1].trim();
  return title.length > 0 ? title : DEFAULT_REASONING_TITLE;
}

export function ReasoningBlock(props: ReasoningBlockProps) {
  const title = () => getReasoningTitle(props.part.text ?? "");

  return (
    <details class="reasoning-block">
      <summary>
        <span>{title()}</span>
      </summary>
      <div class="reasoning-content">{props.part.text}</div>
    </details>
  );
}
