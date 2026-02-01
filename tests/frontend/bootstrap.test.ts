import { describe, it, expect } from "vitest";
import { GatekeeperHarness } from "../utils/Gatekeeper";
import { fetchBootstrapData, type BootstrapContext } from "../../src/webview/state/bootstrap";
import type {
  Agent as SDKAgent,
  Session as SDKSession,
  Message as SDKMessage,
  Part as SDKPart,
} from "@opencode-ai/sdk/v2/client";

type AppApi = {
  agents(): Promise<{ data?: SDKAgent[] }>;
};

type SessionApi = {
  list(opts?: { directory?: string }): Promise<{ data?: SDKSession[] }>;
  messages(opts: { sessionID: string }): Promise<{ data?: any[] }>;
  get(opts: { sessionID: string }): Promise<{ data?: SDKSession }>;
};

type PermissionApi = {
  list(opts?: { directory?: string }): Promise<{ data?: any[] }>;
};

class MockAppApi implements AppApi {
  async agents(): Promise<{ data?: SDKAgent[] }> {
    return {
      data: [
        {
          name: "test-agent",
          description: "Test agent",
          mode: "primary",
        },
      ] as SDKAgent[],
    };
  }
}

class MockSessionApi implements SessionApi {
  async list(_opts?: { directory?: string }): Promise<{ data?: SDKSession[] }> {
    return {
      data: [
        {
          id: "session-1",
          title: "Test Session",
          projectID: "proj-1",
          directory: "/test",
          parentID: undefined,
          time: { created: Date.now(), updated: Date.now() },
        },
      ] as SDKSession[],
    };
  }

  async messages(_opts: { sessionID: string }): Promise<{ data?: any[] }> {
    return { data: [] };
  }

  async get(_opts: { sessionID: string }): Promise<{ data?: SDKSession }> {
    return {
      data: {
        id: "session-1",
        title: "Test Session",
        projectID: "proj-1",
        directory: "/test",
        parentID: undefined,
        time: { created: Date.now(), updated: Date.now() },
      } as SDKSession,
    };
  }
}

class MockPermissionApi implements PermissionApi {
  async list(_opts?: { directory?: string }): Promise<{ data?: any[] }> {
    return { data: [] };
  }
}

