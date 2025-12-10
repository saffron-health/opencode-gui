import {
  boldItalicPattern,
  boldPattern,
  fourOrMoreAsterisksPattern,
  italicPattern,
  listItemPattern,
  singleAsteriskPattern,
  singleUnderscorePattern,
  whitespaceOrMarkersPattern,
} from "./patterns";
import {
  hasCompleteCodeBlock,
  isHorizontalRule,
  isWithinLinkOrImageUrl,
  isWithinMathBlock,
  isWordChar,
} from "./utils";

const isAsteriskListMarker = (text: string, index: number, nextChar: string): boolean => {
  if (nextChar !== " " && nextChar !== "\t") return false;
  let lineStartIndex = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (text[i] === "\n") {
      lineStartIndex = i + 1;
      break;
    }
  }
  for (let i = lineStartIndex; i < index; i += 1) {
    if (text[i] !== " " && text[i] !== "\t") return false;
  }
  return true;
};

const shouldSkipAsterisk = (text: string, index: number, prevChar: string, nextChar: string): boolean => {
  if (prevChar === "\\") return true;
  if (prevChar !== "*" && nextChar === "*") {
    const nextNextChar = index < text.length - 2 ? text[index + 2] : "";
    if (nextNextChar === "*") return false;
    return true;
  }
  if (prevChar === "*") return true;
  if (prevChar && nextChar && isWordChar(prevChar) && isWordChar(nextChar)) return true;
  if (isAsteriskListMarker(text, index, nextChar)) return true;
  return false;
};

export const countSingleAsterisks = (text: string): number => {
  let count = 0;
  const len = text.length;
  for (let index = 0; index < len; index += 1) {
    if (text[index] !== "*") continue;
    const prevChar = index > 0 ? text[index - 1] : "";
    const nextChar = index < len - 1 ? text[index + 1] : "";
    if (!shouldSkipAsterisk(text, index, prevChar, nextChar)) count += 1;
  }
  return count;
};

const shouldSkipUnderscore = (text: string, index: number, prevChar: string, nextChar: string): boolean => {
  if (prevChar === "\\") return true;
  const hasMathBlocks = text.includes("$");
  if (hasMathBlocks && isWithinMathBlock(text, index)) return true;
  if (isWithinLinkOrImageUrl(text, index)) return true;
  if (prevChar === "_" || nextChar === "_") return true;
  if (prevChar && nextChar && isWordChar(prevChar) && isWordChar(nextChar)) return true;
  return false;
};

export const countSingleUnderscores = (text: string): number => {
  let count = 0;
  const len = text.length;
  for (let index = 0; index < len; index += 1) {
    if (text[index] !== "_") continue;
    const prevChar = index > 0 ? text[index - 1] : "";
    const nextChar = index < len - 1 ? text[index + 1] : "";
    if (!shouldSkipUnderscore(text, index, prevChar, nextChar)) count += 1;
  }
  return count;
};

export const countTripleAsterisks = (text: string): number => {
  let count = 0;
  let consecutiveAsterisks = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "*") {
      consecutiveAsterisks += 1;
    } else {
      if (consecutiveAsterisks >= 3) count += Math.floor(consecutiveAsterisks / 3);
      consecutiveAsterisks = 0;
    }
  }
  if (consecutiveAsterisks >= 3) count += Math.floor(consecutiveAsterisks / 3);
  return count;
};

const shouldSkipBoldCompletion = (text: string, contentAfterMarker: string, markerIndex: number): boolean => {
  if (!contentAfterMarker || whitespaceOrMarkersPattern.test(contentAfterMarker)) return true;
  const beforeMarker = text.substring(0, markerIndex);
  const lastNewlineBeforeMarker = beforeMarker.lastIndexOf("\n");
  const lineStart = lastNewlineBeforeMarker === -1 ? 0 : lastNewlineBeforeMarker + 1;
  const lineBeforeMarker = text.substring(lineStart, markerIndex);
  if (listItemPattern.test(lineBeforeMarker)) {
    if (contentAfterMarker.includes("\n")) return true;
  }
  return isHorizontalRule(text, markerIndex, "*");
};

export const handleIncompleteBold = (text: string): string => {
  if (hasCompleteCodeBlock(text)) return text;
  const boldMatch = text.match(boldPattern);
  if (!boldMatch) return text;
  const contentAfterMarker = boldMatch[2];
  const markerIndex = text.lastIndexOf(boldMatch[1]);
  if (shouldSkipBoldCompletion(text, contentAfterMarker, markerIndex)) return text;
  const asteriskPairs = (text.match(/\*\*/g) || []).length;
  if (asteriskPairs % 2 === 1) return `${text}**`;
  return text;
};

