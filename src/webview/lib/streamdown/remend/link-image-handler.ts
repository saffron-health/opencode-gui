import { isInsideCodeBlock } from "./code-block-utils";
import { findMatchingClosingBracket, findMatchingOpeningBracket } from "./utils";

const handleIncompleteUrl = (text: string, lastParenIndex: number): string | null => {
  const afterParen = text.substring(lastParenIndex + 2);
  if (afterParen.includes(")")) return null;
  const openBracketIndex = findMatchingOpeningBracket(text, lastParenIndex);
  if (openBracketIndex === -1 || isInsideCodeBlock(text, openBracketIndex)) return null;
  const isImage = openBracketIndex > 0 && text[openBracketIndex - 1] === "!";
  const startIndex = isImage ? openBracketIndex - 1 : openBracketIndex;
  const beforeLink = text.substring(0, startIndex);
  if (isImage) return beforeLink;
  const linkText = text.substring(openBracketIndex + 1, lastParenIndex);
  return `${beforeLink}[${linkText}](streamdown:incomplete-link)`;
};

const handleIncompleteText = (text: string, i: number): string | null => {
  const isImage = i > 0 && text[i - 1] === "!";
  const openIndex = isImage ? i - 1 : i;
  const afterOpen = text.substring(i + 1);
  if (!afterOpen.includes("]")) {
    const beforeLink = text.substring(0, openIndex);
    if (isImage) return beforeLink;
    return `${text}](streamdown:incomplete-link)`;
  }
  const closingIndex = findMatchingClosingBracket(text, i);
  if (closingIndex === -1) {
    const beforeLink = text.substring(0, openIndex);
    if (isImage) return beforeLink;
    return `${text}](streamdown:incomplete-link)`;
  }
  return null;
};

export const handleIncompleteLinksAndImages = (text: string): string => {
  const lastParenIndex = text.lastIndexOf("](");
  if (lastParenIndex !== -1 && !isInsideCodeBlock(text, lastParenIndex)) {
    const result = handleIncompleteUrl(text, lastParenIndex);
    if (result !== null) return result;
  }
  for (let i = text.length - 1; i >= 0; i -= 1) {
    if (text[i] === "[" && !isInsideCodeBlock(text, i)) {
      const result = handleIncompleteText(text, i);
      if (result !== null) return result;
    }
  }
  return text;
};
