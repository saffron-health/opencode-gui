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

export const FileDiffSchema = z.object({
  file: z.string(),
  before: z.string(),
  after: z.string(),
  additions: z.number(),
  deletions: z.number(),
});
export type FileDiff = z.infer<typeof FileDiffSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  projectID: z.string(),
  directory: z.string(),
  time: z.object({
    created: z.number(),
    updated: z.number(),
  }),
  summary: z.object({
    diffs: z.array(FileDiffSchema),
  }).optional(),
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

// Host -> Webview messages
export const HostMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("init"),
      ready: z.boolean(),
      workspaceRoot: z.string().optional(),
      serverUrl: z.string().optional(),
      currentSessionId: z.string().nullish(),
      currentSessionTitle: z.string().optional(),
      currentSessionMessages: z.array(IncomingMessageSchema).optional(),
      defaultAgent: z.string().optional(),
    })
    .transform((v) => ({
      ...v,
      currentSessionId: v.currentSessionId ?? undefined,
    })),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
  // Proxy fetch/SSE messages for CORS bypass
  z.object({
    type: z.literal("proxyFetchResult"),
    id: z.string(),
    ok: z.boolean(),
    status: z.number().optional(),
    statusText: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    bodyText: z.string().optional(),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal("sseEvent"),
    id: z.string(),
    data: z.string(),
  }),
  z.object({
    type: z.literal("sseError"),
    id: z.string(),
    error: z.string(),
  }),
  z.object({
    type: z.literal("sseClosed"),
    id: z.string(),
  }),
]);
export type HostMessage = z.infer<typeof HostMessageSchema>;

// Additional webview messages for proxy fetch abort
export const ProxyFetchAbortSchema = z.object({
  type: z.literal("proxyFetchAbort"),
  id: z.string(),
});
export type ProxyFetchAbort = z.infer<typeof ProxyFetchAbortSchema>;

// Webview -> Host messages
export const WebviewMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
  }),
  z.object({
    type: z.literal("agent-changed"),
    agent: z.string(),
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
