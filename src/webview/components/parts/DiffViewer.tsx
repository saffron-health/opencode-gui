
import { For, Show, createMemo } from "solid-js";

interface DiffViewerProps {
  diff: string;
}

interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
}

interface ParsedDiff {
  startLine: number;
  endLine: number;
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

export interface DiffStats {
  additions: number;
  deletions: number;
}

export function getDiffStats(diff: string): DiffStats {
  const lines = diff.split("\n");
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions++;
    }
  }

  return { additions, deletions };
}

function parseDiff(diff: string): ParsedDiff {
  const rawLines = diff.split("\n");
  const lines: DiffLine[] = [];
  let startLine = 0;
  let currentLine = 0;
  let additions = 0;
  let deletions = 0;

  for (const line of rawLines) {
    if (line.startsWith("@@")) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        startLine = parseInt(match[1], 10);
        currentLine = startLine;
      }
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      lines.push({ type: "add", content: line.slice(1) });
      currentLine++;
      additions++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      lines.push({ type: "remove", content: line.slice(1) });
      deletions++;
    } else if (line.startsWith(" ")) {
      lines.push({ type: "context", content: line.slice(1) });
      currentLine++;
    }
  }

  return {
    startLine,
    endLine: currentLine - 1,
    lines,
    additions,
    deletions,
  };
}

export function DiffViewer(props: DiffViewerProps) {
  const parsed = createMemo(() => parseDiff(props.diff));

  return (
    <div class="diff-viewer">
      <Show when={parsed().lines.length > 0}>
        <div class="diff-line-range">
          <span class="diff-line-range-num">{parsed().startLine}</span>
        </div>
      </Show>
      <For each={parsed().lines}>
        {(line) => (
          <div
            class="diff-line"
            classList={{
              "diff-line--add": line.type === "add",
              "diff-line--remove": line.type === "remove",
              "diff-line--context": line.type === "context",
            }}
          >
            <span class="diff-line-sign">
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
            </span>
            <span class="diff-line-content"> {line.content}</span>
          </div>
        )}
      </For>
      <Show when={parsed().lines.length > 0}>
        <div class="diff-line-range diff-line-range--end">
          <span class="diff-line-range-num">{parsed().endLine}</span>
        </div>
      </Show>
    </div>
  );
}
