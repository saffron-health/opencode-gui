import {
  handleIncompleteBold,
  handleIncompleteBoldItalic,
  handleIncompleteDoubleUnderscoreItalic,
  handleIncompleteSingleAsteriskItalic,
  handleIncompleteSingleUnderscoreItalic,
} from "./emphasis-handlers";
import { handleIncompleteInlineCode } from "./inline-code-handler";
import { handleIncompleteBlockKatex } from "./katex-handler";
import { handleIncompleteLinksAndImages } from "./link-image-handler";
import { handleIncompleteSetextHeading } from "./setext-heading-handler";
import { handleIncompleteStrikethrough } from "./strikethrough-handler";

const remend = (text: string): string => {
  if (!text || typeof text !== "string") {
    return text;
  }

  let result = text.endsWith(" ") && !text.endsWith("  ") ? text.slice(0, -1) : text;
  result = handleIncompleteSetextHeading(result);
  const processedResult = handleIncompleteLinksAndImages(result);

  if (processedResult.endsWith("](streamdown:incomplete-link)")) {
    return processedResult;
  }

  result = processedResult;
  result = handleIncompleteBoldItalic(result);
  result = handleIncompleteBold(result);
  result = handleIncompleteDoubleUnderscoreItalic(result);
  result = handleIncompleteSingleAsteriskItalic(result);
  result = handleIncompleteSingleUnderscoreItalic(result);
  result = handleIncompleteInlineCode(result);
  result = handleIncompleteStrikethrough(result);
  result = handleIncompleteBlockKatex(result);

  return result;
};

export default remend;
