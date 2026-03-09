import type {
  Message,
  MessagePart,
  Session,
  Agent,
  Permission,
  ContextInfo,
  FileChangesInfo,
} from "../types";
import type { QuestionRequest } from "@opencode-ai/sdk/v2/client";

export type SessionStatus = 
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number };

export type SyncStatus =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected" }
  | { status: "reconnecting"; attempt: number }
  | { status: "bootstrapping" }
  | { status: "error"; message: string };

export interface SyncState {
  status: SyncStatus;
  agents: Agent[];
  sessions: Session[];
  /** Messages keyed by sessionID */
  message: { [sessionID: string]: Message[] };
  /** Parts keyed by messageID */
  part: { [messageID: string]: MessagePart[] };
  /** Permissions keyed by sessionID */
  permission: { [sessionID: string]: Permission[] };
  /** Questions keyed by sessionID */
  question: { [sessionID: string]: QuestionRequest[] };
  /** Question request IDs keyed by tool identifiers */
  questionByCallID: { [callID: string]: string };
  questionByMessageID: { [messageID: string]: string };
  /** Session status keyed by sessionID */
  sessionStatus: { [sessionID: string]: SessionStatus };
  /** UI state */
  contextInfo: ContextInfo | null;
  fileChanges: FileChangesInfo | null;
  sessionError: { [sessionID: string]: string };
  thinking: { [sessionID: string]: boolean };
}

export function createEmptyState(): SyncState {
  return {
    status: { status: "disconnected" },
    agents: [],
    sessions: [],
    message: {},
    part: {},
    permission: {},
    question: {},
    questionByCallID: {},
    questionByMessageID: {},
    sessionStatus: {},
    contextInfo: null,
    fileChanges: null,
    sessionError: {},
    thinking: {},
  };
}
