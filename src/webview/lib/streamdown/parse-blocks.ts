import { Lexer } from "marked";

const footnoteReferencePattern = /\[\^[^\]\s]{1,200}\](?!:)/;
const footnoteDefinitionPattern = /\[\^[^\]\s]{1,200}\]:/;
const closingTagPattern = /<\/(\w+)>/;
const openingTagPattern = /<(\w+)[\s>]/;

const startsWithDoubleDollar = (str: string): boolean => {
  let i = 0;
  while (i < str.length && (str[i] === " " || str[i] === "\t" || str[i] === "\n" || str[i] === "\r")) {
    i += 1;
  }
  return i + 1 < str.length && str[i] === "$" && str[i + 1] === "$";
};

const endsWithDoubleDollar = (str: string): boolean => {
  let i = str.length - 1;
  while (i >= 0 && (str[i] === " " || str[i] === "\t" || str[i] === "\n" || str[i] === "\r")) {
    i -= 1;
  }
  return i >= 1 && str[i] === "$" && str[i - 1] === "$";
};

const countDoubleDollars = (str: string): number => {
  let count = 0;
  for (let i = 0; i < str.length - 1; i += 1) {
    if (str[i] === "$" && str[i + 1] === "$") {
      count += 1;
      i += 1;
    }
  }
  return count;
};

export const parseMarkdownIntoBlocks = (markdown: string): string[] => {
  const hasFootnoteReference = footnoteReferencePattern.test(markdown);
  const hasFootnoteDefinition = footnoteDefinitionPattern.test(markdown);

  if (hasFootnoteReference || hasFootnoteDefinition) {
    return [markdown];
  }

  const tokens = Lexer.lex(markdown, { gfm: true });
  const mergedBlocks: string[] = [];
  const htmlStack: string[] = [];

  for (const token of tokens) {
    const currentBlock = token.raw;
    const mergedBlocksLen = mergedBlocks.length;

    if (htmlStack.length > 0) {
      mergedBlocks[mergedBlocksLen - 1] += currentBlock;
      if (token.type === "html") {
        const closingTagMatch = currentBlock.match(closingTagPattern);
        if (closingTagMatch) {
          const closingTag = closingTagMatch[1];
          if (htmlStack.at(-1) === closingTag) {
            htmlStack.pop();
          }
        }
      }
      continue;
    }

    if (token.type === "html" && token.block) {
      const openingTagMatch = currentBlock.match(openingTagPattern);
      if (openingTagMatch) {
        const tagName = openingTagMatch[1];
        const hasClosingTag = currentBlock.includes(`</${tagName}>`);
        if (!hasClosingTag) {
          htmlStack.push(tagName);
        }
      }
    }

    const trimmedBlock = currentBlock.trim();

    if (trimmedBlock === "$$" && mergedBlocksLen > 0) {
      const previousBlock = mergedBlocks[mergedBlocksLen - 1];
      const prevStartsWith$$ = startsWithDoubleDollar(previousBlock);
      const prevDollarCount = countDoubleDollars(previousBlock);
      if (prevStartsWith$$ && prevDollarCount % 2 === 1) {
        mergedBlocks[mergedBlocksLen - 1] = previousBlock + currentBlock;
        continue;
      }
    }

    if (mergedBlocksLen > 0 && endsWithDoubleDollar(currentBlock)) {
      const previousBlock = mergedBlocks[mergedBlocksLen - 1];
      const prevStartsWith$$ = startsWithDoubleDollar(previousBlock);
      const prevDollarCount = countDoubleDollars(previousBlock);
      const currDollarCount = countDoubleDollars(currentBlock);
      if (
        prevStartsWith$$ &&
        prevDollarCount % 2 === 1 &&
        !startsWithDoubleDollar(currentBlock) &&
        currDollarCount === 1
      ) {
        mergedBlocks[mergedBlocksLen - 1] = previousBlock + currentBlock;
        continue;
      }
    }

    mergedBlocks.push(currentBlock);
  }

  return mergedBlocks;
};
