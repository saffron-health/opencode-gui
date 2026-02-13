import type {
  AgentPartInput,
  FilePartInput,
  SubtaskPartInput,
  TextPartInput,
} from "@opencode-ai/sdk/v2/client";

export type PromptPartInput =
  | TextPartInput
  | FilePartInput
  | AgentPartInput
  | SubtaskPartInput;

export function buildSessionPromptRequest(
  sessionId: string,
  text: string,
  extraParts: PromptPartInput[] = [],
  agent?: string | null,
  messageID?: string
) {
  return {
    sessionID: sessionId,
    parts: [{ type: "text" as const, text }, ...extraParts],
    ...(agent ? { agent } : {}),
    ...(messageID ? { messageID } : {}),
  };
}
