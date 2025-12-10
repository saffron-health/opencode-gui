/* @jsxImportSource solid-js */
import { Show, createMemo } from "solid-js";
import type { ContextInfo } from "../types";

interface ContextIndicatorProps {
  contextInfo: ContextInfo | null;
}

export function ContextIndicator(props: ContextIndicatorProps) {
  const percentage = createMemo(() => props.contextInfo?.percentage ?? 0);
  
  // Color based on usage: white < 60%, pale yellow 60-85%, orange > 85%
  const color = createMemo(() => 
    percentage() < 60 
      ? 'var(--vscode-foreground)' 
      : percentage() < 85 
      ? '#d4c27c' 
      : '#e59c4b'
  );

  return (
    <Show when={props.contextInfo}>
      <div class="context-indicator">
        <svg class="context-indicator__ring" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            class="context-indicator__ring-bg"
            cx="50"
            cy="50"
            r="42"
            stroke-width="16"
            fill="none"
          />
          {/* Progress circle */}
          <circle
            class="context-indicator__ring-progress"
            cx="50"
            cy="50"
            r="42"
            stroke={color()}
            stroke-width="16"
            stroke-linecap="round"
            fill="none"
            stroke-dasharray="264"
            stroke-dashoffset={264 - (264 * percentage()) / 100}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <span class="context-indicator__text">
          {percentage().toFixed(0)}%
        </span>
      </div>
    </Show>
  );
}
