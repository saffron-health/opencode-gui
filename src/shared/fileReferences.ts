export interface FileReferenceTarget {
  url: string;
  startLine?: number;
  endLine?: number;
}

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

function normalizeLineRange(start?: number, end?: number): Pick<FileReferenceTarget, "startLine" | "endLine"> {
  if (start === undefined && end === undefined) {
    return {};
  }
  if (start === undefined) {
    return {};
  }
  if (end === undefined) {
    return { startLine: start, endLine: start };
  }
  if (end < start) {
    return { startLine: end, endLine: start };
  }
  return { startLine: start, endLine: end };
}

function parseLineRangeToken(token: string): Pick<FileReferenceTarget, "startLine" | "endLine"> {
  const trimmed = token.trim();
  if (!trimmed) return {};

  const normalized = trimmed.replace(/^line=/i, "");
  const match = normalized.match(/^L?(\d+)(?:C\d+)?(?:[-:](?:L)?(\d+)(?:C\d+)?)?$/i);
  if (!match) return {};

  const start = parsePositiveInteger(match[1] ?? null);
  const end = parsePositiveInteger(match[2] ?? null);
  return normalizeLineRange(start, end);
}

function parseLineRangeFromHash(hash: string): Pick<FileReferenceTarget, "startLine" | "endLine"> {
  if (!hash) return {};
  const fragment = decodeURIComponent(hash.replace(/^#/, ""));
  return parseLineRangeToken(fragment);
}

function parseLineRangeFromPathname(pathname: string): {
  pathname: string;
  startLine?: number;
  endLine?: number;
} {
  const match = pathname.match(/:(\d+)(?::(\d+))?$/);
  if (!match) {
    return { pathname };
  }

  const start = parsePositiveInteger(match[1] ?? null);
  const end = parsePositiveInteger(match[2] ?? null);
  if (start === undefined) {
    return { pathname };
  }

  const normalized = normalizeLineRange(start, end);
  return {
    pathname: pathname.slice(0, -match[0].length),
    startLine: normalized.startLine,
    endLine: normalized.endLine,
  };
}

/**
 * Parses a file:// reference and extracts line metadata from query/hash/path suffix.
 * Returns a normalized URL without query/hash/line suffix for opening in the editor.
 */
export function parseFileReferenceTarget(rawUrl: string): FileReferenceTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== "file:") {
    return null;
  }

  const fromPath = parseLineRangeFromPathname(parsed.pathname);
  parsed.pathname = fromPath.pathname;

  const queryStart =
    parsePositiveInteger(parsed.searchParams.get("start")) ??
    parsePositiveInteger(parsed.searchParams.get("line"));
  const queryEnd = parsePositiveInteger(parsed.searchParams.get("end"));
  const fromHash = parseLineRangeFromHash(parsed.hash);

  let startLine: number | undefined;
  let endLine: number | undefined;
  if (queryStart !== undefined || queryEnd !== undefined) {
    startLine = queryStart ?? queryEnd;
    endLine = queryEnd;
  } else if (fromHash.startLine !== undefined || fromHash.endLine !== undefined) {
    startLine = fromHash.startLine ?? fromHash.endLine;
    endLine = fromHash.endLine;
  } else {
    startLine = fromPath.startLine;
    endLine = fromPath.endLine;
  }
  const normalized = normalizeLineRange(startLine, endLine);

  parsed.search = "";
  parsed.hash = "";

  return {
    url: parsed.toString(),
    startLine: normalized.startLine,
    endLine: normalized.endLine,
  };
}
