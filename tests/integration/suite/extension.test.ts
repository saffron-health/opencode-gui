/**
 * Integration tests that run INSIDE VSCode
 * These tests have access to the full VSCode API
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('OpenCode Extension Integration Tests', () => {
  vscode.window.showInformationMessage('Start integration tests.');

  test('Extension should be activated', async () => {
    // Get the extension
    const extension = vscode.extensions.getExtension('TanishqKancharla.opencode-vscode');
    assert.ok(extension, 'Extension should be installed');
    
    // Activate if not already active
    if (!extension.isActive) {
      await extension.activate();
    }
    
    assert.ok(extension.isActive, 'Extension should be active');
  });

  test('OpenCode command should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('opencode.addSelectionToPrompt'),
      'opencode.addSelectionToPrompt command should be registered'
    );
  });

  test('OpenCode view should be available', async () => {
    // Try to focus the OpenCode view
    await vscode.commands.executeCommand('workbench.view.extension.opencode');
    
    // Give it a moment to open
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // We can't easily check if the view is visible, but the command should execute without error
    assert.ok(true, 'OpenCode view command executed');
  });

  test('Should be able to execute addSelectionToPrompt command', async () => {
    // Create a test document
    const doc = await vscode.workspace.openTextDocument({
      content: 'test content',
      language: 'plaintext',
    });
    
    await vscode.window.showTextDocument(doc);
    
    // Execute the command
    await vscode.commands.executeCommand('opencode.addSelectionToPrompt');
    
    // Command should complete without error
    assert.ok(true, 'Command executed successfully');
  });
});
