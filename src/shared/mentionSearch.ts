function normalizePath(input: string): string {
  return input.replace(/\\/g, "/").toLowerCase();
}

export function normalizeMentionQuery(query: string): string {
  return normalizePath(query.trim());
}

export function filePathMatchesMentionQuery(filePath: string, normalizedQuery: string): boolean {
  if (!normalizedQuery) return false;
  return normalizePath(filePath).includes(normalizedQuery);
}

export function mentionMatchScore(filePath: string, normalizedQuery: string): number {
  const normalizedPath = normalizePath(filePath);
  const fileName = normalizedPath.split("/").pop() ?? normalizedPath;
  const query = normalizedQuery;

  if (fileName === query) return 0;
  if (fileName.startsWith(query)) return 10;
  if (normalizedPath.startsWith(query)) return 20;
  if (normalizedPath.includes(`/${query}`)) return 30;

  const index = normalizedPath.indexOf(query);
  if (index === -1) return Number.MAX_SAFE_INTEGER;

  return 40 + index;
}
