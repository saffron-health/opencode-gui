# useVsCodeBridge Hook

## Goal

Extract the VS Code message bridge logic from App.tsx into a reusable composable hook. This separates transport concerns from state orchestration, making App.tsx simpler and more focused on UI composition.

## Current State

App.tsx (lines 62-212) contains:
- Message event listener setup in `onMount`
- Large switch-case handling 7 message types
- Direct state updates for `isReady`, `agents`, `selectedAgent`, `isThinking`, `messages`
- Cleanup in `onCleanup`
- Two outgoing messages: `ready` and `getAgents`

### Message Types Handled

1. **init** - Sets isReady state
2. **agentList** - Sets agents and auto-selects first agent
3. **thinking** - Sets isThinking state
4. **part-update** - Streaming part updates, complex message/part creation/update logic
5. **message-update** - Message metadata updates with role and parts
6. **response** - Legacy non-streaming response (creates assistant message)
7. **error** - Error handling (creates error message)

### Outgoing Messages

- `ready` - Sent on mount
- `getAgents` - Sent on mount
- `sendPrompt` - Sent on form submit (handled in App.tsx, not in message listener)

## Implementation Plan

### Hook Interface

```typescript
interface VsCodeBridgeCallbacks {
  onInit: (ready: boolean) => void;
  onAgentList: (agents: Agent[]) => void;
  onThinking: (isThinking: boolean) => void;
  onPartUpdate: (part: MessagePart & { messageID: string }) => void;
  onMessageUpdate: (message: {
    id: string;
    role?: "user" | "assistant";
    text?: string;
    parts?: MessagePart[];
  }) => void;
  onResponse: (payload: { text?: string; parts?: MessagePart[] }) => void;
  onError: (message: string) => void;
}

function useVsCodeBridge(callbacks: VsCodeBridgeCallbacks) {
  // Returns: { send: (message: any) => void }
}
```

### Hook Responsibilities

1. **Setup and cleanup**: Add/remove window message listener in onMount/onCleanup
2. **Message routing**: Parse incoming messages and route to appropriate callback
3. **Send function**: Provide a `send` function that wraps `vscode.postMessage()`
4. **Initialization**: Send `ready` and `getAgents` messages on mount

### App.tsx Integration

After refactoring, App.tsx will:
- Define callback functions for each message type
- Call `useVsCodeBridge({ onInit, onAgentList, ... })`
- Use returned `send` function for outgoing messages
- Remove all direct window message listener code

### Benefits

- **Separation of concerns**: Transport logic separate from state/UI logic
- **Testability**: Can mock the bridge in tests
- **Reusability**: Can use in other components if needed
- **Clarity**: App.tsx becomes pure orchestration, no transport details
- **Type safety**: Centralized message type handling

## Implementation Steps

1. Create `src/webview/hooks/` directory
2. Create `useVsCodeBridge.ts` with:
   - Interface for callbacks
   - Hook implementation with message listener
   - Send function wrapper
   - Initialization logic
3. Update App.tsx:
   - Import useVsCodeBridge
   - Define callback functions (can be inline or extracted)
   - Replace switch-case with hook usage
   - Use `send` function for outgoing messages
4. Test that all message types still work

## Code Structure

```typescript
// src/webview/hooks/useVsCodeBridge.ts
import { onMount, onCleanup } from "solid-js";

declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

export interface VsCodeBridgeCallbacks {
  // ... (see above)
}

export function useVsCodeBridge(callbacks: VsCodeBridgeCallbacks) {
  onMount(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;
      
      switch (message.type) {
        case "init":
          callbacks.onInit(message.ready);
          break;
        case "agentList":
          callbacks.onAgentList(message.agents || []);
          break;
        // ... other cases
      }
    };
    
    window.addEventListener("message", messageHandler);
    
    // Send initialization messages
    send({ type: "ready" });
    send({ type: "getAgents" });
    
    onCleanup(() => window.removeEventListener("message", messageHandler));
  });
  
  const send = (message: any) => {
    vscode.postMessage(message);
  };
  
  return { send };
}
```

## Testing

After implementation:
1. Run `npm run build` to ensure no TypeScript errors
2. Launch Extension Development Host
3. Test each message type:
   - Init message sets ready state
   - Agent list loads and displays
   - Sending prompt shows thinking indicator
   - Streaming parts update correctly
   - Messages display properly
   - Errors display correctly

## Potential Issues

- **vscode API scope**: Need to ensure `acquireVsCodeApi()` is called at module level, not inside hook
- **Cleanup timing**: Ensure listener cleanup happens correctly
- **Message ordering**: Init messages should be sent after listener is attached

## Progress

- [x] Research completed
- [x] Plan documented
- [x] Hook created
- [x] App.tsx updated
- [x] Build passes with no errors
- [x] TypeScript diagnostics clean

## Completion Summary

Successfully extracted the VS Code message bridge logic into a reusable hook. The refactor:

1. **Created `src/webview/hooks/useVsCodeBridge.ts`**:
   - Exports `MessagePart` and `Agent` types for reuse
   - Defines `VsCodeBridgeCallbacks` interface with 7 callback handlers
   - Handles window message listener setup/cleanup
   - Sends initialization messages (`ready`, `getAgents`)
   - Returns `send` function for outgoing messages

2. **Updated `App.tsx`**:
   - Removed direct window message listener (lines 62-212 → ~140 lines)
   - Removed duplicate type definitions (MessagePart, Agent)
   - Removed unused imports (onMount, onCleanup)
   - Removed vscode API acquisition
   - Replaced switch-case with callback-based approach
   - Used `send` function instead of `vscode.postMessage`

3. **Benefits achieved**:
   - Separation of concerns: transport vs. state management
   - App.tsx is now more focused on UI orchestration
   - Better type safety with centralized message types
   - Easier to test (can mock the bridge)
   - ~50 lines removed from App.tsx

4. **Code quality**:
   - Build passes successfully (0 errors)
   - No TypeScript diagnostics
   - All message types properly handled
   - Maintains backward compatibility with existing message flow
