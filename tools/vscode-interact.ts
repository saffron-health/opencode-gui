#!/usr/bin/env ts-node
import { chromium, _electron as electron, type Frame, ElectronApplication, Page } from 'playwright';

/**
 * Interact with the OpenCode webview
 * 
 * Usage:
 * 1. Launch VSCode with CDP: pnpm dev:debug
 * 2. Attach via CDP: pnpm run dev:debug:cdp
 *
 * Alternatively, launch via Electron directly:
 *   pnpm run dev:debug:electron
 */

async function findOpenCodeFrame(workbench: Page): Promise<Frame | null> {
  const frames = workbench.frames();
  
  for (const frame of frames) {
    const url = frame.url();
    const name = frame.name();
    
    // Look for the opencode extension ID in the URL
    if (url.includes('extensionId=TanishqKancharla.opencode-vscode')) {
      console.log(`  Found OpenCode parent frame: ${url.substring(0, 100)}...`);
      const childFrames = frame.childFrames();
      console.log(`  Child frames: ${childFrames.length}`);
      if (childFrames.length > 0) {
        return childFrames[0]; // Return the actual content frame
      }
    }
  }
  
  return null;
}

async function attachViaCDP() {
  console.log('Connecting to VSCode on port 9222...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const allPages = browser.contexts().flatMap((c) => c.pages());
  const workbench = allPages.find((p) => p.url().includes('vscode-file://'));
  if (!workbench) throw new Error('VSCode workbench not found');
  console.log('✅ Connected to VSCode');
  await runInteraction(workbench);
  await browser.close();
}

function resolveVSCodeExecutable(): string | undefined {
  const darwinCandidates = [
    '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron',
    '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
  ];
  const linuxCandidates = [
    '/usr/bin/code-insiders',
    '/usr/local/bin/code-insiders',
    '/usr/bin/code',
    '/usr/local/bin/code',
  ];
  const winCandidates = [
    process.env.VSCODE_PATH,
    'C:/Program Files/Microsoft VS Code Insiders/Code - Insiders.exe',
    'C:/Program Files/Microsoft VS Code/Code.exe',
    `C:/Users/${process.env.USERNAME}/AppData/Local/Programs/Microsoft VS Code Insiders/Code - Insiders.exe`,
    `C:/Users/${process.env.USERNAME}/AppData/Local/Programs/Microsoft VS Code/Code.exe`,
  ].filter(Boolean) as string[];

  const fs = require('fs');
  const candidates = process.platform === 'darwin' ? darwinCandidates : process.platform === 'linux' ? linuxCandidates : winCandidates;
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  return undefined;
}

async function launchViaElectron(): Promise<{ app: ElectronApplication; page: Page }> {
  const exe = resolveVSCodeExecutable();
  if (!exe) throw new Error('Could not resolve VS Code executable path');
  const os = await import('os');
  const fs = await import('fs');
  const path = await import('path');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-electron-'));
  console.log('Launching VS Code Electron:', exe);
  const app = await electron.launch({
    executablePath: exe,
    args: [
      `--user-data-dir=${userDataDir}`,
      `--extensionDevelopmentPath=${process.cwd()}`,
      '--new-window',
    ],
  });
  const page = await app.firstWindow();
  // Give workbench some time to render
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

async function runInteraction(workbench: Page) {
  // Open OpenCode panel
  console.log('Opening OpenCode panel...');
  await workbench.locator('a.action-label[aria-label="OpenCode"]').click({ timeout: 10000 });
  await workbench.waitForTimeout(1500);

  // Try robust nested iframe selection using frameLocator
  const candidate = workbench
    .frameLocator('iframe[src*="vscode-webview:"]')
    .frameLocator('iframe[src*="extensionId=TanishqKancharla.opencode-vscode"]');

  let usedCandidate = false;
  try {
    await candidate.locator('body').waitFor({ state: 'visible', timeout: 8000 });
    usedCandidate = true;
  } catch {}

  let opencodeFrame: Frame | null = null;
  if (!usedCandidate) opencodeFrame = await findOpenCodeFrame(workbench);
  if (!usedCandidate && !opencodeFrame) throw new Error('Could not find OpenCode webview frame');
  console.log('✅ Found OpenCode webview');

  // Interact with the webview
  console.log('\n📋 Getting webview snapshot...');
  const bodyText = usedCandidate
    ? await candidate.locator('body').textContent()
    : await opencodeFrame!.locator('body').textContent();
  console.log('Body text:', bodyText?.substring(0, 300));

  console.log('\n🔍 Looking for UI elements...');
  const buttons = usedCandidate
    ? await candidate.locator('button').count()
    : await opencodeFrame!.locator('button').count();
  console.log(`Found ${buttons} buttons`);
  for (let i = 0; i < Math.min(buttons, 5); i++) {
    const btnLoc = usedCandidate ? candidate.locator('button').nth(i) : opencodeFrame!.locator('button').nth(i);
    const text = await btnLoc.textContent().catch(() => '(no text)');
    console.log(`  Button ${i}: ${text}`);
  }

  // Take screenshot
  const fs = await import('fs');
  const path = await import('path');
  const outDir = path.join('tmp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  console.log('\n📸 Taking screenshot...');
  await workbench.screenshot({ path: path.join(outDir, 'opencode-webview.png'), fullPage: true });
  console.log('Saved to tmp/opencode-webview.png');
}

async function main() {
  const modeArg = process.argv.find((a) => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : 'cdp';
  if (mode === 'electron') {
    const { app, page } = await launchViaElectron();
    try {
      await runInteraction(page);
    } finally {
      await app.close();
    }
  } else {
    await attachViaCDP();
  }
  console.log('\n✅ Done');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
