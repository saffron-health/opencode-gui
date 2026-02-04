#!/usr/bin/env tsx
import { chromium, type Browser, type Page, type Frame } from 'playwright';

/**
 * Playwriter-style CLI for VSCode extension webview automation
 * 
 * Usage:
 *   vscode-playwriter exec <code>
 *   vscode-playwriter screenshot
 *   vscode-playwriter open
 * 
 * Available in exec context:
 *   - page: The VSCode workbench page
 *   - webview: The OpenCode webview frame
 *   - context, browser, console, etc.
 */

const CDP_PORT = 9222;

async function findOpenCodeFrame(workbench: Page): Promise<Frame | null> {
  const frames = workbench.frames();
  
  for (const frame of frames) {
    const url = frame.url();
    if (url.includes('extensionId=TanishqKancharla.opencode-vscode')) {
      const childFrames = frame.childFrames();
      if (childFrames.length > 0) {
        return childFrames[0];
      }
    }
  }
  
  return null;
}

async function connectToVSCode(): Promise<{ browser: Browser; workbench: Page; webview: Frame }> {
  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
  
  const allPages = browser.contexts().flatMap(c => c.pages());
  const workbench = allPages.find(p => p.url().includes('vscode-file://'));
  
  if (!workbench) {
    throw new Error('VSCode workbench not found. Is VSCode running with --remote-debugging-port=9222?');
  }
  
  // Check if OpenCode panel is already open
  let webview = await findOpenCodeFrame(workbench);
  
  if (!webview) {
    // Open the OpenCode panel
    await workbench.locator('a.action-label[aria-label="OpenCode"]').click({ timeout: 5000 });
    await new Promise(r => setTimeout(r, 3000));
    
    webview = await findOpenCodeFrame(workbench);
    
    if (!webview) {
      throw new Error('Could not find OpenCode webview. Is the extension loaded?');
    }
  }
  
  // Give the webview a moment to fully initialize
  await new Promise(r => setTimeout(r, 500));
  
  return { browser, workbench, webview };
}

async function runOpen(): Promise<void> {
  console.log('Connecting to VSCode...');
  
  try {
    const { browser, webview } = await connectToVSCode();
    
    console.log('✅ VSCode connected and OpenCode panel opened');
    
    // Get a preview of the webview
    const bodyText = await webview.locator('body').textContent();
    console.log('\nWebview content preview:');
    console.log(bodyText?.substring(0, 200));
    
    await browser.close();
  } catch (error) {
    if ((error as Error).message.includes('ECONNREFUSED')) {
      console.error('❌ Could not connect to VSCode on port 9222.');
      console.error('   Run: pnpm dev:debug');
      process.exit(1);
    }
    throw error;
  }
}

async function runExec(code: string): Promise<void> {
  const { browser, workbench, webview } = await connectToVSCode();
  
  try {
    const context = workbench.context();
    
    const helpers = {
      page: workbench,
      webview,
      context,
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
    
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(...Object.keys(helpers), code);
    
    const result = await fn(...Object.values(helpers));
    if (result !== undefined) {
      console.log(
        typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      );
    }
  } finally {
    await browser.close();
  }
}

async function runScreenshot(): Promise<void> {
  const { browser, workbench, webview } = await connectToVSCode();
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    const screenshotsDir = 'tmp/vscode-screenshots';
    const fs = await import('node:fs/promises');
    await fs.mkdir(screenshotsDir, { recursive: true });
    
    const workbenchPath = `${screenshotsDir}/workbench-${timestamp}.png`;
    const webviewPath = `${screenshotsDir}/webview-${timestamp}.png`;
    
    await workbench.screenshot({ path: workbenchPath });
    console.log(`Workbench screenshot: ${workbenchPath}`);
    
    // Try to screenshot the webview content
    try {
      await webview.locator('body').screenshot({ path: webviewPath });
      console.log(`Webview screenshot: ${webviewPath}`);
    } catch (error) {
      console.log('⚠️  Could not screenshot webview content');
    }
  } finally {
    await browser.close();
  }
}

function printUsage(): void {
  console.log(`Usage: vscode-playwriter <command>

Commands:
  open                 Connect to VSCode and open OpenCode panel
  exec <code>          Execute TypeScript code in the webview context
  screenshot           Take screenshots of workbench and webview

Examples:
  # Start VSCode with CDP
  pnpm dev:debug

  # Open the panel
  vscode-playwriter open

  # Execute code
  vscode-playwriter exec "return await webview.locator('button').count()"
  vscode-playwriter exec "await webview.locator('button:has-text(\"New Session\")').click()"
  vscode-playwriter exec "return await webview.locator('body').textContent()"

  # Take screenshot
  vscode-playwriter screenshot

Available in exec:
  page      - VSCode workbench page
  webview   - OpenCode webview frame
  context   - Browser context
  browser   - Browser instance
  console   - Console for logging
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  try {
    switch (command) {
      case 'open':
        await runOpen();
        break;
      
      case 'exec': {
        const code = args.slice(1).join(' ');
        if (!code) {
          console.error('Usage: vscode-playwriter exec <code>');
          process.exit(1);
        }
        await runExec(code);
        break;
      }
      
      case 'screenshot':
        await runScreenshot();
        break;
      
      case '--help':
      case '-h':
      case 'help':
        printUsage();
        break;
      
      default:
        if (command) console.error(`Unknown command: ${command}\n`);
        printUsage();
        process.exit(command ? 1 : 0);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
