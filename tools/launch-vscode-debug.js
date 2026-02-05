#!/usr/bin/env node
/*
 Launches VS Code as a fresh instance with a dedicated user-data-dir and
 opens the Chromium DevTools Protocol (CDP) port for Playwright to attach.

 Usage: pnpm dev:debug

 Then, in a second terminal: pnpm run dev:debug:cdp
*/

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.VSCODE_CDP_PORT ? Number(process.env.VSCODE_CDP_PORT) : 9222;

function mkUserDataDir() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cdp-'));
  return base;
}

function appExists(appPath) {
  try {
    return fs.existsSync(appPath);
  } catch {
    return false;
  }
}

function resolveDarwinExecutable() {
  // Allow explicit override
  if (process.env.VSCODE_PATH && appExists(process.env.VSCODE_PATH)) {
    return process.env.VSCODE_PATH;
  }

  // Common executable names across versions
  const candidates = [
    '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Visual Studio Code - Insiders',
    '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron',
    '/Applications/Visual Studio Code.app/Contents/MacOS/Visual Studio Code',
    '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
  ];
  for (const c of candidates) {
    if (appExists(c)) return c;
  }
  return null;
}

function launchDarwin(userDataDir, extensionPath) {
  // Launch the app binary directly instead of using `open -a`.
  // `open` often fails to propagate Electron/Chromium flags like --remote-debugging-port.
  const exe = resolveDarwinExecutable();
  if (!exe) {
    console.error('Could not find VS Code executable. Set VSCODE_PATH to the app binary under *.app/Contents/MacOS/.');
    process.exit(1);
  }

  const args = [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${PORT}`,
    `--extensionDevelopmentPath=${extensionPath}`,
    '--new-window',
  ];

  console.log(`Launching ${exe} with CDP on ${PORT} and user-data-dir ${userDataDir}`);
  const child = spawn(exe, args, { stdio: 'inherit' });
  child.on('error', (err) => console.error('Failed to launch VS Code:', err));
}

function resolveCodeExecutableLinux() {
  const candidates = [
    '/usr/bin/code-insiders',
    '/usr/local/bin/code-insiders',
    '/usr/bin/code',
    '/usr/local/bin/code',
  ];
  for (const c of candidates) {
    if (appExists(c)) return c;
  }
  return 'code';
}

function launchLinux(userDataDir, extensionPath) {
  const exe = resolveCodeExecutableLinux();
  const args = [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${PORT}`,
    `--extensionDevelopmentPath=${extensionPath}`,
    '--new-window',
  ];
  console.log(`Launching ${exe} with CDP on ${PORT} and user-data-dir ${userDataDir}`);
  const child = spawn(exe, args, { stdio: 'inherit' });
  child.on('error', (err) => console.error('Failed to launch VS Code:', err));
}

function launchWindows(userDataDir, extensionPath) {
  const candidates = [
    process.env['VSCODE_PATH'],
    'C:/Program Files/Microsoft VS Code Insiders/Code - Insiders.exe',
    'C:/Program Files/Microsoft VS Code/Code.exe',
    'C:/Users/' + os.userInfo().username + '/AppData/Local/Programs/Microsoft VS Code Insiders/Code - Insiders.exe',
    'C:/Users/' + os.userInfo().username + '/AppData/Local/Programs/Microsoft VS Code/Code.exe',
  ].filter(Boolean);
  let exe = candidates.find(appExists);
  if (!exe) exe = 'Code.exe';
  const args = [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${PORT}`,
    `--extensionDevelopmentPath=${extensionPath}`,
    '--new-window',
  ];
  console.log(`Launching ${exe} with CDP on ${PORT} and user-data-dir ${userDataDir}`);
  spawn(exe, args, { stdio: 'inherit', shell: true });
}

function main() {
  const userDataDir = mkUserDataDir();
  const extensionPath = process.cwd();
  const platform = process.platform;

  if (platform === 'darwin') launchDarwin(userDataDir, extensionPath);
  else if (platform === 'linux') launchLinux(userDataDir, extensionPath);
  else if (platform === 'win32') launchWindows(userDataDir, extensionPath);
  else {
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
  }

  console.log('\nWaiting for CDP to be available at http://localhost:' + PORT + ' ...');
  const start = Date.now();
  const deadline = start + 30000;

  (async function waitForCDP() {
    while (Date.now() < deadline) {
      try {
        // Node 18+ has fetch built-in
        const res = await fetch(`http://localhost:${PORT}/json/version`);
        if (res.ok) {
          const data = await res.json();
          console.log('CDP is up:', data.Browser || '(unknown)');
          console.log('\nNext: run "pnpm run dev:debug:cdp" to attach Playwright.');
          return;
        }
      } catch (_) {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.warn('CDP not reachable yet, but VS Code should be launching. You can still try attaching.');
  })();
}

main();
