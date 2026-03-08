import type {
  OpencodeClient,
  QuestionAnswer,
  QuestionRequest,
} from "@opencode-ai/sdk/v2/client";

type SdkErrorShape = {
  data?: { message?: string };
  error?: { data?: { message?: string } };
};

type SdkResultWithError = {
  error?: unknown;
};

export type QuestionApiClient = Pick<OpencodeClient, "question">;

function getSdkErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const sdkError = error as SdkErrorShape;
    const nestedMessage = sdkError.data?.message ?? sdkError.error?.data?.message;
    if (nestedMessage) return nestedMessage;
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown SDK error";
    }
  }
  return "Unknown SDK error";
}

function throwIfSdkError(result: SdkResultWithError, action: string): void {
  if (!result.error) return;
  const message = getSdkErrorMessage(result.error);
  throw new Error(`${action}: ${message}`);
}

export async function replyToQuestionRequest(
  client: QuestionApiClient,
  requestId: string,
  answers: Array<QuestionAnswer>,
  directory?: string
) {
  const result = await client.question.reply({
    requestID: requestId,
    answers,
    ...(directory ? { directory } : {}),
  });
  throwIfSdkError(result, `Failed to reply to question request ${requestId}`);
  return result;
}

export async function rejectQuestionRequest(
  client: QuestionApiClient,
  requestId: string,
  directory?: string
) {
  const result = await client.question.reject({
    requestID: requestId,
    ...(directory ? { directory } : {}),
  });
  throwIfSdkError(result, `Failed to reject question request ${requestId}`);
  return result;
}

export async function listQuestionRequests(
  client: QuestionApiClient,
  directory?: string
): Promise<{ data?: QuestionRequest[]; error?: unknown }> {
  const result = await client.question.list(directory ? { directory } : undefined);
  throwIfSdkError(result, "Failed to list pending questions");
  return result;
}
