import type { AssistantMessage } from "@opencode-ai/sdk/v2/client";
import type { ContextInfo, FileChangesInfo } from "../types";

/** Default context window used to compute the context-usage percentage. */
export const CONTEXT_TOKEN_LIMIT = 200000;

interface DiffLike {
  additions?: number;
  deletions?: number;
}

interface SummaryLike {
  additions: number;
  deletions: number;
  files: number;
  diffs?: DiffLike[];
}

function aggregate(diffs: DiffLike[]): { additions: number; deletions: number } {
  return {
    additions: diffs.reduce((sum, d) => sum + (d.additions || 0), 0),
    deletions: diffs.reduce((sum, d) => sum + (d.deletions || 0), 0),
  };
}

/** Derive file-change stats from a session summary (prefers detailed diffs). */
export function deriveFileChangesFromSummary(
  summary: SummaryLike | undefined | null,
): FileChangesInfo | null {
  if (!summary) return null;
  if (summary.diffs && summary.diffs.length > 0) {
    return { fileCount: summary.diffs.length, ...aggregate(summary.diffs) };
  }
  if (summary.files > 0) {
    return {
      fileCount: summary.files,
      additions: summary.additions,
      deletions: summary.deletions,
    };
  }
  return null;
}

/** Derive file-change stats from a session.diff event payload. */
export function deriveFileChangesFromDiff(diff: DiffLike[]): FileChangesInfo {
  return { fileCount: diff.length, ...aggregate(diff) };
}

/** Derive context-window usage from an assistant message's token counts. */
export function deriveContextInfo(message: AssistantMessage): ContextInfo | null {
  const { tokens } = message;
  const usedTokens =
    tokens.input +
    tokens.output +
    tokens.reasoning +
    tokens.cache.read +
    tokens.cache.write;
  if (usedTokens <= 0) return null;
  return {
    usedTokens,
    limitTokens: CONTEXT_TOKEN_LIMIT,
    percentage: Math.min(100, (usedTokens / CONTEXT_TOKEN_LIMIT) * 100),
  };
}
