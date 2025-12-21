/**
 * Normalizer functions to handle inconsistent message shapes from the OpenCode SDK
 * The SDK sometimes returns messages as { info: MessageInfo, parts: Part[] } and sometimes just MessageInfo
 */

import { MessageInfoSchema, PartInfoSchema, type MessageInfo, type PartInfo } from './sdk-types';

/**
 * Raw message from SDK - can be in multiple shapes
 */
interface RawSDKMessage {
  info?: unknown;
  parts?: unknown[];
  [key: string]: unknown;
}

/**
 * Normalized message structure
 */
export interface NormalizedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text?: string;
  parts?: PartInfo[];
  tokens?: {
    input?: number;
    output?: number;
    cache?: {
      read?: number;
      write?: number;
    };
  };
  modelID?: string;
  providerID?: string;
  agent?: string;
  sessionID?: string;
}

/**
 * Normalize a raw SDK message to a consistent structure
 * Handles both { info: ..., parts: ... } and direct message shapes
 */
export function normalizeMessage(raw: unknown): NormalizedMessage {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid message: not an object');
  }

  const rawMsg = raw as RawSDKMessage;

  // Try to extract the message info - it can be in raw.info or just raw itself
  const infoCandidate = rawMsg.info ?? raw;
  
  // Validate the info structure
  const infoResult = MessageInfoSchema.safeParse(infoCandidate);
  if (!infoResult.success) {
    console.warn('Failed to parse message info:', infoResult.error);
    throw new Error('Invalid message info structure');
  }

  const info = infoResult.data;

  // Extract parts - they can be in raw.parts, info.parts, or missing
  const partsCandidate = rawMsg.parts ?? info.parts ?? [];
  const parts: PartInfo[] = [];

  if (Array.isArray(partsCandidate)) {
    for (const partCandidate of partsCandidate) {
      const partResult = PartInfoSchema.safeParse(partCandidate);
      if (partResult.success) {
        parts.push(partResult.data);
      } else {
        console.warn('Failed to parse message part:', partResult.error);
      }
    }
  }

  // Extract text - prefer direct text field, fallback to extracting from text parts
  let text = info.text;
  if (!text && parts.length > 0) {
    text = parts
      .filter((p) => p.type === 'text' && p.text)
      .map((p) => p.text)
      .join('\n');
  }

  return {
    id: info.id,
    role: info.role,
    text,
    parts: parts.length > 0 ? parts : undefined,
    tokens: info.tokens,
    modelID: info.modelID,
    providerID: info.providerID,
    agent: info.agent,
    sessionID: info.sessionID,
  };
}

/**
 * Safely normalize a message, returning undefined if it fails
 */
export function safeNormalizeMessage(raw: unknown): NormalizedMessage | undefined {
  try {
    return normalizeMessage(raw);
  } catch (error) {
    console.warn('Failed to normalize message:', error);
    return undefined;
  }
}

/**
 * Normalize an array of messages, filtering out any that fail to normalize
 */
export function normalizeMessages(rawMessages: unknown[]): NormalizedMessage[] {
  return rawMessages
    .map((raw) => safeNormalizeMessage(raw))
    .filter((msg): msg is NormalizedMessage => msg !== undefined);
}
