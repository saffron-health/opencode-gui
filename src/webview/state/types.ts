import type {
  Message,
  MessagePart,
  Session,
  Agent,
  Permission,
  ContextInfo,
  FileChangesInfo,
} from "../types";

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
    sessionStatus: {},
    contextInfo: null,
    fileChanges: null,
    sessionError: {},
    thinking: {},
  };
}
