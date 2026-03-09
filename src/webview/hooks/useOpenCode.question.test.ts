import { describe, expect, it, vi } from "vitest";
import type { OpencodeClient, QuestionAnswer } from "@opencode-ai/sdk/v2/client";
import {
  listQuestionRequests,
  rejectQuestionRequest,
  replyToQuestionRequest,
} from "./questionApi";

function createQuestionClientMock() {
  return {
    question: {
      reply: vi.fn(),
      reject: vi.fn(),
      list: vi.fn(),
    },
  } as unknown as Pick<OpencodeClient, "question">;
}

describe("useOpenCode question helpers", () => {
  it("sends question.reply with answers and directory", async () => {
    const client = createQuestionClientMock();
    const replyMock = vi
      .mocked(client.question.reply)
      .mockResolvedValue({ data: undefined } as Awaited<ReturnType<typeof client.question.reply>>);

    const answers: Array<QuestionAnswer> = [["A"], ["B"]];
    await replyToQuestionRequest(client, "req-1", answers, "/repo");

    expect(replyMock).toHaveBeenCalledWith({
      requestID: "req-1",
      answers,
      directory: "/repo",
    });
  });

  it("sends question.reject with request id", async () => {
    const client = createQuestionClientMock();
    const rejectMock = vi
      .mocked(client.question.reject)
      .mockResolvedValue({ data: undefined } as Awaited<ReturnType<typeof client.question.reject>>);

    await rejectQuestionRequest(client, "req-2");

    expect(rejectMock).toHaveBeenCalledWith({
      requestID: "req-2",
    });
  });

  it("sends question.list with directory when provided", async () => {
    const client = createQuestionClientMock();
    const listMock = vi
      .mocked(client.question.list)
      .mockResolvedValue({ data: [] } as Awaited<ReturnType<typeof client.question.list>>);

    await listQuestionRequests(client, "/workspace");

    expect(listMock).toHaveBeenCalledWith({ directory: "/workspace" });
  });

  it("throws actionable error when question.reply returns sdk error", async () => {
    const client = createQuestionClientMock();
    vi.mocked(client.question.reply).mockResolvedValue({
      error: { data: { message: "backend exploded" } },
    } as Awaited<ReturnType<typeof client.question.reply>>);

    await expect(replyToQuestionRequest(client, "req-3", [["A"]])).rejects.toThrow(
      "Failed to reply to question request req-3: backend exploded"
    );
  });
});
