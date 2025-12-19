export interface MessagePart {
  id: string;
  type: "text" | "reasoning" | "tool" | "file" | "step-start" | "step-finish";
  text?: string;
  tool?: string;
  state?: ToolState;
  snapshot?: string;
  messageID?: string;
  callID?: string;
}

export interface ToolState {
  status: "pending" | "running" | "completed" | "error";
  input?: any;
  output?: string;
  error?: string;
  title?: string;
  time?: {
    start: number;
    end?: number;
  };
  metadata?: {
    diff?: string;
    diagnostics?: unknown;
    filediff?: unknown;
    [key: string]: unknown;
  };
}

export interface Message {
  id: string;
  type: "user" | "assistant";
  text?: string;
  parts?: MessagePart[];
}

export interface Agent {
  name: string;
  description?: string;
  mode: "subagent" | "primary" | "all";
  builtIn: boolean;
  options?: {
    color?: string;
    [key: string]: unknown;
  };
}

export interface Session {
  id: string;
  title: string;
  projectID: string;
  directory: string;
  time: {
    created: number;
    updated: number;
  };
}

export interface IncomingMessage {
  id: string;
  role?: "user" | "assistant";
  text?: string;
  parts?: MessagePart[];
}

export interface Permission {
  id: string;
  type: string;
  pattern?: string | string[];
  sessionID: string;
  messageID: string;
  callID?: string;
  title: string;
  metadata: Record<string, unknown>;
  time: {
    created: number;
  };
}

export interface ContextInfo {
  usedTokens: number;
  limitTokens: number;
  percentage: number;
}

export interface FileChangesInfo {
  fileCount: number;
  additions: number;
  deletions: number;
}

export type HostMessage =
  | { type: "init"; ready: boolean; workspaceRoot?: string; currentSessionId?: string | null; currentSessionTitle?: string; currentSessionMessages?: IncomingMessage[] }
  | { type: "agentList"; agents: Agent[] }
  | { type: "thinking"; isThinking: boolean }
  | { type: "part-update"; part: MessagePart & { messageID: string } }
  | { type: "message-update"; message: IncomingMessage }
  | { type: "response"; text?: string; parts?: MessagePart[] }
  | { type: "error"; message: string }
  | { type: "session-list"; sessions: Session[] }
  | { type: "session-switched"; sessionId: string; title: string; messages?: IncomingMessage[] }
  | { type: "permission-required"; permission: Permission }
  | { type: "context-update"; contextInfo: ContextInfo }
  | { type: "file-changes-update"; fileChanges: FileChangesInfo };

export type WebviewMessage =
  | { type: "ready" }
  | { type: "getAgents" }
  | { type: "sendPrompt"; text: string; agent: string | null }
  | { type: "load-sessions" }
  | { type: "switch-session"; sessionId: string }
  | { type: "create-session"; title?: string }
  | { type: "permission-response"; sessionId: string; permissionId: string; response: "once" | "always" | "reject" }
  | { type: "cancel-session" }
  | { type: "agent-changed"; agent: string };
