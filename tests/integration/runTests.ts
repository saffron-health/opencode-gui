#!/usr/bin/env tsx
/**
 * Test runner for VSCode integration tests
 * This launches VSCode and runs the tests inside it
 */

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    // When compiled, __dirname is out/tests/integration
    // So we need to go up 3 levels to get to project root
    const projectRoot = path.resolve(__dirname, '../../..');
    const extensionDevelopmentPath = projectRoot;
    const extensionTestsPath = path.join(projectRoot, 'out/tests/integration/suite/index');

    const launchArgs = [
      '--disable-extensions', // Disable other extensions
      '--disable-workspace-trust',
    ];

    // Add CDP port if specified
    if (process.env.CDP_PORT) {
      launchArgs.push(`--remote-debugging-port=${process.env.CDP_PORT}`);
    }

    // Strip ELECTRON_RUN_AS_NODE so the launched VS Code runs as
    // Electron (not plain Node). This env var is set when launching
    // from a VS Code integrated terminal.
    delete process.env.ELECTRON_RUN_AS_NODE;

    // Download and run VS Code tests
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs,
      // Set this to run in headed mode when interactive (not in CI)
      version: process.env.VSCODE_VERSION || 'stable',
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