describe("Frontend Bootstrap", () => {
  it("should fetch agents and sessions", async () => {
    const harness = new GatekeeperHarness()
      .add("appApi", () => new MockAppApi())
      .add("sessionApi", () => new MockSessionApi())
      .add("permissionApi", () => new MockPermissionApi());

    harness.lowerAllGates();

    const ctx: BootstrapContext = {
      client: {
        app: harness.appApi.call,
        session: harness.sessionApi.call,
        permission: harness.permissionApi.call,
      },
      sessionId: null,
      workspaceRoot: "/test",
    };

    const result = await fetchBootstrapData(ctx);

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe("test-agent");
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe("session-1");
  });

  it("should intercept and mock agent list call", async () => {
    const harness = new GatekeeperHarness()
      .add("appApi", () => new MockAppApi())
      .add("sessionApi", () => new MockSessionApi())
      .add("permissionApi", () => new MockPermissionApi());

    harness.raiseAllGates();

    const ctx: BootstrapContext = {
      client: {
        app: harness.appApi.intercept,
        session: harness.sessionApi.intercept,
        permission: harness.permissionApi.intercept,
      },
      sessionId: null,
      workspaceRoot: "/test",
    };

    const resultPromise = fetchBootstrapData(ctx);

    const agentsCall = await harness.appApi.waitForCall("agents");
    await agentsCall.fulfill({
      data: [
        {
          name: "mocked-agent",
          description: "Mocked agent",
          mode: "primary",
          permission: [],
          options: {},
        },
      ],
    });

    const sessionListCall = await harness.sessionApi.waitForCall("list");
    await sessionListCall.fulfill({ data: [] });

    const permissionListCall = await harness.permissionApi.waitForCall("list");
    await permissionListCall.fulfill({ data: [] });

    const result = await resultPromise;

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe("mocked-agent");
    expect(result.sessions).toHaveLength(0);
  });

  it("should filter out hidden agents", async () => {
    const harness = new GatekeeperHarness()
      .add("appApi", () => new MockAppApi())
      .add("sessionApi", () => new MockSessionApi())
      .add("permissionApi", () => new MockPermissionApi());

    harness.raiseAllGates();

    const ctx: BootstrapContext = {
      client: {
        app: harness.appApi.intercept,
        session: harness.sessionApi.intercept,
        permission: harness.permissionApi.intercept,
      },
      sessionId: null,
      workspaceRoot: "/test",
    };

    const resultPromise = fetchBootstrapData(ctx);

    const agentsCall = await harness.appApi.waitForCall("agents");
    await agentsCall.fulfill({
      data: [
        {
          name: "visible-agent",
          description: "Visible",
          mode: "primary",
          permission: [],
          options: {},
        },
        {
          name: "compaction",
          description: "Should be hidden",
          mode: "primary",
          permission: [],
          options: {},
        },
        {
          name: "title",
          description: "Should be hidden",
          mode: "primary",
          permission: [],
          options: {},
        },
      ],
    });

    const sessionListCall = await harness.sessionApi.waitForCall("list");
    await sessionListCall.fulfill({ data: [] });

    const permissionListCall = await harness.permissionApi.waitForCall("list");
    await permissionListCall.fulfill({ data: [] });

    const result = await resultPromise;

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe("visible-agent");
  });

  it("should filter out sessions with parentID", async () => {
    const harness = new GatekeeperHarness()
      .add("appApi", () => new MockAppApi())
      .add("sessionApi", () => new MockSessionApi())
      .add("permissionApi", () => new MockPermissionApi());

    harness.raiseAllGates();

    const ctx: BootstrapContext = {
      client: {
        app: harness.appApi.intercept,
        session: harness.sessionApi.intercept,
        permission: harness.permissionApi.intercept,
      },
      sessionId: null,
      workspaceRoot: "/test",
    };

    const resultPromise = fetchBootstrapData(ctx);

    const agentsCall = await harness.appApi.waitForCall("agents");
    await agentsCall.fulfill({ data: [] });

    const sessionListCall = await harness.sessionApi.waitForCall("list");
    await sessionListCall.fulfill({
      data: [
        {
          id: "session-1",
          title: "Root Session",
          projectID: "proj-1",
          directory: "/test",
          parentID: undefined,
          time: { created: Date.now(), updated: Date.now() },
          version: "1",
        },
        {
          id: "session-2",
          title: "Child Session",
          projectID: "proj-1",
          directory: "/test",
          parentID: "session-1",
          time: { created: Date.now(), updated: Date.now() },
          version: "1",
        },
      ],
    });

    const permissionListCall = await harness.permissionApi.waitForCall("list");
    await permissionListCall.fulfill({ data: [] });

    const result = await resultPromise;

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe("session-1");
  });

  it("should handle API errors gracefully", async () => {
    const harness = new GatekeeperHarness()
      .add("appApi", () => new MockAppApi())
      .add("sessionApi", () => new MockSessionApi())
      .add("permissionApi", () => new MockPermissionApi());

    harness.raiseAllGates();

    const ctx: BootstrapContext = {
      client: {
        app: harness.appApi.intercept,
        session: harness.sessionApi.intercept,
        permission: harness.permissionApi.intercept,
      },
      sessionId: null,
      workspaceRoot: "/test",
    };

    const resultPromise = fetchBootstrapData(ctx);

    const agentsCall = await harness.appApi.waitForCall("agents");
    await agentsCall.fulfill({ data: [] });

    const sessionListCall = await harness.sessionApi.waitForCall("list");
    await sessionListCall.fulfill({ data: [] });

    const permissionListCall = await harness.permissionApi.waitForCall("list");
    await permissionListCall.reject(new Error("Network error"));

    const result = await resultPromise;

    expect(result.agents).toHaveLength(0);
    expect(result.sessions).toHaveLength(0);
    expect(result.permissionMap).toEqual({});
  });
});
