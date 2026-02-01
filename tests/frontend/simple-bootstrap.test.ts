import { describe, it, expect } from "vitest";
import { GatekeeperHarness } from "../utils/Gatekeeper";
import { fetchBootstrapData, type BootstrapContext } from "../../src/webview/state/bootstrap";
import type {
  Agent as SDKAgent,
  Session as SDKSession,
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
          name: "default",
          description: "Default agent",
          mode: "primary",
        },
      ] as SDKAgent[],
    };
  }
}

class MockSessionApi implements SessionApi {
  async list(_opts?: { directory?: string }): Promise<{ data?: SDKSession[] }> {
    return { data: [] };
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

describe("Simple Frontend Tests with Gatekeeper", () => {
  it("should fetch basic data without interception", async () => {
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
    expect(result.agents[0].name).toBe("default");
  });

  it("should mock API responses when gates are raised", async () => {
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

    // Intercept the agents call and return custom data
    const agentsCall = await harness.appApi.waitForCall("agents");
    await agentsCall.fulfill({
      data: [
        {
          name: "custom-agent",
          description: "Custom test agent",
          mode: "primary",
          permission: [],
          options: {},
        },
      ],
    });

    // Let other calls go through normally
    const sessionListCall = await harness.sessionApi.waitForCall("list");
    await sessionListCall.proceed();
    await sessionListCall.deliverActual();

    const permissionListCall = await harness.permissionApi.waitForCall("list");
    await permissionListCall.proceed();
    await permissionListCall.deliverActual();

    const result = await resultPromise;

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe("custom-agent");
  });

  it("should filter out system agents", async () => {
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
        { name: "user-agent", mode: "primary", permission: [], options: {} },
        { name: "compaction", mode: "primary", permission: [], options: {} },
        { name: "title", mode: "primary", permission: [], options: {} },
        { name: "summary", mode: "primary", permission: [], options: {} },
      ],
    });

    const sessionListCall = await harness.sessionApi.waitForCall("list");
    await sessionListCall.fulfill({ data: [] });

    const permissionListCall = await harness.permissionApi.waitForCall("list");
    await permissionListCall.fulfill({ data: [] });

    const result = await resultPromise;

    // Only user-agent should remain (compaction, title, summary filtered out)
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe("user-agent");
  });
});
