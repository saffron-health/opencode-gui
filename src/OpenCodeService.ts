import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createOpencode, type OpencodeClient } from '@opencode-ai/sdk';
import type { Session, Config, Event } from '@opencode-ai/sdk';

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
  private isInitializing = false;

  async initialize(workspaceRoot?: string): Promise<void> {
    if (this.opencode || this.isInitializing) {
      return;
    }

    this.isInitializing = true;

    const prevCwd = process.cwd();
    const shouldChdir = Boolean(workspaceRoot) && fs.existsSync(workspaceRoot as string);

    try {
      // Load workspace config if available
      const config = this.loadWorkspaceConfig(workspaceRoot);

      // Log config source for debugging
      if (config) {
        console.log(`✓ Loaded workspace config from: ${path.join(workspaceRoot!, 'opencode.json')}`);
        console.log('Config values:', JSON.stringify(config, null, 2));
      } else {
        console.log('No workspace config found, will use OpenCode default config');
      }

      // Temporarily switch cwd so the SDK's spawn inherits the workspace as cwd
      // OpenCode determines project context from the working directory
      if (shouldChdir) {
        process.chdir(workspaceRoot as string);
      }

      // Create OpenCode instance with server and client
      this.opencode = await createOpencode({
        hostname: '127.0.0.1',
        port: 0, // Let it choose a random available port
        config: config || {},
      });

      console.log(`OpenCode server started at ${this.opencode.server.url}`);

      // Verify the config was actually applied by querying the server
      await this.verifyConfig(config);
    } catch (error) {
      console.error('Failed to initialize OpenCode:', error);
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
          console.warn('Failed to restore working directory:', e);
        }
      }
      this.isInitializing = false;
    }
  }

  private loadWorkspaceConfig(workspaceRoot?: string): Partial<Config> | null {
    if (!workspaceRoot) {
      return null;
    }

    const configPath = path.join(workspaceRoot, 'opencode.json');
    
    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        // Remove comments from JSON (simple approach)
        const cleanedContent = configContent.replace(/\/\/.*$/gm, '');
        const config = JSON.parse(cleanedContent) as Partial<Config>;
        console.log(`Found workspace config at: ${configPath}`);
        return config;
      } catch (error) {
        console.error('Failed to parse workspace opencode.json:', error);
        vscode.window.showWarningMessage(
          `Found opencode.json but failed to parse it: ${(error as Error).message}`
        );
      }
    }

    return null;
  }

  private async verifyConfig(expectedConfig: Partial<Config> | null): Promise<void> {
    if (!this.opencode) {
      return;
    }

    try {
      const configResult = await this.opencode.client.config.get();
      
      if (configResult.error) {
        console.warn('Failed to verify config:', configResult.error);
        return;
      }

      const activeConfig = configResult.data;
      console.log('Active OpenCode config:', JSON.stringify(activeConfig, null, 2));

      // If we loaded a workspace config, verify key settings match
      if (expectedConfig) {
        const verificationsNeeded = [];
        
        if (expectedConfig.model && activeConfig.model !== expectedConfig.model) {
          verificationsNeeded.push(`model (expected: ${expectedConfig.model}, got: ${activeConfig.model})`);
        }

        if (verificationsNeeded.length > 0) {
          console.warn('⚠️ Workspace config may not have been fully applied:');
          verificationsNeeded.forEach(msg => console.warn(`  - ${msg}`));
        } else {
          console.log('✓ Workspace config verified and active');
        }
      }
    } catch (error) {
      console.warn('Error verifying config:', error);
    }
  }

  async createSession(title?: string): Promise<string> {
    if (!this.opencode) {
      throw new Error('OpenCode not initialized');
    }

    const response = await this.opencode.client.session.create({
      body: { title: title || 'VSCode Session' },
    });

    if (response.error) {
      throw new Error(`Failed to create session: ${JSON.stringify(response.error)}`);
    }

    const session = response.data as Session;
    this.currentSessionId = session.id;

    return this.currentSessionId;
  }

  async sendPrompt(text: string, sessionId?: string): Promise<{ parts: Array<{ type: string; text?: string }> }> {
    if (!this.opencode) {
      throw new Error('OpenCode not initialized');
    }

    const sid = sessionId || this.currentSessionId;
    
    if (!sid) {
      throw new Error('No active session');
    }

    // Get config to determine which model to use
    const configResult = await this.opencode.client.config.get();
    
    if (configResult.error) {
      throw new Error(`Failed to get config: ${JSON.stringify(configResult.error)}`);
    }

    const config = configResult.data;
    
    // Use the configured model or fallback to Claude
    const model = config?.model || 'anthropic/claude-3-5-sonnet-20241022';
    const [providerID, modelID] = model.split('/');

    const result = await this.opencode.client.session.prompt({
      path: { id: sid },
      body: {
        model: { providerID, modelID },
        parts: [{ type: 'text', text }],
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
    sessionId?: string
  ): Promise<void> {
    if (!this.opencode) {
      throw new Error('OpenCode not initialized');
    }

    const sid = sessionId || this.currentSessionId;
    if (!sid) {
      throw new Error('No active session');
    }

    // Get config for model
    const configResult = await this.opencode.client.config.get();
    if (configResult.error) {
      throw new Error(`Failed to get config: ${JSON.stringify(configResult.error)}`);
    }

    const config = configResult.data;
    const model = config?.model || 'anthropic/claude-3-5-sonnet-20241022';
    const [providerID, modelID] = model.split('/');

    // Send the prompt (non-blocking)
    const promptPromise = this.opencode.client.session.prompt({
      path: { id: sid },
      body: {
        model: { providerID, modelID },
        parts: [{ type: 'text', text }],
      },
    });

    // Subscribe to SSE events
    const sseResult = await this.opencode.client.event.subscribe({
      query: { directory: process.cwd() }
    });

    // Process events from the stream
    try {
      for await (const event of sseResult.stream) {
        // Filter for events related to our session
        const typedEvent = event as Event;
        
        // Check if event has properties with sessionID
        if ('properties' in typedEvent && typedEvent.properties && typeof typedEvent.properties === 'object') {
          const props = typedEvent.properties as { sessionID?: string };
          if (props.sessionID) {
            // Only process events for our session
            if (props.sessionID === sid) {
              onEvent(typedEvent);
              
              // Stop streaming when session goes idle
              if (typedEvent.type === 'session.idle') {
                break;
              }
            }
            continue;
          }
        }
        
        // Forward global events (installation.updated, etc.)
        onEvent(typedEvent);
      }
    } catch (error) {
      console.error('SSE streaming error:', error);
      throw error;
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

  async getMessages(sessionId: string): Promise<Array<{ info: unknown; parts: unknown[] }>> {
    if (!this.opencode) {
      throw new Error('OpenCode not initialized');
    }

    const result = await this.opencode.client.session.messages({
      path: { id: sessionId },
    });

    if (result.error) {
      throw new Error(`Failed to get messages: ${JSON.stringify(result.error)}`);
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
}
