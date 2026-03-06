export interface FileMentionReference {
  filePath: string;
  startLine?: number;
  endLine?: number;
}

function parsePositiveInteger(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1) return undefined;
  return value;
}

function normalizeLineRange(startLine?: number, endLine?: number): Pick<FileMentionReference, "startLine" | "endLine"> {
  const start = parsePositiveInteger(startLine);
  const end = parsePositiveInteger(endLine);
  if (start === undefined && end === undefined) {
    return {};
  }
  const resolvedStart = start ?? end;
  const resolvedEnd = end ?? start;
  if (resolvedStart === undefined || resolvedEnd === undefined) {
    return {};
  }
  return resolvedStart <= resolvedEnd
    ? { startLine: resolvedStart, endLine: resolvedEnd }
    : { startLine: resolvedEnd, endLine: resolvedStart };
}

export function parseFileMentionReference(raw: string): FileMentionReference {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(.*)#L(\d+)(?:-(\d+))?$/);
  if (!match) {
    return { filePath: trimmed };
  }

  const filePath = match[1]?.trim() ?? "";
  const startLine = Number.parseInt(match[2]!, 10);
  const endLine = match[3] ? Number.parseInt(match[3], 10) : startLine;
  const normalized = normalizeLineRange(startLine, endLine);
  return {
    filePath,
    startLine: normalized.startLine,
    endLine: normalized.endLine,
  };
}

export function encodeFileMentionReference(reference: FileMentionReference): string {
  const filePath = reference.filePath.trim();
  const normalized = normalizeLineRange(reference.startLine, reference.endLine);
  if (normalized.startLine === undefined || normalized.endLine === undefined) {
    return filePath;
  }
  if (normalized.startLine === normalized.endLine) {
    return `${filePath}#L${normalized.startLine}`;
  }
  return `${filePath}#L${normalized.startLine}-${normalized.endLine}`;
}

export function formatFileMentionLabel(reference: FileMentionReference): string {
  const filePath = reference.filePath.trim();
  const normalized = normalizeLineRange(reference.startLine, reference.endLine);
  if (normalized.startLine === undefined || normalized.endLine === undefined) {
    return filePath;
  }
  if (normalized.startLine === normalized.endLine) {
    return `${filePath} L${normalized.startLine}`;
  }
  return `${filePath} L${normalized.startLine}-${normalized.endLine}`;
}
