/* @jsxImportSource solid-js */
import type { MessagePart } from "../../types";
import { Streamdown } from "../../lib/streamdown";

interface TextBlockProps {
  part: MessagePart;
  isStreaming?: boolean;
}

export function TextBlock(props: TextBlockProps) {
  if (!props.part.text) return null;
  
  return (
    <Streamdown 
      mode={props.isStreaming ? "streaming" : "static"}
      class="message-text"
    >
      {props.part.text}
    </Streamdown>
  );
}
