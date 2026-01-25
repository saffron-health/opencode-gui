import { createOpencode, type OpencodeClient } from "@opencode-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { getLogger } from "./extension";

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

  async initialize(workspaceRoot?: string): Promise<void> {
    if (this.opencode || this.isInitializing) {
      return;
    }

    this.isInitializing = true;

    const prevCwd = process.cwd();
    const shouldChdir =
      Boolean(workspaceRoot) && fs.existsSync(workspaceRoot as string);

    if (shouldChdir) {
      this.workspaceDir = workspaceRoot as string;
    }

    try {
      const configPath = workspaceRoot
        ? path.join(workspaceRoot, "opencode.json")
        : null;
      const hasWorkspaceConfig = configPath && fs.existsSync(configPath);

      if (hasWorkspaceConfig) {
        console.log(`✓ Found workspace config at: ${configPath}`);
      } else {
        console.log(
          "No workspace config found, OpenCode will use default/global config",
        );
      }

      if (shouldChdir) {
        process.chdir(workspaceRoot as string);
      }

      console.log("Starting OpenCode server...");

      this.opencode = await createOpencode({
        hostname: "127.0.0.1",
        port: 0,
        timeout: 15000,
      });

      console.log(`OpenCode server started at ${this.opencode.server.url}`);
    } catch (error) {
      console.error("Failed to initialize OpenCode:", error);
      vscode.window.showErrorMessage(
        `Failed to start OpenCode: ${(error as Error).message}`,
      );
      throw error;
    } finally {
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

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  getCurrentSessionTitle(): string {
    return this.currentSessionTitle;
  }

  async getMessages(
    sessionId: string,
  ): Promise<Array<{ info: unknown; parts: unknown[] }>> {
    if (!this.opencode) {
      throw new Error("OpenCode not initialized");
    }

    const result = await this.opencode.client.session.messages({
      path: { id: sessionId },
    });

    if (result.error) {
      throw new Error(
        `Failed to get messages: ${JSON.stringify(result.error)}`,
      );
    }

    return (result.data || []) as Array<{ info: unknown; parts: unknown[] }>;
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

  getServerUrl(): string | undefined {
    return this.opencode?.server.url;
  }
}
