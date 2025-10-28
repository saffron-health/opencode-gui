# OpenCode Config Verification

## Goal
Verify that the VSCode extension is correctly using the workspace `opencode.json` file instead of falling back to the global config.

## Current Implementation Analysis

### Config Loading Flow

1. **Extension Activation** (`src/extension.ts`):
   - Gets workspace root from `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath`
   - Passes it to `openCodeService.initialize(workspaceRoot)`

2. **Service Initialization** (`src/OpenCodeService.ts`):
   - Calls `loadWorkspaceConfig(workspaceRoot)` to attempt loading workspace config
   - Passes config to `createOpencode({ config })` from `@opencode-ai/sdk`
   - Changes working directory temporarily to workspace root for spawn context

3. **Workspace Config Loading** (`loadWorkspaceConfig` method):
   - Looks for `opencode.json` in workspace root
   - Reads and parses JSON (with basic comment stripping)
   - Returns `null` if not found or on error
   - No validation that config was actually used

### Potential Issues

1. **No Verification**: The code loads workspace config but doesn't verify it was actually applied
2. **Silent Fallback**: If workspace config fails to load, it silently passes `{}` to SDK
3. **SDK Behavior**: Unknown if SDK merges workspace config or if it has its own fallback to `~/.config/opencode/opencode.json`
4. **No Logging**: No console output showing which config file was used
5. **No User Feedback**: User has no way to know if workspace config is being used

### Testing Approach

To verify workspace config is being used:
1. Add logging to show which config file was loaded
2. Verify the config values are actually applied (e.g., check model name)
3. Test with a workspace that has `opencode.json` with specific settings
4. Query the running OpenCode instance for its active config

## Implementation Plan

### 1. Add Config Verification Logging
- Log when workspace config is found/loaded
- Log the config values being passed to SDK
- Query SDK's `config.get()` API after initialization to verify

### 2. Add Visual Feedback
- Show notification when workspace config is loaded
- Optional: Add status bar item showing which config is active

### 3. Add Error Handling
- Better error messages if config is malformed
- Warn user if workspace config exists but failed to load

## Progress

### Research Phase
- ✅ Analyzed current config loading implementation
- ✅ Identified verification gaps
- ✅ Created implementation plan

### Implementation Phase ✅ COMPLETED
- ✅ Added detailed logging to show which config file is loaded
- ✅ Added config value logging for debugging
- ✅ Implemented `verifyConfig()` method to query server after initialization
- ✅ Added comparison between expected workspace config and active server config
- ✅ Improved error handling with user-visible warnings for malformed configs
- ✅ Build verified with no errors

### What Was Implemented

1. **Enhanced Config Loading Logging**:
   - Added console log when workspace config is found and loaded
   - Shows full config path and values
   - Shows clear message when no workspace config exists

2. **Server Config Verification**:
   - New `verifyConfig()` method queries OpenCode server's active config via `client.config.get()`
   - Compares workspace config values (especially `model`) with active server config
   - Logs warnings if there's a mismatch between expected and actual config

3. **Better Error Handling**:
   - Changed silent warning to error level for parse failures
   - Added user-visible warning message when `opencode.json` exists but can't be parsed
   - Preserves original behavior of returning `null` and continuing with defaults

### How It Works

When the extension starts:
1. Loads workspace `opencode.json` if present
2. Logs the config source and values to console
3. Passes config to OpenCode SDK
4. After server starts, queries server's active config
5. Verifies workspace config values match server config
6. Logs success or warnings about mismatches

Users can now check the VSCode Output panel (select "OpenCode" or "Extension Host") to see:
- Whether workspace config was found
- What config values were loaded
- Whether the config was successfully applied to the server

### Testing Phase
- Manual testing recommended: Create `opencode.json` in workspace, check console output
- Verify logs show config loading and verification
- Test with missing config to ensure graceful fallback
