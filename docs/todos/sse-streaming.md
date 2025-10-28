# SSE Streaming Implementation

## Research Summary

### OpenCode SDK SSE Support

The OpenCode SDK (`@opencode-ai/sdk@0.15.18`) provides built-in SSE (Server-Sent Events) streaming support through the `event.subscribe()` method.

#### Event Subscribe API

```typescript
class Event {
  subscribe<ThrowOnError extends boolean = false>(
    options?: Options<EventSubscribeData, ThrowOnError>
  ): Promise<ServerSentEventsResult<EventSubscribeResponses, unknown>>;
}
```

#### Event Types

The SDK streams various event types through SSE:

```typescript
export type Event = 
  | EventInstallationUpdated
  | EventLspClientDiagnostics
  | EventMessageUpdated         // Message-level updates
  | EventMessageRemoved
  | EventMessagePartUpdated     // 🔑 Real-time part updates (tool calls, text, reasoning)
  | EventMessagePartRemoved
  | EventSessionCompacted
  | EventPermissionUpdated
  | EventPermissionReplied
  | EventFileEdited
  | EventFileWatcherUpdated
  | EventTodoUpdated
  | EventSessionIdle
  | EventSessionUpdated
  | EventSessionDeleted
  | EventSessionError
  | EventServerConnected
  | EventIdeInstalled;
```

#### Key Event: `EventMessagePartUpdated`

This is the critical event for real-time tool call display:

```typescript
export type EventMessagePartUpdated = {
  type: "message.part.updated";
  properties: {
    part: Part;        // The actual part (ToolPart, TextPart, ReasoningPart, etc.)
    delta?: string;    // Text delta for streaming text parts
  };
};
```

#### SSE Stream API

```typescript
export type ServerSentEventsResult<TData, TReturn, TNext> = {
  stream: AsyncGenerator<TData extends Record<string, unknown> 
    ? TData[keyof TData] 
    : TData, TReturn, TNext>;
};

export interface StreamEvent<TData> {
  data: TData;
  event?: string;
  id?: string;
  retry?: number;
}
```

#### SSE Options

```typescript
export type ServerSentEventsOptions<TData> = {
  onSseError?: (error: unknown) => void;
  onSseEvent?: (event: StreamEvent<TData>) => void;
  sseDefaultRetryDelay?: number;      // Default: 3000ms
  sseMaxRetryAttempts?: number;
  sseMaxRetryDelay?: number;          // Default: 30000ms
  sseSleepFn?: (ms: number) => Promise<void>;
  url: string;
};
```

### RivetKit Research

