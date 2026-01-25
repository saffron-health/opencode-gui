import { describe, it, expect } from "vitest";
import { createSyncStore } from "../syncStore";
import type { Event } from "@opencode-ai/sdk/client";

function createStore() {
  return createSyncStore();
}

function makeMessageUpdatedEvent(
  id: string,
  role: "user" | "assistant",
  sessionID: string,
  text?: string
): Event {
  return {
    type: "message.updated",
    properties: {
      info: { id, role, sessionID, text },
    },
  } as unknown as Event;
}

function makePartUpdatedEvent(
  partId: string,
  messageID: string,
  sessionID: string,
  type: string = "text",
  text?: string
): Event {
  return {
    type: "message.part.updated",
    properties: {
      part: { id: partId, messageID, sessionID, type, text },
    },
  } as unknown as Event;
}

function makeSessionUpdatedEvent(session: {
  id: string;
  title: string;
  projectID: string;
  directory: string;
  time: { created: number; updated: number };
}): Event {
  return {
    type: "session.updated",
    properties: { info: session },
  } as unknown as Event;
}

function makeSessionIdleEvent(sessionID: string): Event {
  return {
    type: "session.idle",
    properties: { sessionID },
  } as unknown as Event;
}

function makeSessionErrorEvent(sessionID: string, message: string): Event {
  return {
    type: "session.error",
    properties: {
      sessionID,
      error: { data: { message } },
    },
  } as unknown as Event;
}

function makePermissionAskedEvent(permission: {
  id: string;
  permission: string;
  sessionID: string;
  metadata: Record<string, unknown>;
  tool?: { messageID: string; callID: string };
}): Event {
  return {
    type: "permission.asked",
    properties: permission,
  } as unknown as Event;
}

function makePermissionRepliedEvent(permissionID: string): Event {
  return {
    type: "permission.replied",
    properties: { permissionID },
  } as unknown as Event;
}

function makeMessageRemovedEvent(messageID: string): Event {
  return {
    type: "message.removed",
    properties: { messageID },
  } as unknown as Event;
}

