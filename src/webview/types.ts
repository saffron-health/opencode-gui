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
  summary?: {
    diffs: Array<{
      file: string;
      additions: number;
      deletions: number;
    }>;
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


