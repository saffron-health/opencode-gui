# Style Improvements: Amp-Style Updates

## Goal
Apply style improvements inspired by Amp's extension to make the UI cleaner and more professional:
1. Reduce horizontal padding on messages
2. Remove placeholder text from prompt editor
3. Remove welcome/intro message
4. Remove "Chat" section heading if present
5. Apply Amp-inspired CSS patterns for tool calls and scroll pane

## Current State Analysis

### Current Padding
- `.messages-container`: 16px padding
- `.message--user .message-content`: 8px 12px padding
- `.message--assistant .message-content`: 4px 0 padding (no horizontal padding)
- `.tool-call`: 8px 12px padding
- `.input-container`: 12px padding

### Current Placeholder & Welcome Message
- Placeholder text in App.tsx line 390: "Ask OpenCode anything..." / "Initializing OpenCode..."
- Welcome message in App.tsx lines 421-427: Shows when no messages exist

### Section Heading
- Need to check if there's a "Chat" heading in the VSCode view title or webview
- The `OpenCodeViewProvider.viewType = 'opencode.chatView'` might show a title in VSCode

## Tailwind to CSS Conversion

### Tool Call Styles (from Amp)
**Outer card:**
```
Tailwind: max-w-[100%] w-full rounded-md overflow-hidden border border-border/80
CSS equivalent:
- max-width: 100%
- width: 100%
- border-radius: 6px (md = 0.375rem = 6px)
- overflow: hidden
- border: 1px solid with 80% opacity
```

**Inner card:**
```
Tailwind: flex flex-col gap-1.5 font-normal bg-card/60 p-1.5
CSS equivalent:
- display: flex
- flex-direction: column
- gap: 6px (1.5 * 4px)
- font-weight: normal
- background with 60% opacity
- padding: 6px
```

### Main Scroll Pane (from Amp)
```
Tailwind: overflow-auto relative h-full max-h-full scroll-p-2 p-2
CSS equivalent:
- overflow: auto
- position: relative
- height: 100%
- max-height: 100%
- scroll-padding: 8px (p-2 = 0.5rem = 8px)
- padding: 8px
```

## Implementation Plan

1. **Update `.messages-container` styling:**
   - Reduce padding from 16px to 8px (matching Tailwind's p-2)
   - Add `position: relative`
   - Add `scroll-padding: 8px`
   - Reduce gap from 16px to maybe 8-12px

2. **Update message padding:**
   - Reduce horizontal padding on user messages
   - Keep assistant messages minimal

3. **Update tool call styling:**
   - Apply Amp-style card design
   - Use rounded corners (6px)
   - Add overflow: hidden
   - Adjust inner padding to 6px

4. **Remove placeholder text:**
   - Change placeholder to empty string or minimal text

5. **Remove welcome message:**
   - Remove the welcome message block entirely from App.tsx

6. **Check for "Chat" heading:**
   - Investigate package.json for viewsContainers/views configuration
   - May need to update view title in package.json

## Files to Modify

1. `src/webview/App.tsx` - Remove welcome message, update placeholder
2. `src/webview/App.css` - Apply all CSS changes
3. `package.json` - Check/update view title if needed

## VSCode Theme Variables to Use

For borders with opacity, we'll need to work with existing VSCode variables:
- `var(--vscode-panel-border)` for borders
- `var(--vscode-input-border)` for subtle borders
- May need to use rgba() or adjust opacity with CSS filters

## Success Criteria

- [x] Reduced padding creates more spacious feel
- [x] No placeholder text in input
- [x] No welcome message on empty state
- [x] Tool calls match Amp's card style
- [x] Scroll container has proper spacing
- [x] No "Chat" heading visible
- [x] Oracle review completed with suggestions applied

## Implementation Summary

### Changes Made

1. **Reduced Padding Throughout:**
   - Messages container: 16px → 8px
   - Input container: 12px → 8px
   - Message gaps: 16px → 8px
   - User message padding: 8px 12px → 8px
   - Tool call padding: 6px → 8px (standardized to 8px scale)

2. **Removed UI Clutter:**
   - Removed placeholder text from prompt editor (now empty string)
   - Removed welcome message entirely from App.tsx
   - Removed "Chat" section heading from package.json (set to empty string)
   - Removed unused `.welcome-message` CSS

3. **Applied Amp-Style Patterns:**
   - Scroll container: Added `overflow: auto`, `relative`, `scroll-padding: 8px`, `overscroll-behavior: contain`
   - Tool calls: Standardized radius to 4px, changed border to panel-border token
   - Summary elements: Added hover states with list-hoverBackground
   - Added border-bottom to open details/summary elements

4. **Oracle-Recommended Improvements:**
   - **Theme tokens**: Changed body background to editor-background, replaced hard-coded focus ring with focusBorder variable
   - **Focus states**: Updated all focus styles to use :focus-visible with theme tokens
   - **Link styling**: Added proper link colors using textLink-foreground and textLink-activeForeground
   - **Scrollbar**: Added active state for scrollbar thumb
   - **Spacing standardization**: All spacing now uses 8px scale (removed stray 6px values)
   - **Border radius**: Unified to 4px throughout (was mix of 3px, 4px, 6px)
   - **Typography**: Metadata font size standardized to 12px
   - **Accessibility**: Added :focus-visible to buttons, prefers-reduced-motion for animations
   - **Performance**: Added content-visibility: auto and contain-intrinsic-size to messages, tool calls, and reasoning blocks for large thread optimization
   - **Text wrapping**: Added overflow-wrap: anywhere for better long-token handling
   - **Code/pre styling**: Added proper styling for inline code and pre blocks in message content
   - **Interactive states**: Added hover backgrounds and transitions to summary elements

### Files Modified

1. `src/webview/App.css` - All CSS improvements (19 separate edits)
2. `src/webview/App.tsx` - Removed placeholder and welcome message (2 edits)
3. `package.json` - Removed "Chat" heading (1 edit)

### Testing Recommendations

- Build the extension and test in Extension Development Host
- Verify focus states work correctly with keyboard navigation
- Test in both light and dark themes
- Check scrolling performance with long message threads
- Verify hover states on tool calls and reasoning blocks
- Test accessibility with screen readers
- Check reduced-motion preference handling