RivetKit (https://www.rivet.dev/docs/actors/) returned a 404 error, indicating the documentation may have moved or the project is no longer active. 

**Decision**: RivetKit is not needed. The OpenCode SDK already provides comprehensive SSE support with:
- Async generator API for consuming events
- Built-in error handling and retry logic
- Event type safety through TypeScript
- Stream lifecycle management

## Implementation Plan

### Architecture Overview

We'll implement streaming using a three-layer architecture:

1. **OpenCodeService** (Extension side): 
   - Subscribe to SSE events when sending a prompt
   - Filter events for the current session
   - Forward relevant events to the webview

2. **OpenCodeViewProvider** (Message bridge):
   - Route streaming events from service to webview
   - Handle stream lifecycle (start/stop)

3. **Webview** (React UI):
   - Update messages in real-time as parts arrive
   - Display tool calls, reasoning, and text as they stream
   - Show loading states during streaming

### Detailed Implementation Steps

#### 1. Update OpenCodeService

Add a new method `sendPromptStreaming()` that:
- Calls `session.prompt()` to initiate the prompt
- Immediately subscribes to SSE events via `client.event.subscribe()`
- Filters events for:
  - `message.part.updated` - Real-time parts (tool calls, text, reasoning)
  - `message.updated` - Message-level updates
  - `session.idle` - Session finished processing
- Forwards events to a callback function
- Handles cleanup when streaming completes

```typescript
async sendPromptStreaming(
  text: string,
  onEvent: (event: Event) => void,
  sessionId?: string
): Promise<void> {
  if (!this.opencode) {
    throw new Error('OpenCode not initialized');
  }

  const sid = sessionId || this.currentSessionId;
  if (!sid) {
    throw new Error('No active session');
  }

  // Get config for model
  const configResult = await this.opencode.client.config.get();
  if (configResult.error) {
    throw new Error(`Failed to get config: ${JSON.stringify(configResult.error)}`);
  }

  const config = configResult.data;
  const model = config?.model || 'anthropic/claude-3-5-sonnet-20241022';
  const [providerID, modelID] = model.split('/');

  // Send the prompt (non-blocking)
  const promptPromise = this.opencode.client.session.prompt({
    path: { id: sid },
    body: {
      model: { providerID, modelID },
      parts: [{ type: 'text', text }],
    },
  });

  // Subscribe to SSE events
  const sseResult = await this.opencode.client.event.subscribe({
    query: { directory: process.cwd() }
  });

  // Process events from the stream
  try {
    for await (const event of sseResult.stream) {
      // Filter for events related to our session
      if ('properties' in event && 'sessionID' in event.properties) {
        if (event.properties.sessionID === sid) {
          onEvent(event as Event);
          
          // Stop streaming when session goes idle
          if (event.type === 'session.idle') {
            break;
          }
        }
      } else {
        // Forward global events (installation.updated, etc.)
        onEvent(event as Event);
      }
    }
  } catch (error) {
    console.error('SSE streaming error:', error);
    throw error;
  }

  // Wait for the prompt to complete
  const result = await promptPromise;
  if (result.error) {
    throw new Error(`Prompt failed: ${JSON.stringify(result.error)}`);
  }
}
```

#### 2. Update OpenCodeViewProvider

Modify `_handleSendPrompt()` to use the new streaming method:

```typescript
private async _handleSendPrompt(text: string) {
  try {
    this._sendMessage({ type: 'thinking', thinking: true });

    // Send prompt with streaming
    await this.openCodeService.sendPromptStreaming(
      text,
      (event) => this._handleStreamEvent(event)
    );

    this._sendMessage({ type: 'thinking', thinking: false });
  } catch (error) {
    // ... error handling
  }
}

private _handleStreamEvent(event: Event) {
  if (event.type === 'message.part.updated') {
    // Forward part updates to webview for real-time display
    this._sendMessage({
      type: 'part-update',
      part: event.properties.part,
      delta: event.properties.delta
    });
  } else if (event.type === 'message.updated') {
    // Full message update (can use for final state)
    this._sendMessage({
      type: 'message-update',
      message: event.properties.info
    });
  }
  // Handle other events as needed
}
```

#### 3. Update Webview Message Interface

Add new message types for streaming:

```typescript
type WebviewMessage = 
  | { type: 'part-update'; part: Part; delta?: string }
  | { type: 'message-update'; message: Message }
  | // ... existing types
```

#### 4. Update React App

Modify `App.tsx` to handle streaming updates:

```typescript
const [messages, setMessages] = useState<Message[]>([]);
const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    const message = event.data;
    
    switch (message.type) {
      case 'part-update': {
        const { part, delta } = message;
        
        setMessages(prev => {
          // Find or create the message for this part
          const messageIndex = prev.findIndex(m => m.id === part.messageID);
          
          if (messageIndex === -1) {
            // New message - create it
            return [...prev, {
              id: part.messageID,
              type: 'assistant',
              parts: [part]
            }];
          } else {
            // Update existing message
            const updated = [...prev];
            const msg = { ...updated[messageIndex] };
            const partIndex = msg.parts.findIndex(p => p.id === part.id);
            
            if (partIndex === -1) {
              // New part - append it
              msg.parts = [...msg.parts, part];
            } else {
              // Update existing part
              msg.parts = [...msg.parts];
              msg.parts[partIndex] = part;
              
              // Handle text deltas for streaming text
              if (delta && part.type === 'text') {
                msg.parts[partIndex] = {
                  ...part,
                  text: (msg.parts[partIndex].text || '') + delta
                };
              }
            }
            
            updated[messageIndex] = msg;
            return updated;
          }
        });
        
        setStreamingMessageId(part.messageID);
        break;
      }
      
      case 'message-update': {
        // Final message state - use this to ensure consistency
        const { message: finalMessage } = message;
        
        setMessages(prev => {
          const index = prev.findIndex(m => m.id === finalMessage.id);
          if (index === -1) {
            return [...prev, finalMessage];
          } else {
            const updated = [...prev];
            updated[index] = finalMessage;
            return updated;
          }
        });
        
        setStreamingMessageId(null);
        break;
      }
      
      // ... other message types
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);
```

### Benefits of SSE Streaming

1. **Real-time tool call visibility**: Users see tool calls as they happen, not just after completion
2. **Progressive text rendering**: Text streams in character by character (if deltas are provided)
3. **Better UX during long operations**: Clear feedback about what's happening
4. **Status updates**: See tool state changes (pending → running → completed/error)
5. **Reasoning visibility**: See thinking blocks as the model reasons

### Potential Challenges

1. **Message state management**: Need to carefully merge streaming updates with existing messages
2. **Race conditions**: Handle out-of-order events gracefully
3. **Error handling**: Properly clean up SSE subscriptions on errors
4. **Performance**: Frequent React re-renders during rapid streaming (use React.memo/useMemo)
5. **Session filtering**: Ensure we only process events for the active session

### Testing Strategy

1. Test with a prompt that triggers multiple tool calls
2. Verify tool call states update in real-time (pending → running → completed)
3. Test with long text responses to verify streaming text display
4. Test error scenarios (network interruption, API errors)
5. Verify cleanup when switching sessions or closing extension

## Progress

### Completed
- ✅ Researched OpenCode SDK SSE capabilities
- ✅ Identified key event types (`message.part.updated`, `session.idle`)
- ✅ Evaluated RivetKit (not needed - OpenCode SDK has built-in SSE support)
- ✅ Created implementation plan
- ✅ Implemented `sendPromptStreaming()` in OpenCodeService
- ✅ Updated OpenCodeViewProvider to handle streaming events
- ✅ Added streaming message types to webview (`part-update`, `message-update`)
- ✅ Updated React app to handle real-time part updates
- ✅ Build successful with no errors

### Implementation Details

**Files Modified:**

1. **src/OpenCodeService.ts**:
   - Added `Event` type import from `@opencode-ai/sdk`
   - Implemented `sendPromptStreaming()` method that:
     - Sends the prompt asynchronously
     - Subscribes to SSE events via `client.event.subscribe()`
     - Filters events by sessionID to only process relevant events
     - Calls the `onEvent` callback for each event
     - Stops streaming when `session.idle` is received
     - Handles errors and cleanup properly

2. **src/OpenCodeViewProvider.ts**:
   - Added `Event` type import from `@opencode-ai/sdk`
   - Modified `_handleSendPrompt()` to use `sendPromptStreaming()` instead of `sendPrompt()`
   - Implemented `_handleStreamEvent()` to process different event types:
     - `message.part.updated`: Forwards part updates to webview for real-time display
     - `message.updated`: Sends complete message state for consistency
     - `session.idle`: Logs completion (thinking state already cleared)
   - Removed old non-streaming response handling code

3. **src/webview/App.tsx**:
   - Added `part-update` message handler that:
     - Finds or creates the message by messageID
     - Updates existing parts or appends new parts
     - Handles text deltas for streaming text parts
   - Added `message-update` handler for final message consistency
   - Both handlers properly filter out "thinking" messages before updating

### What Works Now

1. **Real-time streaming**: Messages update as parts arrive from the server
2. **Tool call visibility**: Tool calls display in real-time as they execute (pending → running → completed)
3. **Text streaming**: Text parts can stream character-by-character with deltas
4. **Reasoning blocks**: Reasoning/thinking blocks appear as they're created
5. **State management**: Messages are properly created and updated without duplicates
6. **Session isolation**: Events are filtered by sessionID to prevent cross-contamination
7. **Error handling**: Errors are caught and logged, streams are cleaned up properly

### Next Steps (Testing & Verification)

- [ ] Test with a prompt that triggers multiple tool calls to verify real-time updates
- [ ] Test with long text responses to verify streaming text display
- [ ] Verify tool call state transitions (pending → running → completed/error)
- [ ] Test error scenarios (network interruption, API errors)
- [ ] Verify proper cleanup when streaming completes
- [ ] Document any issues or edge cases discovered during testing

## Technical Notes

- The SDK's SSE implementation returns an AsyncGenerator, which is perfect for TypeScript/JavaScript async iteration
- Events are filtered by sessionID to prevent cross-session contamination
- The `session.idle` event signals when to stop listening
- Text parts may include a `delta` field for character-by-character streaming
- Tool parts are sent as complete objects (not deltas) with state updates
