import { strikethroughPattern, whitespaceOrMarkersPattern } from "./patterns";

export const handleIncompleteStrikethrough = (text: string): string => {
  const strikethroughMatch = text.match(strikethroughPattern);
  if (strikethroughMatch) {
    const contentAfterMarker = strikethroughMatch[2];
    if (!contentAfterMarker || whitespaceOrMarkersPattern.test(contentAfterMarker)) return text;
    const tildePairs = (text.match(/~~/g) || []).length;
    if (tildePairs % 2 === 1) return `${text}~~`;
  }
  return text;
};
