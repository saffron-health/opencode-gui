#!/usr/bin/env tsx

import { Command } from "commander";
import { spawn, execSync } from "child_process";
import { chromium, type Browser, type Page, type Frame } from "@playwright/test";
import {
  downloadAndUnzipVSCode,
  resolveCliPathFromVSCodeExecutablePath,
} from "@vscode/test-electron";
import * as path from "path";
import * as fs from "fs";
import * as fsPromises from "fs/promises";

const TMUX_SESSION = "opencode-dev";
const CDP_PORT = 9222;
const VITE_DEV_PORT = 5173;
const VITE_DEV_URL = `http://localhost:${VITE_DEV_PORT}`;
const STATE_DIR = path.join(process.cwd(), "tmp", "playwright");
const SESSION_NAME = "dev";
const SCREENSHOTS_DIR = path.join(process.cwd(), "tmp", "playwright-screenshots");

// --- Session state (compatible with .bin/playwright CLI) ---

type SessionState = {
  port: number;
  session: string;
  startedAt: string;
  external?: boolean;
};

function getStateFilePath(): string {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  return path.join(STATE_DIR, `${SESSION_NAME}.json`);
}

function writeSessionState(state: SessionState): void {
  fs.writeFileSync(getStateFilePath(), JSON.stringify(state, null, 2));
}

function clearSessionState(): void {
  const stateFile = getStateFilePath();
  if (fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
  }
}

// --- Helpers ---

function tmuxSessionExists(): boolean {
  try {
    execSync(`tmux has-session -t ${TMUX_SESSION} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

async function waitForPort(port: number, timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://localhost:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`CDP port ${port} not ready within ${timeout}ms`);
}

async function tryConnectToPort(
  port: number,
  timeoutMs: number = 5000
): Promise<Browser | null> {
  const endpoint = `http://127.0.0.1:${port}`;
  try {
    const connectPromise = chromium.connectOverCDP(endpoint);
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeoutMs)
    );
    return await Promise.race([connectPromise, timeoutPromise]);
  } catch {
    return null;
  }
}

async function connect(): Promise<{
  browser: Browser;
  page: Page;
}> {
  const browser = await tryConnectToPort(CDP_PORT, 10000);
  if (!browser) {
    throw new Error(
      `Could not connect to CDP at port ${CDP_PORT}. Is VSCode running? Start with: pnpm dev`
    );
  }

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    throw new Error("No browser context found.");
  }

  let pages: Page[] = [];
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const allPages = contexts.flatMap((c) => c.pages());
    pages = allPages.filter((p) => {
      const url = p.url();
      if (url.startsWith("devtools://")) return false;
      if (url.startsWith("chrome-error://")) return false;
      return true;
    });
    if (pages.length > 0) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  if (pages.length === 0) {
    throw new Error("No pages found.");
  }

  const page = pages[pages.length - 1]!;
  return { browser, page };
}

async function waitForWebviewFrame(
  page: Page,
  timeoutMs: number = 30000
): Promise<Frame> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const frame = page.frames().find((f) => f.name() === "active-frame");
    if (frame) return frame;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Could not find webview active-frame within ${timeoutMs}ms. ` +
      `Make sure the OpenCode sidebar is visible in VSCode.`
  );
}

// --- VSCode launch (foreground mode, run inside tmux) ---

async function waitForViteServer(timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`${VITE_DEV_URL}/@vite/client`);
      if (response.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Vite dev server not ready within ${timeout}ms`);
}

