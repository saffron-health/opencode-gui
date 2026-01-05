import { describe, it, expect } from "vitest";
import {
  HostMessageSchema,
  WebviewMessageSchema,
  parseHostMessage,
  parseWebviewMessage,
  MessagePartSchema,
  ToolStateSchema,
  AgentSchema,
  SessionSchema,
  PermissionSchema,
  ContextInfoSchema,
  FileChangesInfoSchema,
} from "./messages";

describe("ToolStateSchema", () => {
  it("parses valid tool state", () => {
    const state = {
      status: "running",
      input: { foo: "bar" },
      output: "result",
      title: "Some Tool",
      time: { start: 1000, end: 2000 },
      metadata: { diff: "+1 line" },
    };
    expect(ToolStateSchema.parse(state)).toEqual(state);
  });

  it("allows minimal tool state", () => {
    const state = { status: "pending" };
    expect(ToolStateSchema.parse(state)).toEqual(state);
  });

  it("rejects invalid status", () => {
    expect(() => ToolStateSchema.parse({ status: "invalid" })).toThrow();
  });
});

describe("MessagePartSchema", () => {
  it("parses text part", () => {
    const part = { id: "p1", type: "text", text: "Hello" };
    expect(MessagePartSchema.parse(part)).toEqual(part);
  });

  it("parses tool part with state", () => {
    const part = {
      id: "p2",
      type: "tool",
      tool: "read",
      state: { status: "completed", output: "file content" },
      messageID: "m1",
      callID: "c1",
    };
    expect(MessagePartSchema.parse(part)).toEqual(part);
  });

  it("rejects unknown type", () => {
    expect(() => MessagePartSchema.parse({ id: "p3", type: "unknown" })).toThrow();
  });
});

describe("AgentSchema", () => {
  it("parses full agent", () => {
    const agent = {
      name: "coder",
      description: "Coding agent",
      mode: "primary",
      builtIn: true,
      options: { color: "#ff0000" },
    };
    expect(AgentSchema.parse(agent)).toEqual(agent);
  });

  it("parses minimal agent", () => {
    const agent = { name: "test", mode: "subagent", builtIn: false };
    expect(AgentSchema.parse(agent)).toEqual(agent);
  });
});

describe("SessionSchema", () => {
  it("parses session", () => {
    const session = {
      id: "s1",
      title: "Test Session",
      projectID: "proj1",
      directory: "/home/user/project",
      time: { created: 1000, updated: 2000 },
    };
    expect(SessionSchema.parse(session)).toEqual(session);
  });
});

describe("PermissionSchema", () => {
  it("parses permission with string pattern", () => {
    const perm = {
      id: "perm1",
      type: "file.write",
      pattern: "*.ts",
      sessionID: "s1",
      messageID: "m1",
      title: "Write TypeScript files",
      metadata: { path: "/home/user/file.ts" },
      time: { created: 1000 },
    };
    expect(PermissionSchema.parse(perm)).toEqual(perm);
  });

  it("parses permission with array pattern", () => {
    const perm = {
      id: "perm2",
      type: "file.write",
      pattern: ["*.ts", "*.js"],
      sessionID: "s1",
      messageID: "m1",
      title: "Write files",
      metadata: {},
      time: { created: 1000 },
    };
    expect(PermissionSchema.parse(perm)).toEqual(perm);
  });
});

describe("ContextInfoSchema", () => {
  it("parses context info", () => {
    const info = { usedTokens: 5000, limitTokens: 100000, percentage: 5 };
    expect(ContextInfoSchema.parse(info)).toEqual(info);
  });
});

describe("FileChangesInfoSchema", () => {
  it("parses file changes", () => {
    const info = { fileCount: 3, additions: 100, deletions: 50 };
    expect(FileChangesInfoSchema.parse(info)).toEqual(info);
  });
});

