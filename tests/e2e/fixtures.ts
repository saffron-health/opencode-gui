import { test as base, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "child_process";

interface OpenCodeConfig {
  serverUrl: string;
  workspaceRoot?: string;
}

interface OpenCodeServer {
  url: string;
  process: ChildProcess;
}

export interface OpenCodeWorkerFixtures {
  opencodeServer: OpenCodeServer;
}

export interface OpenCodeFixtures {
  openWebview: (config?: Partial<OpenCodeConfig>) => Promise<Page>;
}

async function waitForServerReady(url: string, timeout = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`${url}/session`);
      if (response.ok) {
        console.log(`[fixture] Server health check passed`);
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeout}ms`);
}

async function startOpenCodeServer(workspaceRoot: string): Promise<OpenCodeServer> {
  return new Promise((resolve, reject) => {
    console.log(`[fixture] Spawning opencode serve in ${workspaceRoot}`);
    
    const serverProcess = spawn(
      "opencode",
      [
        "serve",
        "--port",
        "0", // Let OS pick an available port
        "--hostname",
        "127.0.0.1",
        "--cors",
        "http://localhost:5199",
        "--cors",
        "http://127.0.0.1:5199",
        "--print-logs",
      ],
      {
        cwd: workspaceRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      }
    );

    let serverUrl: string | null = null;
    let outputBuffer = "";

    const handleOutput = (data: Buffer) => {
      const text = data.toString();
      outputBuffer += text;
      console.log(`[opencode] ${text.trim()}`);

      // Look for the server URL in the output
      // OpenCode outputs: "opencode server listening on http://127.0.0.1:XXXXX"
      const urlMatch = outputBuffer.match(/listening on (http:\/\/[\d.:]+)/i);
      if (urlMatch && !serverUrl) {
        // Normalize 127.0.0.1 to localhost for browser compatibility
        serverUrl = urlMatch[1].replace("127.0.0.1", "localhost");
        console.log(`[fixture] Detected server URL: ${serverUrl}`);
        resolve({ url: serverUrl, process: serverProcess });
      }
    };

    serverProcess.stdout?.on("data", handleOutput);
    serverProcess.stderr?.on("data", handleOutput);

    serverProcess.on("error", (err) => {
      reject(new Error(`Failed to start OpenCode server: ${err.message}`));
    });

    serverProcess.on("exit", (code) => {
      if (!serverUrl) {
        reject(
          new Error(
            `OpenCode server exited with code ${code} before providing URL. Output: ${outputBuffer}`
          )
        );
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!serverUrl) {
        serverProcess.kill();
        reject(
          new Error(
            `Timeout waiting for OpenCode server to start. Output: ${outputBuffer}`
          )
        );
      }
    }, 30000);
  });
}

export const test = base.extend<OpenCodeFixtures, OpenCodeWorkerFixtures>({
  // Share the server across all tests in a worker
  opencodeServer: [
    async ({}, use) => {
      const workspaceRoot = process.env.OPENCODE_WORKSPACE_ROOT || process.cwd();
      console.log(`[fixture] Starting OpenCode server in ${workspaceRoot}`);
      const server = await startOpenCodeServer(workspaceRoot);
      console.log(`[fixture] OpenCode server started at ${server.url}`);
      
      // Wait for server to be fully ready
      await waitForServerReady(server.url);

      await use(server);

      // Cleanup: kill the server after tests
      console.log(`[fixture] Stopping OpenCode server`);
      server.process.kill("SIGTERM");
    },
    { scope: "worker" },
  ],

  openWebview: async ({ page, opencodeServer }, use) => {
    const openWebview = async (config?: Partial<OpenCodeConfig>) => {
      const defaultConfig: OpenCodeConfig = {
        serverUrl: opencodeServer.url,
        workspaceRoot: process.env.OPENCODE_WORKSPACE_ROOT || process.cwd(),
      };

      const finalConfig = { ...defaultConfig, ...config };
      console.log(`[fixture] Opening webview with config:`, finalConfig);

      // Set up route to inject config before page loads
      await page.route("**/standalone.html", async (route) => {
        const response = await route.fetch();
        let html = await response.text();
        
        // Replace the default config with our dynamic config
        html = html.replace(
          /window\.OPENCODE_CONFIG\s*=\s*\{[^}]+\}/,
          `window.OPENCODE_CONFIG = ${JSON.stringify(finalConfig)}`
        );
        
        await route.fulfill({
          response,
          body: html,
          headers: {
            ...response.headers(),
            "content-type": "text/html",
          },
        });
      });

      // Navigate to the standalone HTML page
      await page.goto("/src/webview/standalone.html");

      // Wait for the app to be ready (message log container)
      await page.waitForSelector('[role="log"]', { timeout: 10000 });

      return page;
    };

    await use(openWebview);
  },
});

export { expect } from "@playwright/test";
