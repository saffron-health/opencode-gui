# Tool Calls Support

## Research Summary

### OpenCode SDK Message Parts

The OpenCode SDK (`@opencode-ai/sdk@0.15.18`) returns messages with a `parts` array. Each part can be one of several types:

```typescript
export type Part = 
  | TextPart 
  | ReasoningPart 
  | FilePart 
  | ToolPart 
  | StepStartPart 
  | StepFinishPart 
  | SnapshotPart 
  | PatchPart 
  | AgentPart 
  | RetryPart;
```

### Tool Part Structure

The most important type for this task is `ToolPart`:

```typescript
export type ToolPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: "tool";
  callID: string;
  tool: string;  // Tool name
  state: ToolState;
  metadata?: { [key: string]: unknown };
};

export type ToolState = 
  | ToolStatePending    // { status: "pending" }
  | ToolStateRunning    // { status: "running", input, title?, metadata?, time }
  | ToolStateCompleted  // { status: "completed", input, output, title, metadata, time, attachments? }
  | ToolStateError;     // { status: "error", input, error, metadata?, time }
```

### Other Relevant Parts

- **ReasoningPart** (`type: "reasoning"`): Contains the model's thinking/reasoning process (like Claude's thinking blocks)
- **FilePart** (`type: "file"`): File attachments
- **StepStartPart** / **StepFinishPart**: Delineate agentic steps
- **PatchPart** (`type: "patch"`): File changes/diffs

### Current Implementation

The current code in `OpenCodeViewProvider.ts` only extracts `text` parts:

```typescript
private _extractResponseText(response: { parts: Array<{ type: string; text?: string }> }): string {
  if (response?.parts && Array.isArray(response.parts)) {
    return response.parts
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text)
      .join('\n');
  }
  return 'No response received';
}
```

This means **tool calls are already happening** but **not being displayed** to the user!

## Implementation Plan

### 1. Update Message Interface

Extend the `Message` interface in `App.tsx` to support different part types:

```typescript
interface Message {
  id: string;
  type: 'user' | 'assistant';
  parts: MessagePart[];
}

interface MessagePart {
  id: string;
  type: 'text' | 'reasoning' | 'tool' | 'file' | 'step-start' | 'step-finish';
  // Type-specific fields
  text?: string;
  tool?: string;
  toolState?: ToolState;
  // ... etc
}
```

### 2. Update OpenCodeViewProvider

Change `_extractResponseText` to send all parts to the webview:

```typescript
private _sendResponse(response: { parts: Part[] }) {
  this._sendMessage({
    type: 'response',
    parts: response.parts
  });
}
```

### 3. Update UI Components

Create React components to render different part types:

- `TextPartView`: Plain text (current default)
- `ToolPartView`: Collapsible tool call with:
  - Tool name
  - Status indicator (pending/running/completed/error)
  - Input parameters (collapsible)
  - Output/result (for completed state)
  - Error message (for error state)
- `ReasoningPartView`: Similar to thinking blocks (already have this pattern)
- `FilePartView`: File attachments display

### 4. Styling

Tool calls should be styled as collapsible `<details>` blocks similar to thinking indicators, but with different visual treatment:

- Icon for tool type
- Status badge (running/completed/error)
- Collapsible input/output sections
- Monospace font for tool parameters and results

## Progress

### Completed
- ✅ Researched OpenCode SDK message part types
- ✅ Confirmed tool calls are already being made by the backend
- ✅ Identified that tool parts are being filtered out in display
- ✅ Created implementation plan
- ✅ Updated TypeScript interfaces for messages and parts in `App.tsx`
- ✅ Modified `OpenCodeViewProvider.ts` to pass all parts to webview
- ✅ Created UI components for rendering different part types:
  - `renderToolPart()`: Displays tool calls with status, input, output, and errors
  - `renderMessagePart()`: Router for different part types
  - `reasoning-block`: Component for displaying reasoning/thinking parts
- ✅ Added comprehensive CSS styling for tool calls and reasoning blocks
- ✅ Build successful with no errors

### Implementation Details

**Files Modified:**
1. `src/webview/App.tsx`:
   - Added `ToolState` and `MessagePart` interfaces
   - Updated `Message` interface to support both legacy `text` and new `parts` fields
   - Created `renderToolPart()` to display tool calls as collapsible blocks
   - Created `renderMessagePart()` to handle different part types
   - Updated message rendering to use parts when available

2. `src/OpenCodeViewProvider.ts`:
   - Modified `_handleSendPrompt()` to include `parts` in response message
   - Kept `_extractResponseText()` for backward compatibility

3. `src/webview/App.css`:
   - Added `.tool-call` styles for tool call display
   - Added `.reasoning-block` styles for reasoning/thinking display
   - Added `.message-text` styles for text parts
   - Styled tool status badges, input/output sections, and error states

### What Works
- Tool calls now display as collapsible details blocks
- Shows tool name, status icon, and status badge
- Displays input parameters as formatted JSON
- Shows output for completed tools
- Shows errors for failed tools
- Reasoning blocks display as collapsible sections
- Text parts render normally
- Backward compatible with messages that only have `text` field

### Important Discovery

**Tool calls are compacted by default in OpenCode's persisted message history.**

The OpenCode SDK's `session.messages()` endpoint returns compacted history (step-start, text, step-finish) without individual tool call details. Tool calls are emitted in real-time via the SSE (Server-Sent Events) stream during execution, but are not persisted in the message parts by default.

This is by design - tool calls are considered operational telemetry and are compacted into steps for storage efficiency.

**Current Implementation:**
- Shows "🔧 Using tools..." indicator when step-start appears
- This lets users know tools were used during that step
- The actual tool call details (input/output) are not available in the persisted history

### Next Steps (Optional Enhancements)
1. **Implement SSE streaming** to show real-time tool calls as they execute:
   - Subscribe to session SSE events when sending a prompt
   - Listen for tool-call events and display them live
   - Close stream when step finishes
2. Add syntax highlighting for JSON in tool inputs/outputs
3. Add file part rendering (currently not implemented)
4. Investigate if newer OpenCode versions have a config option to persist tool calls in history

## Technical Notes

- The SDK already provides proper typing for all part types
- No changes needed to OpenCodeService.ts - it already returns the full parts array
- Main work is in OpenCodeViewProvider.ts and App.tsx
- Should maintain backward compatibility with text-only messages
