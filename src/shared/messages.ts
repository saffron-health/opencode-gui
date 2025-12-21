/**
 * Shared message type definitions and schemas for webview <-> extension communication
 * These messages cross the postMessage boundary and need runtime validation
 */

import { z } from 'zod';
import { MessageInfoSchema, PartInfoSchema, SessionInfoSchema, PermissionInfoSchema } from './sdk-types';

// ============================================================================
// Shared Data Structures
// ============================================================================

export const AgentSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  mode: z.enum(['subagent', 'primary', 'all']),
  builtIn: z.boolean(),
  options: z.record(z.string(), z.unknown()).optional(),
});

export type Agent = z.infer<typeof AgentSchema>;

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

// ============================================================================
// Messages FROM Extension TO Webview (HostMessage)
// ============================================================================

const InitMessageSchema = z.object({
  type: z.literal('init'),
  ready: z.boolean(),
  workspaceRoot: z.string().optional(),
  currentSessionId: z.string().nullable().optional(),
  currentSessionTitle: z.string().optional(),
  currentSessionMessages: z.array(z.unknown()).optional(), // Validated separately as MessageInfo
});

const AgentListMessageSchema = z.object({
  type: z.literal('agentList'),
  agents: z.array(AgentSchema),
  defaultAgent: z.string().optional(), // NOTE: This field was missing from types but is sent in practice
});

const ThinkingMessageSchema = z.object({
  type: z.literal('thinking'),
  isThinking: z.boolean(),
});

const PartUpdateMessageSchema = z.object({
  type: z.literal('part-update'),
  part: PartInfoSchema.extend({
    messageID: z.string(),
  }),
  delta: z.object({
    text: z.string().optional(),
  }).optional(),
  sessionId: z.string().optional(),
});

const MessageUpdateMessageSchema = z.object({
  type: z.literal('message-update'),
  message: z.unknown(), // Validated as MessageInfo
  sessionId: z.string().optional(),
});

const MessageRemovedMessageSchema = z.object({
  type: z.literal('message-removed'),
  messageId: z.string(),
  sessionId: z.string().optional(),
});

const ResponseMessageSchema = z.object({
  type: z.literal('response'),
  text: z.string().optional(),
  parts: z.array(PartInfoSchema).optional(),
});

const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
});

const SessionListMessageSchema = z.object({
  type: z.literal('session-list'),
  sessions: z.array(SessionInfoSchema),
});

const SessionSwitchedMessageSchema = z.object({
  type: z.literal('session-switched'),
  sessionId: z.string(),
  title: z.string(),
  messages: z.array(z.unknown()).optional(), // Validated separately as MessageInfo
});

const SessionTitleUpdateMessageSchema = z.object({
  type: z.literal('session-title-update'),
  sessionId: z.string(),
  title: z.string(),
});

const PermissionRequiredMessageSchema = z.object({
  type: z.literal('permission-required'),
  permission: PermissionInfoSchema,
});

const ContextUpdateMessageSchema = z.object({
  type: z.literal('context-update'),
  contextInfo: ContextInfoSchema,
});

const FileChangesUpdateMessageSchema = z.object({
  type: z.literal('file-changes-update'),
  fileChanges: FileChangesInfoSchema,
});

/**
 * Union of all messages sent from extension to webview
 */
export const HostMessageSchema = z.discriminatedUnion('type', [
  InitMessageSchema,
  AgentListMessageSchema,
  ThinkingMessageSchema,
  PartUpdateMessageSchema,
  MessageUpdateMessageSchema,
  MessageRemovedMessageSchema,
  ResponseMessageSchema,
  ErrorMessageSchema,
  SessionListMessageSchema,
  SessionSwitchedMessageSchema,
  SessionTitleUpdateMessageSchema,
  PermissionRequiredMessageSchema,
  ContextUpdateMessageSchema,
  FileChangesUpdateMessageSchema,
]);

export type HostMessage = z.infer<typeof HostMessageSchema>;

// ============================================================================
// Messages FROM Webview TO Extension (WebviewMessage)
// ============================================================================

const ReadyMessageSchema = z.object({
  type: z.literal('ready'),
});

const GetAgentsMessageSchema = z.object({
  type: z.literal('getAgents'),
});

const SendPromptMessageSchema = z.object({
  type: z.literal('sendPrompt'),
  text: z.string(),
  agent: z.string().nullable(),
});

const LoadSessionsMessageSchema = z.object({
  type: z.literal('load-sessions'),
});

const SwitchSessionMessageSchema = z.object({
  type: z.literal('switch-session'),
  sessionId: z.string(),
});

const CreateSessionMessageSchema = z.object({
  type: z.literal('create-session'),
  title: z.string().optional(),
});

const PermissionResponseMessageSchema = z.object({
  type: z.literal('permission-response'),
  sessionId: z.string(),
  permissionId: z.string(),
  response: z.enum(['once', 'always', 'reject']),
});

const CancelSessionMessageSchema = z.object({
  type: z.literal('cancel-session'),
});

const AgentChangedMessageSchema = z.object({
  type: z.literal('agent-changed'),
  agent: z.string(),
});

const EditPreviousMessageMessageSchema = z.object({
  type: z.literal('edit-previous-message'),
  sessionId: z.string(),
  messageId: z.string(),
  newText: z.string(),
  agent: z.string().nullable(),
});

/**
 * Union of all messages sent from webview to extension
 */
export const WebviewMessageSchema = z.discriminatedUnion('type', [
  ReadyMessageSchema,
  GetAgentsMessageSchema,
  SendPromptMessageSchema,
  LoadSessionsMessageSchema,
  SwitchSessionMessageSchema,
  CreateSessionMessageSchema,
  PermissionResponseMessageSchema,
  CancelSessionMessageSchema,
  AgentChangedMessageSchema,
  EditPreviousMessageMessageSchema,
]);

export type WebviewMessage = z.infer<typeof WebviewMessageSchema>;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a message from the extension to the webview
 * Returns the parsed message or throws with validation errors
 */
export function validateHostMessage(message: unknown): HostMessage {
  return HostMessageSchema.parse(message);
}

/**
 * Safely validate a message from the extension to the webview
 * Returns the parsed message or undefined if validation fails
 */
export function safeValidateHostMessage(message: unknown): HostMessage | undefined {
  const result = HostMessageSchema.safeParse(message);
  return result.success ? result.data : undefined;
}

/**
 * Validate a message from the webview to the extension
 * Returns the parsed message or throws with validation errors
 */
export function validateWebviewMessage(message: unknown): WebviewMessage {
  return WebviewMessageSchema.parse(message);
}

/**
 * Safely validate a message from the webview to the extension
 * Returns the parsed message or undefined if validation fails
 */
export function safeValidateWebviewMessage(message: unknown): WebviewMessage | undefined {
  const result = WebviewMessageSchema.safeParse(message);
  return result.success ? result.data : undefined;
}
