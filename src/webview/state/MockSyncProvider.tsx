/**
 * Mock SyncProvider for use in the UIKit.
 * 
 * Provides a minimal mock implementation of the sync context that extracts
 * parts directly from messages passed via props, rather than using the real SDK.
 */

import { type ParentProps, createSignal, createMemo } from "solid-js";
import type { Message, MessagePart, Permission, Session, Agent, ContextInfo, FileChangesInfo } from "../types";
import { SyncContext, type SyncContextValue } from "./sync";

interface MockSyncProviderProps extends ParentProps {
  messages?: Message[];
  sessions?: Session[];
  agents?: Agent[];
  isThinking?: boolean;
  contextInfo?: ContextInfo | null;
  fileChanges?: FileChangesInfo | null;
  permissions?: Map<string, Permission>;
  workspaceRoot?: string;
}

export function MockSyncProvider(props: MockSyncProviderProps) {
  const [currentSessionId, setCurrentSessionId] = createSignal<string | null>("mock-session");
  const [isThinking, setThinking] = createSignal(props.isThinking ?? false);
  const [sessionError, setSessionError] = createSignal<string | null>(null);

  const messages = createMemo(() => props.messages ?? []);
  const sessions = createMemo(() => props.sessions ?? []);
  const agents = createMemo(() => props.agents ?? []);
  const permissions = createMemo(() => props.permissions ?? new Map());
  const contextInfo = createMemo(() => props.contextInfo ?? null);
  const fileChanges = createMemo(() => props.fileChanges ?? null);

  const partsMap = createMemo(() => {
    const map = new Map<string, MessagePart[]>();
    for (const msg of messages()) {
      if (msg.parts) {
        map.set(msg.id, msg.parts);
      }
    }
    return map;
  });

  const getParts = (messageId: string): MessagePart[] => {
    return partsMap().get(messageId) ?? [];
  };

  const value = {
    messages,
    sessions,
    agents,
    permissions,
    isThinking,
    sessionError,
    contextInfo,
    fileChanges,
    status: () => ({ type: "connected" }) as const,
    getParts,
    currentSessionId,
    setCurrentSessionId,
    setThinking,
    setSessionError,
    bootstrap: async () => {},
    reconnect: () => {},
    onSessionIdle: () => () => {},
    isReady: () => true,
    workspaceRoot: () => props.workspaceRoot ?? "/mock/workspace",
  } as unknown as SyncContextValue;

  return (
    <SyncContext.Provider value={value}>
      {props.children}
    </SyncContext.Provider>
  );
}
