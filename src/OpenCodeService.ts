import { createOpencode, type OpencodeClient } from "@opencode-ai/sdk/v2";
import type { Message } from "@opencode-ai/sdk/v2/client";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { getLogger } from "./extension";

const OPENCODE_INSTALL_URL = "https://opencode.ai/install";

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
      const logger = getLogger();
      const configPath = workspaceRoot
        ? path.join(workspaceRoot, "opencode.json")
        : null;
      const hasWorkspaceConfig = configPath && fs.existsSync(configPath);

      if (hasWorkspaceConfig) {
        logger.info(`Found workspace config at: ${configPath}`);
      } else {
        logger.info(
          "No workspace config found, OpenCode will use default/global config",
        );
      }

      this.ensureOpencodeCliAvailable();

      if (shouldChdir) {
        process.chdir(workspaceRoot as string);
      }

      logger.info("Starting OpenCode server...");

      this.opencode = await createOpencode({
        hostname: "127.0.0.1",
        port: 0,
        timeout: 15000,
      });

      logger.info(`OpenCode server started at ${this.opencode.server.url}`);
    } catch (error) {
      getLogger().error("Failed to initialize OpenCode", error);
      await this.showStartupError(error);
      throw error;
    } finally {
      if (shouldChdir) {
        try {
          process.chdir(prevCwd);
        } catch (e) {
          getLogger().warn("Failed to restore working directory", e);
        }
      }
      this.isInitializing = false;
    }
  }

  private ensureOpencodeCliAvailable(): void {
    const lookupCommand = process.platform === "win32" ? "where" : "which";
    const lookupResult = spawnSync(lookupCommand, ["opencode"], {
      encoding: "utf8",
    });

    if (lookupResult.status === 0 && lookupResult.stdout.trim().length > 0) {
      const binaryPath = lookupResult.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);

      getLogger().info("OpenCode CLI found on PATH", {
        command: `${lookupCommand} opencode`,
        binaryPath,
      });
      return;
    }

    getLogger().error("OpenCode CLI preflight check failed", {
      command: `${lookupCommand} opencode`,
      status: lookupResult.status,
      error: lookupResult.error?.message,
      stderr: lookupResult.stderr?.trim(),
    });

    const verifyCommand =
      process.platform === "win32" ? "where opencode" : "which opencode";

    throw new Error(
      `OpenCode CLI was not found on PATH. Verify with "${verifyCommand}", then restart VS Code.`,
    );
  }

  private async showStartupError(error: unknown): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown startup error";
    const isMissingCli = errorMessage.includes(
      "OpenCode CLI was not found on PATH",
    );

    if (isMissingCli) {
      const selection = await vscode.window.showErrorMessage(
        "OpenCode CLI was not found in the VS Code environment. Install it from opencode.ai/install, verify it works in your terminal, then fully restart VS Code.",
        "Install OpenCode",
      );

      if (selection === "Install OpenCode") {
        await vscode.env.openExternal(vscode.Uri.parse(OPENCODE_INSTALL_URL));
      }
      return;
    }

    await vscode.window.showErrorMessage(`Failed to start OpenCode: ${errorMessage}`);
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  getCurrentSessionTitle(): string {
    return this.currentSessionTitle;
  }

  async getMessages(
    sessionId: string,
  ): Promise<Message[]> {
    if (!this.opencode) {
      throw new Error("OpenCode not initialized");
    }

    const result = await this.opencode.client.session.messages({
      sessionID: sessionId,
    });

    if (result.error) {
      throw new Error(
        `Failed to get messages: ${JSON.stringify(result.error)}`,
      );
    }

    return result.data || [];
  }

  dispose(): void {
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
