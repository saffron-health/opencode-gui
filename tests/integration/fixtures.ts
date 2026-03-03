import { beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { chromium, type Browser, type Page, type CDPSession } from '@playwright/test';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface VSCodeInstance {
  process: ChildProcess;
  cdpUrl: string;
  userDataDir: string;
  extensionLogPath: string;
  logs: string[];
}

export interface WebviewSession {
  page: Page;
  cdpSession: CDPSession;
  consoleLogs: Array<{ type: string; text: string; timestamp: Date }>;
  networkRequests: Array<{ url: string; method: string; timestamp: Date }>;
}

export interface ExtensionTestContext {
  vscode: VSCodeInstance;
  webview: WebviewSession;
  browser: Browser;
}

let sharedContext: ExtensionTestContext | null = null;

async function waitForPort(port: number, timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://localhost:${port}/json/version`);
      if (response.ok) {
        console.log(`[fixture] CDP port ${port} is ready`);
        return;
      }
    } catch (e) {
      // Port not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Port ${port} did not become available within ${timeout}ms`);
}

async function launchVSCode(options: {
  extensionPath: string;
  workspaceRoot?: string;
  debugPort: number;
  userDataDir: string;
}): Promise<VSCodeInstance> {
  const { extensionPath, workspaceRoot, debugPort, userDataDir } = options;

  // Download VSCode if needed
  console.log('[fixture] Downloading VSCode...');
  const vscodeExecutablePath = await downloadAndUnzipVSCode();
  const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

  // Launch with debugging enabled
  const launchArgs = [
    ...args,
    `--extensionDevelopmentPath=${extensionPath}`,
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-extensions',
    '--disable-workspace-trust',
    '--no-sandbox',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-gpu', // Helps with headless stability
    '--disable-dev-shm-usage',
    ...(workspaceRoot ? [workspaceRoot] : []),
  ];

  console.log(`[fixture] Launching VSCode with CDP on port ${debugPort}`);

  const logs: string[] = [];
  const vscodeProcess = spawn(cli, launchArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      VSCODE_LOG_LEVEL: 'trace',
    },
  });

  vscodeProcess.stdout?.on('data', (data) => {
    const text = data.toString();
    logs.push(text);
    console.log(`[VSCode] ${text.trim()}`);
  });

  vscodeProcess.stderr?.on('data', (data) => {
    const text = data.toString();
    logs.push(text);
    console.log(`[VSCode Error] ${text.trim()}`);
  });

  vscodeProcess.on('exit', (code) => {
    console.log(`[fixture] VSCode process exited with code ${code}`);
  });

  // Wait for CDP to be ready
  await waitForPort(debugPort, 60000);

  // The extension log path will be in the user data directory
  const extensionLogPath = path.join(userDataDir, 'logs', 'window1', 'exthost', 'output_logging_opencode');

  return {
    process: vscodeProcess,
    cdpUrl: `http://localhost:${debugPort}`,
    userDataDir,
    extensionLogPath,
    logs,
  };
}

