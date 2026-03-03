
import { Show } from "solid-js";
import type { MessagePart } from "../../types";
import { Streamdown } from "../../lib/streamdown";

interface TextBlockProps {
  part: MessagePart;
  isStreaming?: boolean;
}

export function TextBlock(props: TextBlockProps) {
  return (
    <Show when={props.part.text}>
      <Streamdown 
        mode={props.isStreaming ? "streaming" : "static"}
        class="message-text"
      >
        {props.part.text!}
      </Streamdown>
    </Show>
  );
}