describe("HostMessageSchema", () => {
  it("parses init message", () => {
    const msg = {
      type: "init",
      ready: true,
      workspaceRoot: "/home/user/project",
      currentSessionId: "s1",
    };
    expect(HostMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses agentList message", () => {
    const msg = {
      type: "agentList",
      agents: [{ name: "coder", mode: "primary", builtIn: true }],
      defaultAgent: "coder",
    };
    expect(HostMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses thinking message", () => {
    const msg = { type: "thinking", isThinking: true };
    expect(HostMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses part-update message", () => {
    const msg = {
      type: "part-update",
      part: { id: "p1", type: "text", text: "Hello", messageID: "m1" },
      sessionId: "s1",
    };
    expect(HostMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses message-update message", () => {
    const msg = {
      type: "message-update",
      message: { id: "m1", role: "assistant" },
    };
    expect(HostMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses message-removed message", () => {
    const msg = { type: "message-removed", messageId: "m1" };
    expect(HostMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses error message", () => {
    const msg = { type: "error", message: "Something went wrong" };
    expect(HostMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses session-list message", () => {
    const msg = {
      type: "session-list",
      sessions: [
        {
          id: "s1",
          title: "Session 1",
          projectID: "p1",
          directory: "/home",
          time: { created: 1000, updated: 2000 },
        },
      ],
    };
    expect(HostMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses session-switched message", () => {
    const msg = { type: "session-switched", sessionId: "s1", title: "Session 1" };
    expect(HostMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses session-title-update message", () => {
    const msg = { type: "session-title-update", sessionId: "s1", title: "New Title" };
    expect(HostMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses permission-required message", () => {
    const msg = {
      type: "permission-required",
      permission: {
        id: "perm1",
        type: "file.write",
        sessionID: "s1",
        messageID: "m1",
        title: "Write file",
        metadata: {},
        time: { created: 1000 },
      },
    };
    expect(HostMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses context-update message", () => {
    const msg = {
      type: "context-update",
      contextInfo: { usedTokens: 1000, limitTokens: 100000, percentage: 1 },
    };
    expect(HostMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses file-changes-update message", () => {
    const msg = {
      type: "file-changes-update",
      fileChanges: { fileCount: 2, additions: 50, deletions: 10 },
    };
    expect(HostMessageSchema.parse(msg)).toEqual(msg);
  });

  it("rejects unknown message type", () => {
    expect(() => HostMessageSchema.parse({ type: "unknown" })).toThrow();
  });
});

describe("WebviewMessageSchema", () => {
  it("parses ready message", () => {
    expect(WebviewMessageSchema.parse({ type: "ready" })).toEqual({ type: "ready" });
  });

  it("parses getAgents message", () => {
    expect(WebviewMessageSchema.parse({ type: "getAgents" })).toEqual({ type: "getAgents" });
  });

  it("parses sendPrompt message", () => {
    const msg = { type: "sendPrompt", text: "Hello", agent: "coder" };
    expect(WebviewMessageSchema.parse(msg)).toEqual(msg);
  });

  it("converts null agent to undefined", () => {
    const msg = { type: "sendPrompt", text: "Hello", agent: null };
    expect(WebviewMessageSchema.parse(msg)).toEqual({ type: "sendPrompt", text: "Hello", agent: undefined });
  });

  it("parses load-sessions message", () => {
    expect(WebviewMessageSchema.parse({ type: "load-sessions" })).toEqual({ type: "load-sessions" });
  });

  it("parses switch-session message", () => {
    const msg = { type: "switch-session", sessionId: "s1" };
    expect(WebviewMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses create-session message", () => {
    expect(WebviewMessageSchema.parse({ type: "create-session" })).toEqual({ type: "create-session" });
  });

  it("parses permission-response message", () => {
    const msg = {
      type: "permission-response",
      sessionId: "s1",
      permissionId: "perm1",
      response: "always",
    };
    expect(WebviewMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses cancel-session message", () => {
    expect(WebviewMessageSchema.parse({ type: "cancel-session" })).toEqual({ type: "cancel-session" });
  });

  it("parses agent-changed message", () => {
    const msg = { type: "agent-changed", agent: "coder" };
    expect(WebviewMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses edit-previous-message message and converts null agent to undefined", () => {
    const msg = {
      type: "edit-previous-message",
      sessionId: "s1",
      messageId: "m1",
      newText: "Updated text",
      agent: null,
    };
    expect(WebviewMessageSchema.parse(msg)).toEqual({
      type: "edit-previous-message",
      sessionId: "s1",
      messageId: "m1",
      newText: "Updated text",
      agent: undefined,
    });
  });

  it("rejects unknown message type", () => {
    expect(() => WebviewMessageSchema.parse({ type: "unknown" })).toThrow();
  });
});

describe("parseHostMessage", () => {
  it("returns parsed message for valid input", () => {
    const result = parseHostMessage({ type: "thinking", isThinking: true });
    expect(result).toEqual({ type: "thinking", isThinking: true });
  });

  it("returns null for invalid input", () => {
    const result = parseHostMessage({ type: "invalid" });
    expect(result).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseHostMessage("not an object")).toBeNull();
    expect(parseHostMessage(null)).toBeNull();
    expect(parseHostMessage(undefined)).toBeNull();
  });
});

describe("parseWebviewMessage", () => {
  it("returns parsed message for valid input", () => {
    const result = parseWebviewMessage({ type: "ready" });
    expect(result).toEqual({ type: "ready" });
  });

  it("returns null for invalid input", () => {
    const result = parseWebviewMessage({ type: "invalid" });
    expect(result).toBeNull();
  });

  it("returns null for missing required fields", () => {
    const result = parseWebviewMessage({ type: "sendPrompt" });
    expect(result).toBeNull();
  });
});