describe("SyncStore", () => {
  describe("initial state", () => {
    it("should start with empty state", () => {
      const store = createStore();
      const state = store.state();

      expect(state.sessions.size).toBe(0);
      expect(state.messages.size).toBe(0);
      expect(state.parts.size).toBe(0);
      expect(state.permissions.size).toBe(0);
      expect(state.agents).toEqual([]);
      expect(state.contextInfo).toBeNull();
      expect(state.fileChanges).toBeNull();
      expect(state.thinkingSessions.size).toBe(0);
      expect(state.sessionErrors.size).toBe(0);
    });

    it("should start with disconnected status", () => {
      const store = createStore();
      expect(store.status()).toEqual({ status: "disconnected" });
    });
  });

  describe("message events", () => {
    it("should add a new message on message.updated", () => {
      const store = createStore();
      const event = makeMessageUpdatedEvent("msg-1", "user", "session-1", "Hello");

      store.applyEvent(event);

      const msg = store.getMessage("msg-1");
      expect(msg).toBeDefined();
      expect(msg?.id).toBe("msg-1");
      expect(msg?.type).toBe("user");
      expect(msg?.text).toBe("Hello");
    });

    it("should update an existing message on message.updated", () => {
      const store = createStore();

      store.applyEvent(makeMessageUpdatedEvent("msg-1", "user", "session-1", "Hello"));
      store.applyEvent(makeMessageUpdatedEvent("msg-1", "user", "session-1", "Updated text"));

      const msg = store.getMessage("msg-1");
      expect(msg?.text).toBe("Updated text");
    });

    it("should be idempotent for duplicate events", () => {
      const store = createStore();
      const event = makeMessageUpdatedEvent("msg-1", "user", "session-1", "Hello");

      store.applyEvent(event);
      store.applyEvent(event);
      store.applyEvent(event);

      expect(store.state().messages.size).toBe(1);
      expect(store.getMessage("msg-1")?.text).toBe("Hello");
    });

    it("should remove a message on message.removed", () => {
      const store = createStore();

      store.applyEvent(makeMessageUpdatedEvent("msg-1", "user", "session-1", "Hello"));
      expect(store.getMessage("msg-1")).toBeDefined();

      store.applyEvent(makeMessageRemovedEvent("msg-1"));
      expect(store.getMessage("msg-1")).toBeUndefined();
    });

    it("should remove associated parts when message is removed", () => {
      const store = createStore();

      store.applyEvent(makeMessageUpdatedEvent("msg-1", "assistant", "session-1"));
      store.applyEvent(makePartUpdatedEvent("part-1", "msg-1", "session-1", "text", "Part text"));
      store.applyEvent(makePartUpdatedEvent("part-2", "msg-1", "session-1", "tool"));

      expect(store.getPart("part-1")).toBeDefined();
      expect(store.getPart("part-2")).toBeDefined();

      store.applyEvent(makeMessageRemovedEvent("msg-1"));

      expect(store.getPart("part-1")).toBeUndefined();
      expect(store.getPart("part-2")).toBeUndefined();
    });
  });

  describe("part events", () => {
    it("should add a new part on message.part.updated", () => {
      const store = createStore();
      store.applyEvent(makeMessageUpdatedEvent("msg-1", "assistant", "session-1"));
      store.applyEvent(makePartUpdatedEvent("part-1", "msg-1", "session-1", "text", "Part text"));

      const part = store.getPart("part-1");
      expect(part).toBeDefined();
      expect(part?.id).toBe("part-1");
      expect(part?.type).toBe("text");
      expect(part?.text).toBe("Part text");
    });

    it("should create parent message if not exists when part arrives first", () => {
      const store = createStore();
      store.applyEvent(makePartUpdatedEvent("part-1", "msg-1", "session-1", "text", "Part text"));

      const msg = store.getMessage("msg-1");
      expect(msg).toBeDefined();
      expect(msg?.type).toBe("assistant");
      expect(msg?.parts).toHaveLength(1);
      expect(msg?.parts?.[0].id).toBe("part-1");
    });

    it("should update message.parts array when part is updated", () => {
      const store = createStore();
      store.applyEvent(makeMessageUpdatedEvent("msg-1", "assistant", "session-1"));
      store.applyEvent(makePartUpdatedEvent("part-1", "msg-1", "session-1", "text", "Initial"));

      let msg = store.getMessage("msg-1");
      expect(msg?.parts).toHaveLength(1);
      expect(msg?.parts?.[0].text).toBe("Initial");

      store.applyEvent(makePartUpdatedEvent("part-1", "msg-1", "session-1", "text", "Updated"));

      msg = store.getMessage("msg-1");
      expect(msg?.parts).toHaveLength(1);
      expect(msg?.parts?.[0].text).toBe("Updated");
    });

    it("should add multiple parts to same message", () => {
      const store = createStore();
      store.applyEvent(makeMessageUpdatedEvent("msg-1", "assistant", "session-1"));
      store.applyEvent(makePartUpdatedEvent("part-1", "msg-1", "session-1", "text", "First"));
      store.applyEvent(makePartUpdatedEvent("part-2", "msg-1", "session-1", "tool"));
      store.applyEvent(makePartUpdatedEvent("part-3", "msg-1", "session-1", "text", "Third"));

      const msg = store.getMessage("msg-1");
      expect(msg?.parts).toHaveLength(3);
    });
  });

  describe("session events", () => {
    it("should add session on session.updated", () => {
      const store = createStore();
      const event = makeSessionUpdatedEvent({
        id: "session-1",
        title: "Test Session",
        projectID: "proj-1",
        directory: "/test",
        time: { created: 1000, updated: 2000 },
      });

      store.applyEvent(event);

      const session = store.getSession("session-1");
      expect(session).toBeDefined();
      expect(session?.title).toBe("Test Session");
    });

    it("should add session on session.created", () => {
      const store = createStore();
      const event = {
        type: "session.created",
        properties: {
          info: {
            id: "session-2",
            title: "New Session",
            projectID: "proj-1",
            directory: "/test",
            time: { created: 1000, updated: 1000 },
          },
        },
      } as unknown as Event;

      store.applyEvent(event);

      expect(store.getSession("session-2")).toBeDefined();
    });

    it("should update fileChanges when session has diffs", () => {
      const store = createStore();
      const event = {
        type: "session.updated",
        properties: {
          info: {
            id: "session-1",
            title: "Test",
            projectID: "proj-1",
            directory: "/test",
            time: { created: 1000, updated: 2000 },
            summary: {
              diffs: [
                { file: "a.ts", before: "", after: "new", additions: 10, deletions: 0 },
                { file: "b.ts", before: "old", after: "new", additions: 5, deletions: 3 },
              ],
            },
          },
        },
      } as unknown as Event;

      store.applyEvent(event);

      const state = store.state();
      expect(state.fileChanges).toEqual({
        fileCount: 2,
        additions: 15,
        deletions: 3,
      });
    });

    it("should stop thinking on session.idle", () => {
      const store = createStore();
      store.setThinking("session-1", true);
      expect(store.state().thinkingSessions.has("session-1")).toBe(true);

      store.applyEvent(makeSessionIdleEvent("session-1"));
      expect(store.state().thinkingSessions.has("session-1")).toBe(false);
    });

    it("should stop thinking and set error on session.error", () => {
      const store = createStore();
      store.setThinking("session-1", true);

      store.applyEvent(makeSessionErrorEvent("session-1", "Something went wrong"));

      expect(store.state().thinkingSessions.has("session-1")).toBe(false);
      expect(store.state().sessionErrors.get("session-1")).toBe("Something went wrong");
    });
  });

  describe("permission events", () => {
    it("should add permission on permission.asked", () => {
      const store = createStore();
      const event = makePermissionAskedEvent({
        id: "perm-1",
        permission: "write",
        sessionID: "session-1",
        metadata: {},
      });

      store.applyEvent(event);

      const perm = store.getPermission("perm-1");
      expect(perm).toBeDefined();
      expect(perm?.permission).toBe("write");
    });

    it("should use tool.callID as key when present", () => {
      const store = createStore();
      const event = makePermissionAskedEvent({
        id: "perm-1",
        permission: "write",
        sessionID: "session-1",
        metadata: {},
        tool: { messageID: "msg-1", callID: "call-1" },
      });

      store.applyEvent(event);

      const perm = store.getPermission("call-1");
      expect(perm).toBeDefined();
      expect(perm?.id).toBe("perm-1");
    });

    it("should remove permission on permission.replied", () => {
      const store = createStore();
      store.applyEvent(
        makePermissionAskedEvent({
          id: "perm-1",
          permission: "write",
          sessionID: "session-1",
          metadata: {},
        })
      );
      expect(store.getPermission("perm-1")).toBeDefined();

      store.applyEvent(makePermissionRepliedEvent("perm-1"));
      expect(store.getPermission("perm-1")).toBeUndefined();
    });
  });

  describe("helper methods", () => {
    it("should set and clear thinking state", () => {
      const store = createStore();

      store.setThinking("session-1", true);
      expect(store.state().thinkingSessions.has("session-1")).toBe(true);

      store.setThinking("session-2", true);
      expect(store.state().thinkingSessions.size).toBe(2);

      store.setThinking("session-1", false);
      expect(store.state().thinkingSessions.has("session-1")).toBe(false);
      expect(store.state().thinkingSessions.has("session-2")).toBe(true);
    });

    it("should set and clear session errors", () => {
      const store = createStore();

      store.setSessionError("session-1", "Error 1");
      expect(store.state().sessionErrors.get("session-1")).toBe("Error 1");

      store.setSessionError("session-1", null);
      expect(store.state().sessionErrors.has("session-1")).toBe(false);
    });

    it("should set context info", () => {
      const store = createStore();

      store.setContextInfo({
        usedTokens: 5000,
        limitTokens: 100000,
        percentage: 5,
      });

      expect(store.state().contextInfo?.usedTokens).toBe(5000);
    });

    it("should set file changes", () => {
      const store = createStore();

      store.setFileChanges({
        fileCount: 3,
        additions: 100,
        deletions: 50,
      });

      expect(store.state().fileChanges?.fileCount).toBe(3);
    });

    it("should clear session data", () => {
      const store = createStore();

      store.applyEvent(makeMessageUpdatedEvent("msg-1", "user", "session-1", "Hello"));
      store.applyEvent(makePartUpdatedEvent("part-1", "msg-1", "session-1", "text", "Text"));
      store.applyEvent(
        makePermissionAskedEvent({
          id: "perm-1",
          permission: "write",
          sessionID: "session-1",
          metadata: {},
        })
      );

      expect(store.getMessage("msg-1")).toBeDefined();
      expect(store.getPermission("perm-1")).toBeDefined();

      store.clearSession("session-1");

      expect(store.getMessage("msg-1")).toBeUndefined();
      expect(store.getPart("part-1")).toBeUndefined();
      expect(store.getPermission("perm-1")).toBeUndefined();
    });
  });

  describe("status management", () => {
    it("should update status", () => {
      const store = createStore();

      store.setStatus({ status: "connecting" });
      expect(store.status()).toEqual({ status: "connecting" });

      store.setStatus({ status: "connected" });
      expect(store.status()).toEqual({ status: "connected" });

      store.setStatus({ status: "reconnecting", attempt: 3 });
      expect(store.status()).toEqual({ status: "reconnecting", attempt: 3 });

      store.setStatus({ status: "error", message: "Connection failed" });
      expect(store.status()).toEqual({ status: "error", message: "Connection failed" });
    });
  });

  describe("event clearing session errors", () => {
    it("should clear session error when message.updated arrives", () => {
      const store = createStore();

      store.setSessionError("session-1", "Previous error");
      expect(store.state().sessionErrors.get("session-1")).toBe("Previous error");

      store.applyEvent(makeMessageUpdatedEvent("msg-1", "assistant", "session-1"));
      expect(store.state().sessionErrors.has("session-1")).toBe(false);
    });

    it("should clear session error when message.part.updated arrives", () => {
      const store = createStore();

      store.setSessionError("session-1", "Previous error");
      store.applyEvent(makePartUpdatedEvent("part-1", "msg-1", "session-1", "text", "Hi"));

      expect(store.state().sessionErrors.has("session-1")).toBe(false);
    });
  });
});
