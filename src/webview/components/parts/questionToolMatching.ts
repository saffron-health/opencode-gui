import type { MessagePart } from "../../types";
import type { QuestionRequest } from "@opencode-ai/sdk/v2/client";

export function findQuestionRequest(
  part: MessagePart,
  questions: Map<string, QuestionRequest> | undefined
): QuestionRequest | undefined {
  if (!questions) return undefined;
  const partCallID = part.callID;
  const partMessageID = part.messageID;

  let messageMatch: QuestionRequest | undefined;

  for (const [, question] of questions.entries()) {
    const tool = question.tool;
    if (!tool) continue;

    if (partCallID && tool.callID === partCallID) {
      return question;
    }

    if (!messageMatch && partMessageID && tool.messageID === partMessageID) {
      messageMatch = question;
    }
  }

  if (messageMatch) return messageMatch;
  return undefined;
}
