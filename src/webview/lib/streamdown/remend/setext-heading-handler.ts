const DASH_ONLY_PATTERN = /^-{1,2}$/;
const DASH_WITH_SPACE_PATTERN = /^[\s]*-{1,2}[\s]+$/;
const EQUALS_ONLY_PATTERN = /^={1,2}$/;
const EQUALS_WITH_SPACE_PATTERN = /^[\s]*={1,2}[\s]+$/;

export const handleIncompleteSetextHeading = (text: string): string => {
  if (!text || typeof text !== "string") return text;
  const lastNewlineIndex = text.lastIndexOf("\n");
  if (lastNewlineIndex === -1) return text;
  const lastLine = text.substring(lastNewlineIndex + 1);
  const previousContent = text.substring(0, lastNewlineIndex);
  const trimmedLastLine = lastLine.trim();

  if (DASH_ONLY_PATTERN.test(trimmedLastLine) && !lastLine.match(DASH_WITH_SPACE_PATTERN)) {
    const lines = previousContent.split("\n");
    const previousLine = lines.at(-1);
    if (previousLine && previousLine.trim().length > 0) {
      return `${text}\u200B`;
    }
  }

  if (EQUALS_ONLY_PATTERN.test(trimmedLastLine) && !lastLine.match(EQUALS_WITH_SPACE_PATTERN)) {
    const lines = previousContent.split("\n");
    const previousLine = lines.at(-1);
    if (previousLine && previousLine.trim().length > 0) {
      return `${text}\u200B`;
    }
  }

  return text;
};
