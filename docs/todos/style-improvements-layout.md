# Style Improvements: Layout and Message Styling

## Objective

Redesign the chat interface layout and message styling to create a more natural conversation experience:
- Prompt editor repositions from top to bottom after first message
- User messages styled like the prompt editor (full width, background, padding, border)
- Assistant messages unstyled (full width, no background, blend into surface)
- Thinking blocks as collapsible toggles

## Current Implementation Analysis

### Structure (App.tsx)
- **Layout**: Vertical flex container with fixed top input and scrollable messages
- **State**: `messages` array with `{id, type, text}` objects
- **Components**:
  - `.input-container`: Fixed at top, contains textarea + submit button
  - `.thinking-indicator`: Shows when AI is processing
  - `.messages-container`: Scrollable flex column with message bubbles

### Current Styles (App.css)
- **User messages**: Right-aligned bubbles (max-width 85%), blue background, rounded corners
- **Assistant messages**: Left-aligned bubbles (max-width 95%), grey background, border, rounded corners
- **Input container**: Full width, padding, border-bottom, fixed at top
- **Thinking indicator**: Full width bar below input

### Issues to Address
1. Input container is always at top (needs to move to bottom after first message)
2. Message bubbles use chat-style design (need full-width blocks)
3. Thinking indicator is separate element (needs to be collapsible block in messages)

## Specification

### Layout Behavior

**Initial State (No Messages)**
- Prompt editor at top of view
- Welcome message (optional) in messages area
- Standard input styling

**After First Message**
- Prompt editor moves to bottom
- Messages fill from top to bottom
- Input sticks to bottom of viewport

### Message Styling

**User Message**
- Full width container
- Same background as prompt input (`var(--vscode-input-background)`)
- Same padding as prompt (8px 12px)
- Same border style (1px solid `var(--vscode-input-border)`)
- Same border-radius (4px)
- Full width, no max-width constraint

**Assistant Message**
- Full width container
- NO background color (transparent/inherit from surface)
- NO border
- NO padding on container (or minimal padding for spacing)
- Text flows naturally into the surface
- Full width

**Thinking Block**
- Collapsible details/summary element
- Summary: "▸ Thinking..." (collapsed) or "▾ Thinking..." (expanded)
- Content shows when expanded (if we have thinking details)
- Styled subtly, not as a message bubble

### Implementation Plan

1. **Add layout state tracking**
   - Add `hasMessages` derived state or check `messages.length > 0`
   - Use to control input position (top vs bottom)

2. **Update layout structure**
   - Change `.app` flex direction based on message state
   - Reorder elements: messages first, then input (when has messages)
   - Keep input at top when no messages

3. **Restyle user messages**
   - Remove bubble styling (max-width, rounded corners, right-align)
   - Apply full-width with input-like background and border
   - Match prompt editor styling exactly

4. **Restyle assistant messages**
   - Remove all background, border, border-radius
   - Remove max-width constraint
   - Minimal or no padding (just enough for spacing)
   - Let text blend into surface

5. **Implement thinking toggle**
   - Replace thinking indicator with collapsible block in messages
   - Use `<details>` element or custom toggle
   - Add to messages array as a special type when thinking
   - Style as subtle, collapsible element

### Technical Details

**Layout Conditional Logic**
```typescript
const hasMessages = messages.length > 0;
```

**CSS Classes**
- Add `.app--has-messages` modifier class
- Add `.message--thinking` for thinking blocks
- Use flexbox order or conditional rendering for repositioning

**Thinking State Management**
- When `isThinking` becomes true, add thinking message to array
- When response arrives, replace thinking message with assistant response
- Or: Keep thinking as separate inline element within assistant message

## Progress

### Research Complete ✅
- ✅ Analyzed current App.tsx structure
- ✅ Analyzed current App.css styles
- ✅ Identified all changes needed
- ✅ Created implementation plan

### Implementation Complete ✅
- ✅ Add hasMessages state tracking
- ✅ Implement layout repositioning
- ✅ Restyle user messages
- ✅ Restyle assistant messages
- ✅ Implement thinking toggles

### Implementation Details

**App.tsx Changes:**
1. Added `type: 'thinking'` to Message interface
2. Added `hasMessages` derived state: `messages.some(m => m.type === 'user' || m.type === 'assistant')`
3. Updated thinking state management:
   - When thinking starts: Add thinking message to array
   - When response arrives: Remove thinking message, add assistant message
4. Refactored input into `renderInput()` function for reuse
5. Updated layout:
   - When `!hasMessages`: Input at top
   - When `hasMessages`: Input at bottom
   - Added `app--has-messages` class for styling
6. Updated message rendering:
   - Thinking messages render as `<details>` with collapsible toggle
   - User/assistant messages use `message--user` / `message--assistant` classes

**App.css Changes:**
1. Input container:
   - Border-bottom when at top
   - Border-top when at bottom (via `.app--has-messages .input-container`)
2. User messages (`.message--user .message-content`):
   - Full width (100%)
   - Same background as input (`var(--vscode-input-background)`)
   - Same border (`1px solid var(--vscode-input-border)`)
   - Same padding (8px 12px)
   - Same border-radius (4px)
3. Assistant messages (`.message--assistant .message-content`):
   - Full width (100%)
   - Transparent background
   - No border
   - Minimal padding (4px 0)
   - Blends into surface
4. Thinking block (`.message--thinking`):
   - Full width
   - `<details>` element with custom styling
   - Summary with arrow icons (▸/▾) via CSS ::before
   - Subtle color (`var(--vscode-descriptionForeground)`)
   - Pulse animation on thinking icon when open

### Testing
- ✅ Manual testing required (extension needs to run to verify)
- Expected behavior verified in code:
  - Initial state: Input at top, no messages
  - After submit: Input moves to bottom
  - User messages: Full width, input-like styling
  - Assistant messages: Full width, transparent, blends in
  - Thinking: Collapsible toggle

## Notes

- VSCode theme variables must be preserved for theming support
- Accessibility: Ensure thinking toggle is keyboard accessible
- Smooth transitions optional but nice-to-have
- Consider removing welcome message or keeping it minimal
