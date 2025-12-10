import { countSingleBackticks } from "./code-block-utils";
import { inlineCodePattern, inlineTripleBacktickPattern, whitespaceOrMarkersPattern } from "./patterns";

const handleInlineTripleBackticks = (text: string): string | null => {
  const inlineTripleBacktickMatch = text.match(inlineTripleBacktickPattern);
  if (!inlineTripleBacktickMatch || text.includes("\n")) return null;
  if (text.endsWith("``") && !text.endsWith("```")) return `${text}\``;
  return text;
};

const shouldSkipMultilineCodeBlocks = (text: string): boolean => {
  const allTripleBackticks = (text.match(/```/g) || []).length;
  if (allTripleBackticks > 0 && allTripleBackticks % 2 === 0 && text.includes("\n")) return true;
  if ((text.endsWith("```\n") || text.endsWith("```")) && allTripleBackticks % 2 === 0) return true;
  return false;
};

const isInsideIncompleteCodeBlock = (text: string): boolean => {
  const allTripleBackticks = (text.match(/```/g) || []).length;
  return allTripleBackticks % 2 === 1;
};

export const handleIncompleteInlineCode = (text: string): string => {
  const inlineResult = handleInlineTripleBackticks(text);
  if (inlineResult !== null) return inlineResult;
  if (shouldSkipMultilineCodeBlocks(text)) return text;
  const inlineCodeMatch = text.match(inlineCodePattern);
  if (inlineCodeMatch && !isInsideIncompleteCodeBlock(text)) {
    const contentAfterMarker = inlineCodeMatch[2];
    if (!contentAfterMarker || whitespaceOrMarkersPattern.test(contentAfterMarker)) return text;
    const singleBacktickCount = countSingleBackticks(text);
    if (singleBacktickCount % 2 === 1) return `${text}\``;
  }
  return text;
};
