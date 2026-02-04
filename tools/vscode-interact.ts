#!/usr/bin/env ts-node
import { chromium, type Frame } from 'playwright';

/**
 * Interact with the OpenCode webview
 * 
 * Usage:
 * 1. Launch VSCode: pnpm dev:debug
 * 2. Run: pnpm exec tsx tools/vscode-interact.ts
 */

async function findOpenCodeFrame(workbench: any): Promise<Frame | null> {
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

async function main() {
  console.log('Connecting to VSCode on port 9222...');
  
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const allPages = browser.contexts().flatMap(c => c.pages());
  const workbench = allPages.find(p => p.url().includes('vscode-file://'));
  
  if (!workbench) {
    console.error('❌ VSCode workbench not found');
    await browser.close();
    return;
  }
  
  console.log('✅ Connected to VSCode');
  
  // Open OpenCode panel
  console.log('Opening OpenCode panel...');
  await workbench.locator('a.action-label[aria-label="OpenCode"]').click({ timeout: 5000 });
  await new Promise(r => setTimeout(r, 3000));
  
  // Find the OpenCode webview
  const opencodeFrame = await findOpenCodeFrame(workbench);
  
  if (!opencodeFrame) {
    console.error('❌ Could not find OpenCode webview frame');
    await browser.close();
    return;
  }
  
  console.log('✅ Found OpenCode webview');
  
  // Interact with the webview
  console.log('\n📋 Getting webview snapshot...');
  const bodyText = await opencodeFrame.locator('body').textContent();
  console.log('Body text:', bodyText?.substring(0, 300));
  
  // Try to find specific elements
  console.log('\n🔍 Looking for UI elements...');
  const buttons = await opencodeFrame.locator('button').count();
  console.log(`Found ${buttons} buttons`);
  
  for (let i = 0; i < Math.min(buttons, 5); i++) {
    const button = opencodeFrame.locator('button').nth(i);
    const text = await button.textContent().catch(() => '(no text)');
    console.log(`  Button ${i}: ${text}`);
  }
  
  // Take screenshot
  console.log('\n📸 Taking screenshot...');
  await workbench.screenshot({ path: 'tmp/opencode-webview.png', fullPage: true });
  console.log('Saved to tmp/opencode-webview.png');
  
  await browser.close();
  console.log('\n✅ Done');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
