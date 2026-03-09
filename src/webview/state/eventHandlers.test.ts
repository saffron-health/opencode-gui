import { describe, expect, it, vi } from "vitest";
import { createStore } from "solid-js/store";
import type { Event, QuestionRequest } from "@opencode-ai/sdk/v2/client";
import { applyEvent, type EventHandlerContext } from "./eventHandlers";
import { createEmptyState } from "./types";

vi.mock("../utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function createTestContext(currentSession: string | null = null): EventHandlerContext {
  const [store, setStore] = createStore(createEmptyState());

  return {
    store,
    setStore,
    currentSessionId: () => currentSession,
    messageToSession: new Map<string, string>(),
    sessionIdleCallbacks: new Set<(sessionId: string) => void>(),
  };
}

function createQuestionRequest(
  id: string,
  sessionID: string,
  prompt: string,
  tool?: { messageID: string; callID: string }
): QuestionRequest {
  return {
    id,
    sessionID,
    questions: [
      {
        header: "Demo question",
        question: prompt,
        options: [
          {
            label: "Yes",
            description: "Approve this option",
          },
          {
            label: "No",
            description: "Reject this option",
          },
        ],
      },
    ],
    ...(tool ? { tool } : {}),
  };
}

describe("applyEvent question handling", () => {
  it("adds question.asked requests", () => {
    const ctx = createTestContext("ses_1");

    const request = createQuestionRequest("req_1", "ses_1", "Continue?", {
      messageID: "msg_1",
      callID: "call_1",
    });
    const event: Event = {
      type: "question.asked",
      properties: request,
    };

    applyEvent(event, ctx);

    expect(ctx.store.question.ses_1).toHaveLength(1);
    expect(ctx.store.question.ses_1?.[0]?.id).toBe("req_1");
    expect(ctx.store.questionByCallID.call_1).toBe("req_1");
    expect(ctx.store.questionByMessageID.msg_1).toBe("req_1");
  });

  it("updates an existing question.asked request by id", () => {
    const ctx = createTestContext("ses_1");
    ctx.setStore("question", "ses_1", [createQuestionRequest("req_1", "ses_1", "Original prompt?")]);

    const updated = createQuestionRequest("req_1", "ses_1", "Updated prompt?");
    const event: Event = {
      type: "question.asked",
      properties: updated,
    };

    applyEvent(event, ctx);

    expect(ctx.store.question.ses_1).toHaveLength(1);
    expect(ctx.store.question.ses_1?.[0]?.questions[0]?.question).toBe("Updated prompt?");
  });

  it("removes requests on question.replied", () => {
    const ctx = createTestContext("ses_1");
    ctx.setStore("question", "ses_1", [
      createQuestionRequest("req_1", "ses_1", "First?"),
      createQuestionRequest("req_2", "ses_1", "Second?"),
    ]);

    const event: Event = {
      type: "question.replied",
      properties: {
        sessionID: "ses_1",
        requestID: "req_1",
        answers: [["Yes"]],
      },
    };

    applyEvent(event, ctx);

    expect(ctx.store.question.ses_1).toHaveLength(1);
    expect(ctx.store.question.ses_1?.[0]?.id).toBe("req_2");
  });

  it("removes question indexes on question.replied", () => {
    const ctx = createTestContext("ses_1");
    const request = createQuestionRequest("req_1", "ses_1", "First?", {
      messageID: "msg_1",
      callID: "call_1",
    });
    ctx.setStore("question", "ses_1", [request]);
    ctx.setStore("questionByCallID", "call_1", "req_1");
    ctx.setStore("questionByMessageID", "msg_1", "req_1");

    const event: Event = {
      type: "question.replied",
      properties: {
        sessionID: "ses_1",
        requestID: "req_1",
        answers: [["Yes"]],
      },
    };

    applyEvent(event, ctx);

    expect(ctx.store.questionByCallID.call_1).toBeUndefined();
    expect(ctx.store.questionByMessageID.msg_1).toBeUndefined();
  });

  it("removes requests on question.rejected", () => {
    const ctx = createTestContext("ses_1");
    ctx.setStore("question", "ses_1", [
      createQuestionRequest("req_1", "ses_1", "First?"),
      createQuestionRequest("req_2", "ses_1", "Second?"),
    ]);

    const event: Event = {
      type: "question.rejected",
      properties: {
        sessionID: "ses_1",
        requestID: "req_2",
      },
    };

    applyEvent(event, ctx);

    expect(ctx.store.question.ses_1).toHaveLength(1);
    expect(ctx.store.question.ses_1?.[0]?.id).toBe("req_1");
  });

  it("removes requests when question.replied omits sessionID", () => {
    const ctx = createTestContext("ses_2");
    ctx.setStore("question", "ses_1", [createQuestionRequest("req_1", "ses_1", "First?")]);
    ctx.setStore("question", "ses_2", [createQuestionRequest("req_2", "ses_2", "Second?")]);

    const event: Event = {
      type: "question.replied",
      properties: {
        requestID: "req_1",
        answers: [["Yes"]],
      },
    };

    applyEvent(event, ctx);

    expect(ctx.store.question.ses_1).toHaveLength(0);
    expect(ctx.store.question.ses_2).toHaveLength(1);
    expect(ctx.store.question.ses_2?.[0]?.id).toBe("req_2");
  });
});
