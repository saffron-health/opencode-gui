#!/usr/bin/env tsx

import { Command } from 'commander';
import { spawn, execSync, type ChildProcess } from 'child_process';
import { chromium } from '@playwright/test';
import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath } from '@vscode/test-electron';
import * as path from 'path';
import * as fs from 'fs/promises';

const TMUX_SESSION = 'opencode-debug';

const program = new Command();

program
  .name('debug-extension')
  .description('Launch VSCode with the OpenCode extension in a background tmux session')
  .option('-w, --workspace <path>', 'Workspace to open', process.cwd())
  .option('-p, --port <number>', 'CDP port', '9222')
  .option('--clean', 'Clean user data before launch')
  .option('--attach', 'Attach Playwright to the webview')
  .option('--logs', 'Stream extension logs')
  .option('--stop', 'Stop the running debug session')
  .option('--foreground', 'Run in foreground (used internally by tmux)')
  .parse();

const options = program.opts();

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
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`CDP port ${port} not ready within ${timeout}ms`);
}

async function launchVSCode() {
  const extensionPath = path.resolve(process.cwd());
  const workspaceRoot = path.resolve(options.workspace);
  const debugPort = parseInt(options.port);
  const userDataDir = path.join(process.cwd(), '.vscode-test-debug');

  if (options.clean) {
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log('Downloading VSCode...');
  const vscodeExecutablePath = await downloadAndUnzipVSCode();
  const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);

  const launchArgs = [
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-web-security',
    '--disable-site-isolation-trials',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-updates',
    '--disable-workspace-trust',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-extensions',
    `--extensionDevelopmentPath=${extensionPath}`,
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--wait',
    workspaceRoot,
  ];

  console.log('Starting VSCode...');
  const vscodeProcess = spawn(cliPath, launchArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, VSCODE_LOG_LEVEL: 'info' },
  });

  vscodeProcess.stderr?.on('data', (data) => {
    const text = data.toString().trim();
    if (text && !text.includes('remote-debugging-port')) {
      console.error(`[vscode] ${text}`);
    }
  });

  vscodeProcess.on('exit', (code) => {
    console.log(`VSCode exited (code ${code})`);
    process.exit(code || 0);
  });

  console.log('Waiting for CDP...');
  await waitForPort(debugPort, 60000);
  console.log(`Ready — CDP at http://localhost:${debugPort}`);

  return { vscodeProcess, cdpUrl: `http://localhost:${debugPort}`, userDataDir };
}

async function streamExtensionLogs(userDataDir: string) {
  const logPath = path.join(userDataDir, 'logs', 'window1', 'exthost', 'output_logging_opencode');
  let lastSize = 0;

  const interval = setInterval(async () => {
    try {
      const stats = await fs.stat(logPath);
      if (stats.size > lastSize) {
        const content = await fs.readFile(logPath, 'utf-8');
        process.stdout.write(content.slice(lastSize));
        lastSize = stats.size;
      }
    } catch {
      // Log file doesn't exist yet
    }
  }, 500);

  return () => clearInterval(interval);
}

async function attachToWebview(cdpUrl: string) {
  const browser = await chromium.connectOverCDP(cdpUrl);
  let webviewPage = null;

  for (let i = 0; i < 20 && !webviewPage; i++) {
    for (const ctx of browser.contexts()) {
      for (const page of ctx.pages()) {
        if (page.url().includes('vscode-webview') && page.url().includes('opencode')) {
          webviewPage = page;
          break;
        }
      }
      if (webviewPage) break;
    }
    if (!webviewPage) {
      console.log(`Waiting for webview (${i + 1}/20)...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (!webviewPage) {
    console.error('Could not find OpenCode webview');
    return null;
  }

  console.log(`Found webview: ${webviewPage.url()}`);
  const cdpSession = await webviewPage.context().newCDPSession(webviewPage);
  await cdpSession.send('Runtime.enable');
  await cdpSession.send('Log.enable');

  cdpSession.on('Runtime.consoleAPICalled', (event) => {
    const args = event.args.map(arg => arg.value ?? arg.description).join(' ');
    console.log(`[${event.type}] ${args}`);
  });

  cdpSession.on('Log.entryAdded', (event) => {
    console.log(`[${event.entry.level}] ${event.entry.text}`);
  });

  await webviewPage.pause();
  return browser;
}

async function runForeground() {
  const session = await launchVSCode();

  let stopLogs: (() => void) | null = null;
  if (options.logs) {
    stopLogs = await streamExtensionLogs(session.userDataDir);
  }

  let browser = null;
  if (options.attach) {
    browser = await attachToWebview(session.cdpUrl);
  }

  const cleanup = async () => {
    console.log('Shutting down...');
    if (stopLogs) stopLogs();
    if (browser) await browser.close().catch(() => {});
    session.vscodeProcess.kill('SIGTERM');
    // Also kill the Electron process (the CLI spawns it as a separate process)
    try {
      execSync(`pkill -f "extensionDevelopmentPath=${path.resolve(process.cwd())}"`, { stdio: 'ignore' });
    } catch { /* already dead */ }
    await new Promise(resolve => setTimeout(resolve, 2000));
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGHUP', cleanup);
  await new Promise(() => {});
}

async function main() {
  // --stop: kill the background session
  if (options.stop) {
    if (!tmuxSessionExists()) {
      console.log('No debug session running.');
      return;
    }
    // Send Ctrl+C so the foreground process runs cleanup (kills VS Code)
    execSync(`tmux send-keys -t ${TMUX_SESSION} C-c`, { stdio: 'inherit' });
    // Wait for cleanup to finish, then kill the tmux session
    await new Promise(resolve => setTimeout(resolve, 4000));
    if (tmuxSessionExists()) {
      execSync(`tmux kill-session -t ${TMUX_SESSION} 2>/dev/null`, { stdio: 'inherit' });
    }
    console.log('Session stopped.');
    return;
  }

  // --foreground: run directly (used by tmux)
  if (options.foreground) {
    await runForeground();
    return;
  }

  // Default: launch in tmux background
  if (tmuxSessionExists()) {
    console.log(`Session "${TMUX_SESSION}" already running.`);
    console.log(`  Attach: tmux attach -t ${TMUX_SESSION}`);
    console.log(`  Stop:   pnpm debug:extension --stop`);
    process.exit(1);
  }

  const args = process.argv.slice(2).concat('--foreground');
  const cmd = `cd '${process.cwd()}' && npx tsx scripts/debug-extension.ts ${args.join(' ')}`;
  execSync(`tmux new-session -d -s ${TMUX_SESSION} '${cmd}'`);

  // Wait for it to be ready
  const port = parseInt(options.port);
  try {
    await waitForPort(port, 60000);
    console.log(`Debug session running in tmux "${TMUX_SESSION}"`);
    console.log(`  CDP:    http://localhost:${port}`);
    console.log(`  Attach: tmux attach -t ${TMUX_SESSION}`);
    console.log(`  Stop:   pnpm debug:extension --stop`);
  } catch {
    console.error('Timed out waiting for VSCode to start. Check: tmux attach -t ' + TMUX_SESSION);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
