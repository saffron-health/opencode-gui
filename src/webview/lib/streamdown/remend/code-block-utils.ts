export const isInsideCodeBlock = (text: string, position: number): boolean => {
  let inInlineCode = false;
  let inMultilineCode = false;

  for (let i = 0; i < position; i += 1) {
    if (text.substring(i, i + 3) === "```") {
      inMultilineCode = !inMultilineCode;
      i += 2;
      continue;
    }
    if (!inMultilineCode && text[i] === "`") {
      inInlineCode = !inInlineCode;
    }
  }

  return inInlineCode || inMultilineCode;
};

export const isPartOfTripleBacktick = (text: string, i: number): boolean => {
  const isTripleStart = text.substring(i, i + 3) === "```";
  const isTripleMiddle = i > 0 && text.substring(i - 1, i + 2) === "```";
  const isTripleEnd = i > 1 && text.substring(i - 2, i + 1) === "```";
  return isTripleStart || isTripleMiddle || isTripleEnd;
};

export const countSingleBackticks = (text: string): number => {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "`" && !isPartOfTripleBacktick(text, i)) {
      count += 1;
    }
  }
  return count;
};
