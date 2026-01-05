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

  it("parses error message", () => {
    const msg = { type: "error", message: "Something went wrong" };
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

  it("parses agent-changed message", () => {
    const msg = { type: "agent-changed", agent: "coder" };
    expect(WebviewMessageSchema.parse(msg)).toEqual(msg);
  });

  it("rejects unknown message type", () => {
    expect(() => WebviewMessageSchema.parse({ type: "unknown" })).toThrow();
  });
});

describe("parseHostMessage", () => {
  it("returns parsed message for valid input", () => {
    const result = parseHostMessage({ type: "error", message: "Something went wrong" });
    expect(result).toEqual({ type: "error", message: "Something went wrong" });
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
    const result = parseWebviewMessage({ type: "agent-changed" });
    expect(result).toBeNull();
  });
});
