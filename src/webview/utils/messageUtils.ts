import type { Message, MessagePart, IncomingMessage } from "../types";

/**
 * Extract text content from message parts.
 * Joins all non-synthetic, non-ignored text parts with newlines.
 */
function extractTextFromParts(parts: MessagePart[]): string {
  const textParts = parts.filter(
    (p) =>
      p?.type === "text" &&
      typeof p.text === "string" &&
      !(p as { synthetic?: boolean }).synthetic &&
      !(p as { ignored?: boolean }).ignored
  );
  return textParts.map((p) => p.text as string).join("\n");
}

export function applyPartUpdate(
  messages: Message[],
  part: MessagePart & { messageID: string }
): Message[] {
  const messageIndex = messages.findIndex((m) => m.id === part.messageID);

  if (messageIndex === -1) {
    const newParts = [part];
    return [
      ...messages,
      {
        id: part.messageID,
        type: "assistant" as const,
        parts: newParts,
        text: extractTextFromParts(newParts),
      },
    ];
  }

  const updated = [...messages];
  const msg = { ...updated[messageIndex] };
  const parts = msg.parts || [];
  const partIndex = parts.findIndex((p) => p.id === part.id);

  if (partIndex === -1) {
    msg.parts = [...parts, part];
  } else {
    // Replace the part entirely with the incoming update
    // Permission state is managed separately via permission.updated events
    msg.parts = [...parts];
    msg.parts[partIndex] = part;
  }

  // Update text from parts for user messages (which render text directly)
  if (msg.type === "user") {
    msg.text = extractTextFromParts(msg.parts);
  }

  updated[messageIndex] = msg;
  return updated;
}

export function applyMessageUpdate(
  messages: Message[],
  incoming: IncomingMessage
): Message[] {
  const index = messages.findIndex((m) => m.id === incoming.id);
  
  // Extract text from parts if not provided directly
  const parts = incoming.parts || [];
  const text = incoming.text ?? (parts.length > 0 ? extractTextFromParts(parts) : undefined);

  if (index === -1) {
    return [
      ...messages,
      {
        id: incoming.id,
        type: incoming.role === "user" ? "user" : "assistant",
        parts,
        text,
      },
    ];
  }

  const updated = [...messages];
  const currentMsg = { ...updated[index] };

  if (incoming.role) {
    currentMsg.type = incoming.role === "user" ? "user" : "assistant";
  }

  if (incoming.parts !== undefined) {
    currentMsg.parts = parts;
    // Update text from parts if text wasn't explicitly provided
    if (incoming.text === undefined && parts.length > 0) {
      currentMsg.text = extractTextFromParts(parts);
    }
  }

  if (incoming.text !== undefined) {
    currentMsg.text = incoming.text;
  }

  updated[index] = currentMsg;
  return updated;
}
