export interface MentionTokenMatch {
  start: number;
  end: number;
  query: string;
}

function isMentionBoundary(char: string | undefined): boolean {
  if (!char) return true;
  return /\s|[([{'"`]/.test(char);
}

export function findMentionTokenAtCursor(
  text: string,
  cursor: number
): MentionTokenMatch | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const prefix = text.slice(0, safeCursor);
  const atIndex = prefix.lastIndexOf("@");
  if (atIndex === -1) return null;

  if (atIndex > 0) {
    const prev = text[atIndex - 1];
    if (!isMentionBoundary(prev)) return null;
  }

  const query = prefix.slice(atIndex + 1);
  if (/\s/.test(query)) return null;

  return {
    start: atIndex,
    end: safeCursor,
    query,
  };
}

export function applyMentionToken(
  text: string,
  token: MentionTokenMatch,
  filePath: string
): { text: string; cursor: number } {
  const replacement = `@${filePath}`;
  const needsTrailingSpace = text[token.end] !== " ";
  const suffix = needsTrailingSpace ? " " : "";
  const nextText = `${text.slice(0, token.start)}${replacement}${suffix}${text.slice(token.end)}`;
  const nextCursor = token.start + replacement.length + suffix.length;
  return { text: nextText, cursor: nextCursor };
}