async function launchVSCode(): Promise<void> {
  const extensionPath = path.resolve(process.cwd());
  const workspaceRoot = path.resolve(process.cwd());
  const userDataDir = path.join(process.cwd(), ".vscode-test-debug");

  // Start Vite dev server for webview HMR
  console.log("Starting Vite dev server...");
  const viteProcess = spawn("npx", ["vite", "dev", "--config", "vite.config.ts"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  viteProcess.stdout?.on("data", (data) => {
    const text = data.toString().trim();
    if (text) console.log(`[vite] ${text}`);
  });
  viteProcess.stderr?.on("data", (data) => {
    const text = data.toString().trim();
    if (text) console.error(`[vite] ${text}`);
  });

  await waitForViteServer(15000);
  console.log(`Vite dev server ready at ${VITE_DEV_URL}`);

  console.log("Downloading VSCode...");
  const vscodeExecutablePath = await downloadAndUnzipVSCode();
  const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);

  const launchArgs = [
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--disable-web-security",
    "--disable-site-isolation-trials",
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-updates",
    "--disable-workspace-trust",
    "--skip-welcome",
    "--skip-release-notes",
    "--disable-extensions",
    `--extensionDevelopmentPath=${extensionPath}`,
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--wait",
    workspaceRoot,
  ];

  console.log("Starting VSCode...");
  const vscodeProcess = spawn(cliPath, launchArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      VSCODE_LOG_LEVEL: "info",
      OPENCODE_DEV_SERVER_URL: VITE_DEV_URL,
    },
  });

  vscodeProcess.stderr?.on("data", (data) => {
    const text = data.toString().trim();
    if (text && !text.includes("remote-debugging-port")) {
      console.error(`[vscode] ${text}`);
    }
  });

  vscodeProcess.on("exit", (code) => {
    console.log(`VSCode exited (code ${code})`);
    viteProcess.kill("SIGTERM");
    clearSessionState();
    process.exit(code || 0);
  });

  console.log("Waiting for CDP...");
  await waitForPort(CDP_PORT, 60000);

  // Write session state so .bin/playwright CLI can also interact
  writeSessionState({
    port: CDP_PORT,
    session: SESSION_NAME,
    startedAt: new Date().toISOString(),
    external: true,
  });

  console.log(`Ready — CDP at http://localhost:${CDP_PORT}`);

  const cleanup = async () => {
    console.log("Shutting down...");
    clearSessionState();
    viteProcess.kill("SIGTERM");
    vscodeProcess.kill("SIGTERM");
    try {
      execSync(
        `pkill -f "extensionDevelopmentPath=${extensionPath}"`,
        { stdio: "ignore" }
      );
    } catch {
      /* already dead */
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGHUP", cleanup);
  await new Promise(() => {});
}

// --- Commands ---

async function runLaunch(): Promise<void> {
  if (tmuxSessionExists()) {
    console.log(`Session "${TMUX_SESSION}" already running.`);
    console.log(`  Exec:   pnpm dev exec "..."`);
    console.log(`  Snap:   pnpm dev snapshot`);
    console.log(`  Attach: tmux attach -t ${TMUX_SESSION}`);
    console.log(`  Stop:   pnpm dev stop`);
    process.exit(1);
  }

  const args = process.argv.slice(2).concat("--foreground");
  const cmd = `cd '${process.cwd()}' && npx tsx scripts/dev.ts ${args.join(" ")}`;
  execSync(`tmux new-session -d -s ${TMUX_SESSION} '${cmd}'`);

  try {
    await waitForPort(CDP_PORT, 60000);
    console.log(`✅ VSCode running in tmux "${TMUX_SESSION}"`);
    console.log(`   CDP:    http://localhost:${CDP_PORT}`);
    console.log(`   Exec:   pnpm dev exec "..."`);
    console.log(`   Snap:   pnpm dev snapshot`);
    console.log(`   Attach: tmux attach -t ${TMUX_SESSION}`);
    console.log(`   Stop:   pnpm dev stop`);
  } catch {
    console.error(
      "Timed out waiting for VSCode to start. Check: tmux attach -t " +
        TMUX_SESSION
    );
    process.exit(1);
  }
}

async function runExec(code: string): Promise<void> {
  const { browser, page } = await connect();

  try {
    const frame = await waitForWebviewFrame(page);

    const AsyncFunction = Object.getPrototypeOf(
      async function () {}
    ).constructor;

    const helpers = {
      page,
      frame,
      browser,
      console,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      fetch,
      URL,
      Buffer,
    };

    const fn = new AsyncFunction(...Object.keys(helpers), code);
    const result = await fn(...Object.values(helpers));

    if (result !== undefined) {
      console.log(
        typeof result === "string" ? result : JSON.stringify(result, null, 2)
      );
    }
  } finally {
    await browser.close();
  }
}

async function runSnapshot(): Promise<void> {
  const { browser, page } = await connect();

  try {
    const title = await page.title();
    const sanitizedTitle = title
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 50);

    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `${sanitizedTitle}-${timestamp}`;
    const pngPath = path.join(SCREENSHOTS_DIR, `${baseName}.png`);

    await page.screenshot({ path: pngPath, fullPage: true });

    console.log(`Screenshot saved:`);
    console.log(`  PNG: ${pngPath}`);
  } finally {
    await browser.close();
  }
}

async function runStop(): Promise<void> {
  if (!tmuxSessionExists()) {
    console.log("No dev session running.");
    clearSessionState();
    return;
  }

  // Send Ctrl+C so the foreground process runs cleanup
  execSync(`tmux send-keys -t ${TMUX_SESSION} C-c`, { stdio: "inherit" });
  await new Promise((resolve) => setTimeout(resolve, 4000));

  if (tmuxSessionExists()) {
    execSync(`tmux kill-session -t ${TMUX_SESSION} 2>/dev/null`, {
      stdio: "inherit",
    });
  }

  clearSessionState();
  console.log("Session stopped.");
}

// --- CLI ---

const program = new Command();

program
  .name("dev")
  .description(
    "Launch VSCode with the OpenCode extension and interact via Playwright"
  );

program
  .command("launch", { isDefault: true })
  .description("Launch VSCode in a background tmux session")
  .option("--foreground", "Run in foreground (used internally by tmux)")
  .action(async (opts) => {
    if (opts.foreground) {
      await launchVSCode();
    } else {
      await runLaunch();
    }
  });

program
  .command("exec <code>")
  .description(
    "Execute JS code with access to page, frame (webview active-frame), and browser"
  )
  .action(async (code: string) => {
    await runExec(code);
  });

program
  .command("snapshot")
  .description("Take a screenshot of the VSCode window")
  .action(async () => {
    await runSnapshot();
  });

program
  .command("stop")
  .description("Stop the running dev session")
  .action(async () => {
    await runStop();
  });

program.parseAsync().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
