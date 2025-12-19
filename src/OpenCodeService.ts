import type { Agent, Config, Event, Session } from "@opencode-ai/sdk";
import { createOpencode, type OpencodeClient } from "@opencode-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { getLogger } from "./extension";

// Debug logging to VSCode output channel
function debugLog(message: string, data?: any) {
  const logger = getLogger();
  if (logger) {
    if (data) {
      logger.info(message, data);
    } else {
      logger.info(message);
    }
  }
}

interface OpencodeInstance {
  client: OpencodeClient;
  server: {
    url: string;
    close(): void;
  };
}

export class OpenCodeService {
  private opencode: OpencodeInstance | null = null;
  private currentSessionId: string | null = null;
  private currentSessionTitle: string = "New Session";
  private isInitializing = false;
  private workspaceDir?: string;
  private agents: Agent[] = [];

  async initialize(workspaceRoot?: string): Promise<void> {
    if (this.opencode || this.isInitializing) {
      return;
    }

    this.isInitializing = true;

    const prevCwd = process.cwd();
    const shouldChdir =
      Boolean(workspaceRoot) && fs.existsSync(workspaceRoot as string);

    // Track workspace directory for SSE subscription
    if (shouldChdir) {
      this.workspaceDir = workspaceRoot as string;
    }

    try {
      // Check if workspace config exists (for logging)
      const configPath = workspaceRoot
        ? path.join(workspaceRoot, "opencode.json")
        : null;
      const hasWorkspaceConfig = configPath && fs.existsSync(configPath);

      if (hasWorkspaceConfig) {
        console.log(`✓ Found workspace config at: ${configPath}`);
        console.log(
          "  OpenCode will load it automatically from the working directory"
        );
      } else {
        console.log(
          "No workspace config found, OpenCode will use default/global config"
        );
      }

      // Temporarily switch cwd so the SDK's spawn inherits the workspace as cwd
      // OpenCode determines project context from the working directory and will
      // automatically load opencode.json if present
      if (shouldChdir) {
        process.chdir(workspaceRoot as string);
      }

      console.log("Starting OpenCode server...");

      // Create OpenCode instance with server and client
      // Don't pass config here - let OpenCode load it from the workspace directory
      this.opencode = await createOpencode({
        hostname: "127.0.0.1",
        port: 0, // Let it choose a random available port
        timeout: 15000, // Give server 15 seconds to start (default is 5s)
      });

      console.log(`OpenCode server started at ${this.opencode.server.url}`);

      // Log the active config after server starts
      await this.logActiveConfig();
    } catch (error) {
      console.error("Failed to initialize OpenCode:", error);
      vscode.window.showErrorMessage(
        `Failed to start OpenCode: ${(error as Error).message}`
      );
      throw error;
    } finally {
      // Always restore the original working directory
      if (shouldChdir) {
        try {
          process.chdir(prevCwd);
        } catch (e) {
          console.warn("Failed to restore working directory:", e);
        }
      }
      this.isInitializing = false;
    }
  }

  private async logActiveConfig(): Promise<void> {
    if (!this.opencode) {
      return;
    }

    try {
      const configResult = await this.opencode.client.config.get();

      if (configResult.error) {
        console.warn("Failed to get active config:", configResult.error);
        return;
      }

      const activeConfig = configResult.data;
      console.log(
        "✓ Active OpenCode config:",
        JSON.stringify(activeConfig, null, 2)
      );
    } catch (error) {
      console.warn("Error getting active config:", error);
    }
  }

  async getAgents(): Promise<Agent[]> {
    if (!this.opencode) {
      throw new Error("OpenCode not initialized");
    }

    const result = await this.opencode.client.app.agents();

    if (result.error) {
      throw new Error(`Failed to get agents: ${JSON.stringify(result.error)}`);
    }

    // Filter to only "primary" or "all" mode agents (not "subagent" only)
    this.agents = (result.data || []).filter(
      (agent) => agent.mode === "primary" || agent.mode === "all"
    );

    debugLog(
      `[getAgents] Found ${this.agents.length} primary/all agents`,
      this.agents.map((a) => a.name)
    );
    return this.agents;
  }

