# Message Queue Feature Spec

## Overview

Add support for queuing messages while a response is being generated. Users can submit additional messages that will be processed sequentially after the current response completes.

## User Experience

### Input State Transitions

The submit button in `InputBar` has three states based on context:

| State | Button Display | Trigger |
|-------|----------------|---------|
| **Idle** | `⌘⏎` | No generation active |
| **Generating, empty input** | Stop icon (square) | `isThinking=true`, no text entered |
| **Generating, typing** | `⌘⏎` | `isThinking=true`, user started typing |
| **Generating, typing + Shift held** | `⇧⌘⏎ Queue` | `isThinking=true`, user typing + holding Shift |

### Keyboard Shortcuts

- **`⌘⏎` (idle)**: Submit message immediately
- **`⌘⏎` (generating, with text)**: Cancel current generation and submit new message
- **`⇧⌘⏎` (generating, with text)**: Queue the message (does not cancel)

### Queued Messages UI

Queued messages appear above the input bar in a horizontal list:

```
┌─────────────────────────────────────────────────────────┐
│ ┌──────────────────────────────────┬──┐                 │
│ │ Can you also add tests for...   │ ✕│                 │
│ └──────────────────────────────────┴──┘                 │
│ ┌──────────────────────────────────┬──┐                 │
│ │ And update the documentation... │ ✕│                 │
│ └──────────────────────────────────┴──┘                 │
├─────────────────────────────────────────────────────────┤
│ [textarea]                                     ⇧⌘⏎ Queue│
└─────────────────────────────────────────────────────────┘
```

Each queued message:
- Truncated to single line with ellipsis
- Has an X button on the right to remove it
- Clicking anywhere else on it:
  - Removes it and all messages after it from queue
  - Places its text in the input textarea for editing

## Data Model

### Queue State

```typescript
interface QueuedMessage {
  id: string;
  text: string;
  agent: string | null;
}

// In App.tsx state:
const [messageQueue, setMessageQueue] = createSignal<QueuedMessage[]>([]);
```

### InputBar Props Changes

```typescript
interface InputBarProps {
  // Existing
  value: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  disabled: boolean;
  isThinking: boolean;
  selectedAgent: string | null;
  agents: Agent[];
  onAgentChange: (agentName: string) => void;
  
  // New
  onQueue: () => void;  // Called when user queues a message (Shift+Cmd+Enter)
  queuedMessages: QueuedMessage[];  // For displaying queue above input
  onRemoveFromQueue: (id: string) => void;  // Remove specific message
  onEditQueuedMessage: (id: string) => void;  // Click to edit (removes it + later)
}
```

## Implementation Phases

### Phase 1: Queue State Management (App.tsx)

1. Add `messageQueue` signal to App state
2. Add `handleQueueMessage()` - adds current input to queue, clears input
3. Add `handleRemoveFromQueue(id)` - removes message by ID
4. Add `handleEditQueuedMessage(id)` - moves message to input, removes it and later ones
5. Modify `handleEvent("session.idle")` to auto-process next queued message

### Phase 2: InputBar Keyboard Handling

1. Track Shift key state with `createSignal<boolean>` 
2. Add `keydown`/`keyup` listeners on `window` for Shift detection
3. Modify `handleKeyDown`:
   - `⌘⏎` during thinking with text → still calls `onSubmit` (which will interrupt)
   - `⇧⌘⏎` during thinking with text → calls `onQueue()`
4. Update button rendering logic based on `isShiftHeld` and `isThinking`

### Phase 3: Queue Display Component

1. Create `QueuedMessagesList` component
2. Render above textarea inside `input-container`
3. Each item:
   - Single line, truncated with CSS `text-overflow: ellipsis`
   - Close button (X) on right
   - Click handler for editing

### Phase 4: Button Label Updates

1. When `isThinking && hasText && isShiftHeld`: show `⇧⌘⏎ Queue`
2. Add CSS for the new button state
3. Consider adding text label "Queue" next to shortcut

## Edge Cases

1. **Session switch with queued messages**: Clear queue on session switch
2. **Cancel during queue processing**: Should cancel current + clear queue? Or just current?
3. **Edit previous message with queue**: Clear queue when editing starts
4. **Network error during queue processing**: Stop processing, show error

## CSS Additions

```css
/* Queued messages container */
.queued-messages {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding-bottom: var(--spacing-xs);
  border-bottom: 1px solid var(--border-color);
}

.queued-message {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: var(--card-background);
  border: 1px solid var(--border-color-muted);
  border-radius: 4px;
  cursor: pointer;
}

.queued-message:hover {
  background-color: var(--hover-background);
}

.queued-message__text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-small);
  color: var(--description-foreground);
}

.queued-message__remove {
  flex-shrink: 0;
  padding: 2px;
  border: none;
  background: transparent;
  color: var(--description-foreground);
  cursor: pointer;
  line-height: 1;
}

.queued-message__remove:hover {
  color: var(--foreground);
}

/* Queue button variant */
.shortcut-button--queue {
  gap: var(--spacing-xs);
}

.shortcut-button--queue .queue-label {
  font-size: var(--font-size-small);
}
```

## Files to Modify

1. **src/webview/App.tsx** - Queue state, handlers, session.idle processing
2. **src/webview/components/InputBar.tsx** - Shift detection, button states, queue display
3. **src/webview/App.css** - Queue styling
4. **src/webview/types.ts** - QueuedMessage type (optional, can inline)

## Testing Checklist

- [ ] Queue single message while generating
- [ ] Queue multiple messages
- [ ] Remove message from middle of queue
- [ ] Click queued message to edit (removes it + later ones)
- [ ] Queue processes automatically when generation ends
- [ ] Session switch clears queue
- [ ] Shift+Cmd+Enter shows "Queue" button
- [ ] Cmd+Enter without Shift still interrupts
