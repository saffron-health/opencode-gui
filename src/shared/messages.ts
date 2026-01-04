import { z } from "zod/v4";

export const ToolStateSchema = z.object({
  status: z.enum(["pending", "running", "completed", "error"]),
  input: z.unknown().optional(),
  output: z.string().optional(),
  error: z.string().optional(),
  title: z.string().optional(),
  time: z
    .object({
      start: z.number(),
      end: z.number().optional(),
    })
    .optional(),
  metadata: z
    .object({
      diff: z.string().optional(),
      diagnostics: z.unknown().optional(),
      filediff: z.unknown().optional(),
    })
    .catchall(z.unknown())
    .optional(),
});
export type ToolState = z.infer<typeof ToolStateSchema>;

export const MessagePartSchema = z
  .object({
    id: z.string(),
    type: z.enum(["text", "reasoning", "tool", "file", "step-start", "step-finish", "snapshot", "patch"]),
    text: z.string().optional(),
    tool: z.string().optional(),
    state: ToolStateSchema.optional(),
    snapshot: z.string().optional(),
    messageID: z.string().optional(),
    callID: z.string().optional(),
  })
  .passthrough();
export type MessagePart = z.infer<typeof MessagePartSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  type: z.enum(["user", "assistant"]),
  text: z.string().optional(),
  parts: z.array(MessagePartSchema).optional(),
});
export type Message = z.infer<typeof MessageSchema>;

export const AgentSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  mode: z.enum(["subagent", "primary", "all"]),
  builtIn: z.boolean().optional(),
  options: z
    .object({
      color: z.string().optional(),
    })
    .catchall(z.unknown())
    .optional(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  projectID: z.string(),
  directory: z.string(),
  time: z.object({
    created: z.number(),
    updated: z.number(),
  }),
});
export type Session = z.infer<typeof SessionSchema>;

export const IncomingMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["user", "assistant"]).optional(),
    text: z.string().optional(),
    parts: z.array(MessagePartSchema.passthrough()).optional(),
  })
  .passthrough();
export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;

export const PermissionSchema = z.object({
  id: z.string(),
  type: z.string(),
  pattern: z.union([z.string(), z.array(z.string())]).optional(),
  sessionID: z.string(),
  messageID: z.string(),
  callID: z.string().optional(),
  title: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  time: z.object({
    created: z.number(),
  }),
});
export type Permission = z.infer<typeof PermissionSchema>;

export const ContextInfoSchema = z.object({
  usedTokens: z.number(),
  limitTokens: z.number(),
  percentage: z.number(),
});
export type ContextInfo = z.infer<typeof ContextInfoSchema>;

export const FileChangesInfoSchema = z.object({
  fileCount: z.number(),
  additions: z.number(),
  deletions: z.number(),
});
export type FileChangesInfo = z.infer<typeof FileChangesInfoSchema>;

const nullToUndefined = <T>(schema: z.ZodType<T>) =>
  z.preprocess((v) => (v === null ? undefined : v), schema);

// Host -> Webview messages
export const HostMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("init"),
      ready: z.boolean(),
      workspaceRoot: z.string().optional(),
      currentSessionId: z.string().nullish(),
      currentSessionTitle: z.string().optional(),
      currentSessionMessages: z.array(IncomingMessageSchema).optional(),
    })
    .transform((v) => ({
      ...v,
      currentSessionId: v.currentSessionId ?? undefined,
    })),
  z.object({
    type: z.literal("agentList"),
    agents: z.array(AgentSchema),
    defaultAgent: z.string().optional(),
  }),
  z.object({
    type: z.literal("thinking"),
    isThinking: z.boolean(),
  }),
  z.object({
    type: z.literal("part-update"),
    part: MessagePartSchema.extend({ messageID: z.string() }),
    delta: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  z.object({
    type: z.literal("message-update"),
    message: IncomingMessageSchema,
    sessionId: z.string().optional(),
  }),
  z.object({
    type: z.literal("message-removed"),
    messageId: z.string(),
    sessionId: z.string().optional(),
  }),
  z.object({
    type: z.literal("response"),
    text: z.string().optional(),
    parts: z.array(MessagePartSchema).optional(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("session-list"),
    sessions: z.array(SessionSchema),
  }),
  z.object({
    type: z.literal("session-switched"),
    sessionId: z.string(),
    title: z.string(),
    messages: z.array(IncomingMessageSchema).optional(),
  }),
  z.object({
    type: z.literal("session-title-update"),
    sessionId: z.string(),
    title: z.string(),
  }),
  z.object({
    type: z.literal("permission-required"),
    permission: PermissionSchema,
  }),
  z.object({
    type: z.literal("context-update"),
    contextInfo: ContextInfoSchema,
  }),
  z.object({
    type: z.literal("file-changes-update"),
    fileChanges: FileChangesInfoSchema,
  }),
]);
export type HostMessage = z.infer<typeof HostMessageSchema>;

// Webview -> Host messages
export const WebviewMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
  }),
  z.object({
    type: z.literal("getAgents"),
  }),
  z.object({
    type: z.literal("sendPrompt"),
    text: z.string(),
    agent: nullToUndefined(z.string().optional()),
  }),
  z.object({
    type: z.literal("load-sessions"),
  }),
  z.object({
    type: z.literal("switch-session"),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal("create-session"),
    title: z.string().optional(),
  }),
  z.object({
    type: z.literal("permission-response"),
    sessionId: z.string(),
    permissionId: z.string(),
    response: z.enum(["once", "always", "reject"]),
  }),
  z.object({
    type: z.literal("cancel-session"),
  }),
  z.object({
    type: z.literal("agent-changed"),
    agent: z.string(),
  }),
  z.object({
    type: z.literal("edit-previous-message"),
    sessionId: z.string(),
    messageId: z.string(),
    newText: z.string(),
    agent: nullToUndefined(z.string().optional()),
  }),
]);
export type WebviewMessage = z.infer<typeof WebviewMessageSchema>;

// Helper functions for parsing messages with validation
export function parseHostMessage(data: unknown): HostMessage | null {
  const result = HostMessageSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.warn("[messages] Invalid host message:", result.error);
  return null;
}

export function parseWebviewMessage(data: unknown): WebviewMessage | null {
  const result = WebviewMessageSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.warn("[messages] Invalid webview message:", result.error);
  return null;
}
