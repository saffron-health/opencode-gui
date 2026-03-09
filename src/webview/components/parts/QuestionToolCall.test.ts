import { describe, expect, it } from "vitest";
import type { MessagePart } from "../../types";
import type { QuestionRequest } from "@opencode-ai/sdk/v2/client";
import { findQuestionRequest } from "./questionToolMatching";

function createQuestionRequest(
  id: string,
  sessionID: string,
  messageID: string,
  callID: string
): QuestionRequest {
  return {
    id,
    sessionID,
    questions: [
      {
        header: "Question",
        question: "Pick one",
        options: [{ label: "A", description: "Option A" }],
      },
    ],
    tool: {
      messageID,
      callID,
    },
  };
}

function createQuestionPart(messageID: string, callID: string): MessagePart {
  return {
    id: "part_1",
    type: "tool",
    tool: "question",
    messageID,
    callID,
  };
}

describe("findQuestionRequest", () => {
  it("matches by callID when available", () => {
    const part = createQuestionPart("msg_1", "call_target");
    const requests = new Map<string, QuestionRequest>([
      ["q1", createQuestionRequest("q1", "ses_1", "msg_1", "call_other")],
      ["q2", createQuestionRequest("q2", "ses_1", "msg_1", "call_target")],
    ]);

    const result = findQuestionRequest(part, requests);
    expect(result?.id).toBe("q2");
  });

  it("falls back to messageID when callID does not match", () => {
    const part = createQuestionPart("msg_target", "call_unknown");
    const requests = new Map<string, QuestionRequest>([
      ["q1", createQuestionRequest("q1", "ses_1", "msg_other", "call_1")],
      ["q2", createQuestionRequest("q2", "ses_1", "msg_target", "call_2")],
    ]);

    const result = findQuestionRequest(part, requests);
    expect(result?.id).toBe("q2");
  });

  it("does not match when no ids match", () => {
    const part = createQuestionPart("msg_target", "call_target");
    const requests = new Map<string, QuestionRequest>([
      ["q1", createQuestionRequest("q1", "ses_1", "msg_other", "call_other")],
    ]);

    const result = findQuestionRequest(part, requests);
    expect(result).toBeUndefined();
  });

  it("returns undefined when multiple tool questions exist without a match", () => {
    const part = createQuestionPart("msg_target", "call_target");
    const requests = new Map<string, QuestionRequest>([
      ["q1", createQuestionRequest("q1", "ses_1", "msg_a", "call_a")],
      ["q2", createQuestionRequest("q2", "ses_1", "msg_b", "call_b")],
    ]);

    const result = findQuestionRequest(part, requests);
    expect(result).toBeUndefined();
  });
});
