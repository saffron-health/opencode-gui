/**
 * Shared type definitions for OpenCode SDK events and data structures
 * These types are used across both extension and webview code
 */

import { z } from 'zod';

// ============================================================================
// SDK Event Schemas
// ============================================================================

/**
 * Base event properties that all events share
 */
const BaseEventPropertiesSchema = z.object({
  sessionID: z.string().optional(),
});

/**
 * Message info from SDK
 */
export const MessageInfoSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  text: z.string().optional(),
  parts: z.array(z.unknown()).optional(), // Will be refined with PartInfoSchema
  tokens: z.object({
    input: z.number().optional(),
    output: z.number().optional(),
    cache: z.object({
      read: z.number().optional(),
      write: z.number().optional(),
    }).optional(),
  }).optional(),
  modelID: z.string().optional(),
  providerID: z.string().optional(),
  agent: z.string().optional(),
  sessionID: z.string().optional(),
});

export type MessageInfo = z.infer<typeof MessageInfoSchema>;

/**
 * Message part from SDK
 */
export const PartInfoSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'reasoning', 'tool', 'file', 'step-start', 'step-finish']),
  text: z.string().optional(),
  tool: z.string().optional(),
  state: z.object({
    status: z.enum(['pending', 'running', 'completed', 'error']),
    input: z.unknown().optional(),
    output: z.string().optional(),
    error: z.string().optional(),
    title: z.string().optional(),
    time: z.object({
      start: z.number(),
      end: z.number().optional(),
    }).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  snapshot: z.string().optional(),
  messageID: z.string().optional(),
  callID: z.string().optional(),
});

export type PartInfo = z.infer<typeof PartInfoSchema>;

/**
 * Session info from SDK
 */
export const SessionInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  projectID: z.string().optional(),
  directory: z.string().optional(),
  time: z.object({
    created: z.number(),
    updated: z.number(),
  }).optional(),
  summary: z.object({
    diffs: z.array(z.object({
      path: z.string().optional(),
      additions: z.number().optional(),
      deletions: z.number().optional(),
    })).optional(),
  }).optional(),
});

export type SessionInfo = z.infer<typeof SessionInfoSchema>;

/**
 * Permission from SDK
 */