async function connectToWebview(cdpUrl: string): Promise<{ browser: Browser; session: WebviewSession }> {
  console.log('[fixture] Connecting to VSCode via CDP...');
  const browser = await chromium.connectOverCDP(cdpUrl);

  // First, find the main VSCode window and execute command to open OpenCode view
  let mainPage: Page | null = null;
  const contexts = browser.contexts();
  for (const context of contexts) {
    const pages = context.pages();
    for (const page of pages) {
      const url = page.url();
      // Main VSCode window (not webview)
      if (!url.includes('vscode-webview')) {
        mainPage = page;
        console.log(`[fixture] Found main VSCode window: ${url}`);
        break;
      }
    }
    if (mainPage) break;
  }

  if (mainPage) {
    // Execute command to open OpenCode view
    console.log('[fixture] Opening OpenCode view...');
    try {
      await mainPage.evaluate(() => {
        // @ts-ignore - VSCode API available in window
        if (window.vscode) {
          // @ts-ignore
          window.vscode.commands.executeCommand('workbench.view.extension.opencode');
        }
      });
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for view to open
    } catch (e) {
      console.log('[fixture] Could not execute command, webview might already be open');
    }
  }

  // Find the OpenCode webview
  let webviewPage: Page | null = null;
  let attempts = 0;
  const maxAttempts = 20;

  while (!webviewPage && attempts < maxAttempts) {
    const contexts = browser.contexts();
    for (const context of contexts) {
      const pages = context.pages();
      for (const page of pages) {
        const url = page.url();
        // Look for the OpenCode webview
        if (url.includes('vscode-webview') && url.includes('opencode')) {
          webviewPage = page;
          console.log(`[fixture] Found webview: ${url}`);
          break;
        }
      }
      if (webviewPage) break;
    }

    if (!webviewPage) {
      attempts++;
      console.log(`[fixture] Waiting for webview to appear (attempt ${attempts}/${maxAttempts})...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (!webviewPage) {
    throw new Error('Could not find OpenCode webview after waiting');
  }

  // Create CDP session
  const cdpSession = await webviewPage.context().newCDPSession(webviewPage);

  // Enable console and network monitoring
  await cdpSession.send('Runtime.enable');
  await cdpSession.send('Log.enable');
  await cdpSession.send('Network.enable');

  const consoleLogs: Array<{ type: string; text: string; timestamp: Date }> = [];
  const networkRequests: Array<{ url: string; method: string; timestamp: Date }> = [];

  cdpSession.on('Runtime.consoleAPICalled', (event) => {
    const text = event.args.map(arg => arg.value ?? arg.description).join(' ');
    consoleLogs.push({
      type: event.type,
      text,
      timestamp: new Date(),
    });
    console.log(`[Webview Console] ${event.type}: ${text}`);
  });

  cdpSession.on('Log.entryAdded', (event) => {
    consoleLogs.push({
      type: event.entry.level,
      text: event.entry.text,
      timestamp: new Date(),
    });
    console.log(`[Webview Log] ${event.entry.level}: ${event.entry.text}`);
  });

  cdpSession.on('Network.requestWillBeSent', (event) => {
    networkRequests.push({
      url: event.request.url,
      method: event.request.method,
      timestamp: new Date(),
    });
  });

  return {
    browser,
    session: {
      page: webviewPage,
      cdpSession,
      consoleLogs,
      networkRequests,
    },
  };
}

export async function setupExtensionTests(options?: {
  workspaceRoot?: string;
  debugPort?: number;
}) {
  const extensionPath = path.resolve(process.cwd());
  const workspaceRoot = options?.workspaceRoot || path.join(process.cwd(), 'tests', 'sandbox');
  const debugPort = options?.debugPort || 9222;
  const userDataDir = path.join(process.cwd(), '.vscode-test-user-data');

  // Ensure workspace exists
  await fs.mkdir(workspaceRoot, { recursive: true });

  // Clean user data directory for fresh test
  try {
    await fs.rm(userDataDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore if doesn't exist
  }

  console.log('[fixture] Setting up extension test environment...');

  // Launch VSCode
  const vscode = await launchVSCode({
    extensionPath,
    workspaceRoot,
    debugPort,
    userDataDir,
  });

  // Connect to webview
  const { browser, session } = await connectToWebview(vscode.cdpUrl);

  sharedContext = {
    vscode,
    webview: session,
    browser,
  };

  return sharedContext;
}

export async function teardownExtensionTests() {
  if (!sharedContext) return;

  console.log('[fixture] Tearing down extension test environment...');

  try {
    await sharedContext.browser.close();
  } catch (e) {
    console.error('[fixture] Error closing browser:', e);
  }

  // Kill VSCode process
  sharedContext.vscode.process.kill('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 2000));

  if (!sharedContext.vscode.process.killed) {
    console.log('[fixture] Force killing VSCode process');
    sharedContext.vscode.process.kill('SIGKILL');
  }

  sharedContext = null;
}

export function getExtensionContext(): ExtensionTestContext {
  if (!sharedContext) {
    throw new Error('Extension test context not initialized. Call setupExtensionTests first.');
  }
  return sharedContext;
}

// Helper functions for tests
export async function executeCommand(command: string, ...args: any[]) {
  const ctx = getExtensionContext();
  const result = await ctx.webview.cdpSession.send('Runtime.evaluate', {
    expression: `vscode.commands.executeCommand('${command}', ${JSON.stringify(args).slice(1, -1)})`,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result.value;
}

export async function sendMessageToWebview(message: any) {
  const ctx = getExtensionContext();
  await ctx.webview.cdpSession.send('Runtime.evaluate', {
    expression: `window.postMessage(${JSON.stringify(message)}, '*')`,
    returnByValue: false,
  });
}

export async function evaluateInWebview<T>(script: string): Promise<T> {
  const ctx = getExtensionContext();
  const result = await ctx.webview.cdpSession.send('Runtime.evaluate', {
    expression: script,
    awaitPromise: true,
    returnByValue: true,
  });
  
  if (result.exceptionDetails) {
    throw new Error(`Script evaluation failed: ${result.exceptionDetails.text}`);
  }
  
  return result.result.value as T;
}

export async function getExtensionLogs(): Promise<string> {
  const ctx = getExtensionContext();
  try {
    return await fs.readFile(ctx.vscode.extensionLogPath, 'utf-8');
  } catch (e) {
    return '';
  }
}

export function getWebviewLogs() {
  const ctx = getExtensionContext();
  return ctx.webview.consoleLogs;
}

export function getNetworkRequests() {
  const ctx = getExtensionContext();
  return ctx.webview.networkRequests;
}

// Vitest setup helpers
export function useExtensionFixture(options?: Parameters<typeof setupExtensionTests>[0]) {
  beforeAll(async () => {
    await setupExtensionTests(options);
  }, 60000); // 60s timeout for VSCode launch

  afterAll(async () => {
    await teardownExtensionTests();
  });

  return {
    getContext: getExtensionContext,
    executeCommand,
    sendMessageToWebview,
    evaluateInWebview,
    getExtensionLogs,
    getWebviewLogs,
    getNetworkRequests,
  };
}