const shouldSkipItalicCompletion = (text: string, contentAfterMarker: string, markerIndex: number): boolean => {
  if (!contentAfterMarker || whitespaceOrMarkersPattern.test(contentAfterMarker)) return true;
  const beforeMarker = text.substring(0, markerIndex);
  const lastNewlineBeforeMarker = beforeMarker.lastIndexOf("\n");
  const lineStart = lastNewlineBeforeMarker === -1 ? 0 : lastNewlineBeforeMarker + 1;
  const lineBeforeMarker = text.substring(lineStart, markerIndex);
  if (listItemPattern.test(lineBeforeMarker)) {
    if (contentAfterMarker.includes("\n")) return true;
  }
  return isHorizontalRule(text, markerIndex, "_");
};

export const handleIncompleteDoubleUnderscoreItalic = (text: string): string => {
  const italicMatch = text.match(italicPattern);
  if (!italicMatch) return text;
  const contentAfterMarker = italicMatch[2];
  const markerIndex = text.lastIndexOf(italicMatch[1]);
  if (shouldSkipItalicCompletion(text, contentAfterMarker, markerIndex)) return text;
  const underscorePairs = (text.match(/__/g) || []).length;
  if (underscorePairs % 2 === 1) return `${text}__`;
  return text;
};

const findFirstSingleAsteriskIndex = (text: string): number => {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "*" && text[i - 1] !== "*" && text[i + 1] !== "*" && text[i - 1] !== "\\") {
      const prevChar = i > 0 ? text[i - 1] : "";
      const nextChar = i < text.length - 1 ? text[i + 1] : "";
      if (prevChar && nextChar && isWordChar(prevChar) && isWordChar(nextChar)) continue;
      return i;
    }
  }
  return -1;
};

export const handleIncompleteSingleAsteriskItalic = (text: string): string => {
  if (hasCompleteCodeBlock(text)) return text;
  const singleAsteriskMatch = text.match(singleAsteriskPattern);
  if (!singleAsteriskMatch) return text;
  const firstSingleAsteriskIndex = findFirstSingleAsteriskIndex(text);
  if (firstSingleAsteriskIndex === -1) return text;
  const contentAfterFirstAsterisk = text.substring(firstSingleAsteriskIndex + 1);
  if (!contentAfterFirstAsterisk || whitespaceOrMarkersPattern.test(contentAfterFirstAsterisk)) return text;
  const singleAsterisks = countSingleAsterisks(text);
  if (singleAsterisks % 2 === 1) return `${text}*`;
  return text;
};

const findFirstSingleUnderscoreIndex = (text: string): number => {
  for (let i = 0; i < text.length; i += 1) {
    if (
      text[i] === "_" &&
      text[i - 1] !== "_" &&
      text[i + 1] !== "_" &&
      text[i - 1] !== "\\" &&
      !isWithinMathBlock(text, i) &&
      !isWithinLinkOrImageUrl(text, i)
    ) {
      const prevChar = i > 0 ? text[i - 1] : "";
      const nextChar = i < text.length - 1 ? text[i + 1] : "";
      if (prevChar && nextChar && isWordChar(prevChar) && isWordChar(nextChar)) continue;
      return i;
    }
  }
  return -1;
};

const insertClosingUnderscore = (text: string): string => {
  let endIndex = text.length;
  while (endIndex > 0 && text[endIndex - 1] === "\n") endIndex -= 1;
  if (endIndex < text.length) {
    const textBeforeNewlines = text.slice(0, endIndex);
    const trailingNewlines = text.slice(endIndex);
    return `${textBeforeNewlines}_${trailingNewlines}`;
  }
  return `${text}_`;
};

export const handleIncompleteSingleUnderscoreItalic = (text: string): string => {
  if (hasCompleteCodeBlock(text)) return text;
  const singleUnderscoreMatch = text.match(singleUnderscorePattern);
  if (!singleUnderscoreMatch) return text;
  const firstSingleUnderscoreIndex = findFirstSingleUnderscoreIndex(text);
  if (firstSingleUnderscoreIndex === -1) return text;
  const contentAfterFirstUnderscore = text.substring(firstSingleUnderscoreIndex + 1);
  if (!contentAfterFirstUnderscore || whitespaceOrMarkersPattern.test(contentAfterFirstUnderscore)) return text;
  const singleUnderscores = countSingleUnderscores(text);
  if (singleUnderscores % 2 === 1) return insertClosingUnderscore(text);
  return text;
};

export const handleIncompleteBoldItalic = (text: string): string => {
  if (hasCompleteCodeBlock(text)) return text;
  if (fourOrMoreAsterisksPattern.test(text)) return text;
  const boldItalicMatch = text.match(boldItalicPattern);
  if (boldItalicMatch) {
    const contentAfterMarker = boldItalicMatch[2];
    if (!contentAfterMarker || whitespaceOrMarkersPattern.test(contentAfterMarker)) return text;
    const markerIndex = text.lastIndexOf(boldItalicMatch[1]);
    if (isHorizontalRule(text, markerIndex, "*")) return text;
    const tripleAsteriskCount = countTripleAsterisks(text);
    if (tripleAsteriskCount % 2 === 1) return `${text}***`;
  }
  return text;
};