  async createSession(): Promise<string> {
    if (!this.opencode) {
      throw new Error("OpenCode not initialized");
    }

    const response = await this.opencode.client.session.create({
      body: {},
    });

    if (response.error) {
      throw new Error(
        `Failed to create session: ${JSON.stringify(response.error)}`
      );
    }

    const session = response.data as Session;
    this.currentSessionId = session.id;
    this.currentSessionTitle = session.title;

    return this.currentSessionId;
  }

  async listSessions(): Promise<Session[]> {
    if (!this.opencode) {
      throw new Error("OpenCode not initialized");
    }

    const response = await this.opencode.client.session.list();

    if (response.error) {
      throw new Error(
        `Failed to list sessions: ${JSON.stringify(response.error)}`
      );
    }

    return response.data || [];
  }

  async switchSession(sessionId: string): Promise<Session> {
    if (!this.opencode) {
      throw new Error("OpenCode not initialized");
    }

    const response = await this.opencode.client.session.get({
      path: { id: sessionId },
    });

    if (response.error) {
      throw new Error(
        `Failed to get session: ${JSON.stringify(response.error)}`
      );
    }

    const session = response.data as Session;
    this.currentSessionId = session.id;
    this.currentSessionTitle = session.title;
    return session;
  }

  async createNewSession(): Promise<string> {
    return this.createSession();
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  getCurrentSessionTitle(): string {
    return this.currentSessionTitle;
  }

  async sendPrompt(
    text: string,
    sessionId?: string,
    agent?: string
  ): Promise<{ parts: Array<{ type: string; text?: string }> }> {
    if (!this.opencode) {
      throw new Error("OpenCode not initialized");
    }

    const sid = sessionId || this.currentSessionId;

    if (!sid) {
      throw new Error("No active session");
    }

    // Get config to determine which model to use
    const configResult = await this.opencode.client.config.get();

    if (configResult.error) {
      throw new Error(
        `Failed to get config: ${JSON.stringify(configResult.error)}`
      );
    }

    const config = configResult.data;

    // Use the configured model or fallback to Claude
    const model = config?.model || "anthropic/claude-sonnet-4-5-20250929";
    const [providerID, modelID] = model.split("/");

    debugLog(
      `[sendPrompt] Sending to session ${sid}${
        agent ? ` with agent: ${agent}` : ""
      }`
    );

    const result = await this.opencode.client.session.prompt({
      path: { id: sid },
      body: {
        model: { providerID, modelID },
        parts: [{ type: "text", text }],
        agent: agent || undefined,
      },
    });

    if (result.error) {
      throw new Error(`Failed to send prompt: ${JSON.stringify(result.error)}`);
    }

    return result.data as { parts: Array<{ type: string; text?: string }> };
  }

  async sendPromptStreaming(
    text: string,
    onEvent: (event: Event) => void,
    sessionId?: string,
    agent?: string
  ): Promise<void> {
    if (!this.opencode) {
      throw new Error("OpenCode not initialized");
    }

    const sid = sessionId || this.currentSessionId;
    if (!sid) {
      throw new Error("No active session");
    }

    // Get config for model
    const configResult = await this.opencode.client.config.get();
    if (configResult.error) {
      throw new Error(
        `Failed to get config: ${JSON.stringify(configResult.error)}`
      );
    }

    const config = configResult.data;
    const model = config?.model || "anthropic/claude-sonnet-4-5-20250929";
    const [providerID, modelID] = model.split("/");

    // Use the workspace directory used to start the server
    const directory = this.workspaceDir || process.cwd();
    debugLog(
      `[sendPromptStreaming] Starting for session ${sid}${
        agent ? ` with agent: ${agent}` : ""
      }`,
      { directory, text }
    );

    // Subscribe to SSE events BEFORE sending the prompt to avoid missing events
    const sseResult = await this.opencode.client.event.subscribe({
      query: { directory },
    });

    debugLog(
      "[sendPromptStreaming] SSE subscription established, sending prompt..."
    );

    // Now send the prompt (don't await yet)
    const promptPromise = this.opencode.client.session.prompt({
      path: { id: sid },
      body: {
        model: { providerID, modelID },
        parts: [{ type: "text", text }],
        agent: agent || undefined,
      },
    });

    // Process events from the stream
    let eventCount = 0;
    try {
      for await (const event of sseResult.stream) {
        eventCount++;

        // Filter for events related to our session
        const typedEvent = event as Event;
        const props = (typedEvent as any).properties ?? {};
        const evSessionID = props.sessionID as string | undefined;

        // Log all events for our session
        if (!evSessionID || evSessionID === sid) {
          debugLog(`[SSE Event #${eventCount}] ${typedEvent.type}`, {
            sessionID: evSessionID,
            properties: props,
          });

          onEvent(typedEvent);

          // Stop streaming when session goes idle
          if (typedEvent.type === "session.idle") {
            debugLog(
              `[sendPromptStreaming] Session idle after ${eventCount} events, stopping stream`
            );
            break;
          }
        }
      }
    } catch (error) {
      debugLog("[sendPromptStreaming] SSE streaming error", error);
      throw error;
    } finally {
      // Close the SSE connection to avoid leaks
      try {
        (sseResult as any).close?.();
        debugLog("[sendPromptStreaming] SSE stream closed");
      } catch (e) {
        debugLog("[sendPromptStreaming] Failed to close SSE stream", e);
      }
    }

    // Wait for the prompt to complete
    const result = await promptPromise;
    if (result.error) {
      throw new Error(`Prompt failed: ${JSON.stringify(result.error)}`);
    }
  }

  async getCurrentSession(): Promise<string | null> {
    return this.currentSessionId;
  }

  async getMessages(
    sessionId: string
  ): Promise<Array<{ info: unknown; parts: unknown[] }>> {
    if (!this.opencode) {
      throw new Error("OpenCode not initialized");
    }

    const result = await this.opencode.client.session.messages({
      path: { id: sessionId },
    });

    if (result.error) {
      throw new Error(
        `Failed to get messages: ${JSON.stringify(result.error)}`
      );
    }

    return (result.data || []) as Array<{ info: unknown; parts: unknown[] }>;
  }

  async getConfig(): Promise<any> {
    if (!this.opencode) {
      throw new Error("OpenCode not initialized");
    }

    const result = await this.opencode.client.config.providers();

    if (result.error) {
      throw new Error(`Failed to get config: ${JSON.stringify(result.error)}`);
    }

    return result.data;
  }

  async respondToPermission(
    sessionId: string,
    permissionId: string,
    response: "once" | "always" | "reject"
  ): Promise<void> {
    if (!this.opencode) {
      throw new Error("OpenCode not initialized");
    }

    debugLog('[respondToPermission]', { sessionId, permissionId, response });

    const result = await this.opencode.client.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: permissionId },
      body: { response },
    });

    if (result.error) {
      throw new Error(
        `Failed to respond to permission: ${JSON.stringify(result.error)}`
      );
    }

    debugLog('[respondToPermission] Success');
  }

  async abortSession(sessionId?: string): Promise<void> {
    if (!this.opencode) {
      throw new Error("OpenCode not initialized");
    }

    const sid = sessionId || this.currentSessionId;
    if (!sid) {
      throw new Error("No active session to abort");
    }

    debugLog(`[abortSession] Aborting session ${sid}`);

    const result = await this.opencode.client.session.abort({
      path: { id: sid },
    });

    if (result.error) {
      throw new Error(`Failed to abort session: ${JSON.stringify(result.error)}`);
    }

    debugLog(`[abortSession] Session ${sid} aborted successfully`);
  }

  async dispose(): Promise<void> {
    if (this.opencode) {
      this.opencode.server.close();
      this.opencode = null;
      this.currentSessionId = null;
    }
  }

  isReady(): boolean {
    return this.opencode !== null && !this.isInitializing;
  }

  getWorkspaceRoot(): string | undefined {
    return this.workspaceDir;
  }
}
