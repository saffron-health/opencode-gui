import type { Message, MessagePart, IncomingMessage } from "../types";

export function applyPartUpdate(
  messages: Message[],
  part: MessagePart & { messageID: string }
): Message[] {
  const messageIndex = messages.findIndex((m) => m.id === part.messageID);

  if (messageIndex === -1) {
    return [
      ...messages,
      {
        id: part.messageID,
        type: "assistant" as const,
        parts: [part],
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
    msg.parts = [...parts];
    msg.parts[partIndex] = part;
  }

  updated[messageIndex] = msg;
  return updated;
}

export function applyMessageUpdate(
  messages: Message[],
  incoming: IncomingMessage
): Message[] {
  const index = messages.findIndex((m) => m.id === incoming.id);

  if (index === -1) {
    return [
      ...messages,
      {
        id: incoming.id,
        type: incoming.role === "user" ? "user" : "assistant",
        parts: incoming.parts || [],
        text: incoming.text,
      },
    ];
  }

  const updated = [...messages];
  const currentMsg = { ...updated[index] };

  if (incoming.role) {
    currentMsg.type = incoming.role === "user" ? "user" : "assistant";
  }

  if (incoming.parts !== undefined) {
    currentMsg.parts = incoming.parts;
  }

  if (incoming.text !== undefined) {
    currentMsg.text = incoming.text;
  }

  updated[index] = currentMsg;
  return updated;
}