export const PermissionInfoSchema = z.object({
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

export type PermissionInfo = z.infer<typeof PermissionInfoSchema>;

/**
 * Diff info from session summary
 */
export const DiffInfoSchema = z.object({
  path: z.string().optional(),
  additions: z.number().optional(),
  deletions: z.number().optional(),
});

export type DiffInfo = z.infer<typeof DiffInfoSchema>;

// ============================================================================
// SDK Event Type Schemas
// ============================================================================

/**
 * Message part updated event
 */
export const MessagePartUpdatedEventSchema = z.object({
  type: z.literal('message.part.updated'),
  properties: z.object({
    sessionID: z.string().optional(),
    part: PartInfoSchema,
    delta: z.object({
      text: z.string().optional(),
    }).optional(),
  }),
});

export type MessagePartUpdatedEvent = z.infer<typeof MessagePartUpdatedEventSchema>;

/**
 * Message updated event
 */
export const MessageUpdatedEventSchema = z.object({
  type: z.literal('message.updated'),
  properties: z.object({
    sessionID: z.string().optional(),
    info: MessageInfoSchema,
  }),
});

export type MessageUpdatedEvent = z.infer<typeof MessageUpdatedEventSchema>;

/**
 * Message removed event
 */
export const MessageRemovedEventSchema = z.object({
  type: z.literal('message.removed'),
  properties: z.object({
    sessionID: z.string().optional(),
    messageID: z.string(),
  }),
});

export type MessageRemovedEvent = z.infer<typeof MessageRemovedEventSchema>;

/**
 * Session updated event
 */
export const SessionUpdatedEventSchema = z.object({
  type: z.literal('session.updated'),
  properties: z.object({
    sessionID: z.string().optional(),
    info: SessionInfoSchema,
  }),
});

export type SessionUpdatedEvent = z.infer<typeof SessionUpdatedEventSchema>;

/**
 * Session idle event
 */
export const SessionIdleEventSchema = z.object({
  type: z.literal('session.idle'),
  properties: BaseEventPropertiesSchema,
});

export type SessionIdleEvent = z.infer<typeof SessionIdleEventSchema>;

/**
 * Permission updated event
 */
export const PermissionUpdatedEventSchema = z.object({
  type: z.literal('permission.updated'),
  properties: PermissionInfoSchema,
});

export type PermissionUpdatedEvent = z.infer<typeof PermissionUpdatedEventSchema>;

/**
 * Permission replied event
 */
export const PermissionRepliedEventSchema = z.object({
  type: z.literal('permission.replied'),
  properties: z.object({
    sessionID: z.string().optional(),
    permissionID: z.string(),
    response: z.enum(['once', 'always', 'reject']),
  }),
});

export type PermissionRepliedEvent = z.infer<typeof PermissionRepliedEventSchema>;

/**
 * Union of all SDK events we handle
 */
export const SDKEventSchema = z.discriminatedUnion('type', [
  MessagePartUpdatedEventSchema,
  MessageUpdatedEventSchema,
  MessageRemovedEventSchema,
  SessionUpdatedEventSchema,
  SessionIdleEventSchema,
  PermissionUpdatedEventSchema,
  PermissionRepliedEventSchema,
]);

export type SDKEvent = z.infer<typeof SDKEventSchema>;

// ============================================================================
// Helper functions for extracting session IDs from events
// ============================================================================

/**
 * Safely extract session ID from an SDK event
 * Accepts both validated SDKEvent and unknown (will parse)
 */
export function getEventSessionId(event: unknown): string | undefined {
  try {
    const parsed = SDKEventSchema.safeParse(event);
    if (!parsed.success) {
      return undefined;
    }

    const evt = parsed.data;
    
    // Handle each event type appropriately
    switch (evt.type) {
      case 'message.part.updated':
      case 'message.updated':
      case 'message.removed':
      case 'session.idle':
      case 'permission.replied':
        return evt.properties.sessionID;
      
      case 'session.updated':
        return evt.properties.info.id;
      
      case 'permission.updated':
        return evt.properties.sessionID;
      
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

/**
 * Extract session ID from an already-validated event (avoids re-parsing)
 * Use this when you've already validated the event with SDKEventSchema
 */
export function getEventSessionIdFromValidated(evt: SDKEvent): string | undefined {
  switch (evt.type) {
    case 'message.part.updated':
    case 'message.updated':
    case 'message.removed':
    case 'session.idle':
    case 'permission.replied':
      return evt.properties.sessionID;
    
    case 'session.updated':
      return evt.properties.info.id;
    
    case 'permission.updated':
      return evt.properties.sessionID;
    
    default:
      return undefined;
  }
}

// ============================================================================
// Type guards for SDK events
// ============================================================================

export function isMessagePartUpdatedEvent(event: unknown): event is MessagePartUpdatedEvent {
  return MessagePartUpdatedEventSchema.safeParse(event).success;
}

export function isMessageUpdatedEvent(event: unknown): event is MessageUpdatedEvent {
  return MessageUpdatedEventSchema.safeParse(event).success;
}

export function isMessageRemovedEvent(event: unknown): event is MessageRemovedEvent {
  return MessageRemovedEventSchema.safeParse(event).success;
}

export function isSessionUpdatedEvent(event: unknown): event is SessionUpdatedEvent {
  return SessionUpdatedEventSchema.safeParse(event).success;
}

export function isSessionIdleEvent(event: unknown): event is SessionIdleEvent {
  return SessionIdleEventSchema.safeParse(event).success;
}

export function isPermissionUpdatedEvent(event: unknown): event is PermissionUpdatedEvent {
  return PermissionUpdatedEventSchema.safeParse(event).success;
}

export function isPermissionRepliedEvent(event: unknown): event is PermissionRepliedEvent {
  return PermissionRepliedEventSchema.safeParse(event).success;
}
