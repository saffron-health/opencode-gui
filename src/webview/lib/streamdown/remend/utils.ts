import { letterNumberUnderscorePattern } from "./patterns";

export const isWordChar = (char: string): boolean => {
  if (!char) {
    return false;
  }
  const code = char.charCodeAt(0);
  if (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95
  ) {
    return true;
  }
  return letterNumberUnderscorePattern.test(char);
};

export const hasCompleteCodeBlock = (text: string): boolean => {
  const tripleBackticks = (text.match(/```/g) || []).length;
  return tripleBackticks > 0 && tripleBackticks % 2 === 0 && text.includes("\n");
};

export const findMatchingOpeningBracket = (text: string, closeIndex: number): number => {
  let depth = 1;
  for (let i = closeIndex - 1; i >= 0; i -= 1) {
    if (text[i] === "]") {
      depth += 1;
    } else if (text[i] === "[") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
};

export const findMatchingClosingBracket = (text: string, openIndex: number): number => {
  let depth = 1;
  for (let i = openIndex + 1; i < text.length; i += 1) {
    if (text[i] === "[") {
      depth += 1;
    } else if (text[i] === "]") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
};

export const isWithinMathBlock = (text: string, position: number): boolean => {
  let inInlineMath = false;
  let inBlockMath = false;

  for (let i = 0; i < text.length && i < position; i += 1) {
    if (text[i] === "\\" && text[i + 1] === "$") {
      i += 1;
      continue;
    }

    if (text[i] === "$") {
      if (text[i + 1] === "$") {
        inBlockMath = !inBlockMath;
        i += 1;
        inInlineMath = false;
      } else if (!inBlockMath) {
        inInlineMath = !inInlineMath;
      }
    }
  }

  return inInlineMath || inBlockMath;
};

const isBeforeClosingParen = (text: string, position: number): boolean => {
  for (let j = position; j < text.length; j += 1) {
    if (text[j] === ")") return true;
    if (text[j] === "\n") return false;
  }
  return false;
};

export const isWithinLinkOrImageUrl = (text: string, position: number): boolean => {
  for (let i = position - 1; i >= 0; i -= 1) {
    if (text[i] === ")") return false;
    if (text[i] === "(") {
      if (i > 0 && text[i - 1] === "]") {
        return isBeforeClosingParen(text, position);
      }
      return false;
    }
    if (text[i] === "\n") return false;
  }
  return false;
};

export const isHorizontalRule = (text: string, markerIndex: number, marker: string): boolean => {
  let lineStart = 0;
  for (let i = markerIndex - 1; i >= 0; i -= 1) {
    if (text[i] === "\n") {
      lineStart = i + 1;
      break;
    }
  }

  let lineEnd = text.length;
  for (let i = markerIndex; i < text.length; i += 1) {
    if (text[i] === "\n") {
      lineEnd = i;
      break;
    }
  }

  const line = text.substring(lineStart, lineEnd);
  let markerCount = 0;
  let hasNonWhitespaceNonMarker = false;

  for (const char of line) {
    if (char === marker) {
      markerCount += 1;
    } else if (char !== " " && char !== "\t") {
      hasNonWhitespaceNonMarker = true;
      break;
    }
  }

  return markerCount >= 3 && !hasNonWhitespaceNonMarker;
};
