# Style Refinements - Round 2

## Goal
Additional style refinements to improve layout flow and visual consistency:
1. Remove absolute positioning from input buttons (move to document flow)
2. Unify background to `var(--vscode-sideBar-background)`
3. Remove divider in empty state
4. Add 20px line-height to prompt input and user messages
5. Remove top margin from first message text item, bottom margin from last
6. Use `color-mix(in oklab, var(--vscode-editor-background) 60%, transparent)` for tool call background

## Current State Analysis

### Input Buttons
- Currently: `.input-buttons` uses `position: absolute; bottom: 4px; left: 4px; right: 4px;`
- Textarea has `padding-bottom: 32px` inline style to make room for buttons
- This causes the buttons to overlap the textarea

### Backgrounds
- Body: `var(--vscode-editor-background)`
- Input container: `var(--vscode-sideBar-background)`
- Tool calls: `var(--vscode-sideBar-background)`
- Need to unify to sideBar-background

### Dividers
- Empty state: `.input-container` has `border-bottom: 1px solid var(--vscode-panel-border)`
- Has-messages state: `.app--has-messages .input-container` removes border-bottom and adds border-top
- Should remove the border-bottom in empty state

### Line Heights
- Prompt input: No explicit line-height set, uses default
- User messages: No explicit line-height set
- Should add `line-height: 20px` to both

### Message Text Margins
- `.message-text` has `margin: 4px 0;`
- Need to remove top margin for first item (`:first-child`)
- Need to remove bottom margin for last item (`:last-child`)

### Tool Call Background
- Currently: `background-color: var(--vscode-sideBar-background);`
- Should use: `color-mix(in oklab, var(--vscode-editor-background) 60%, transparent)`

## Implementation Plan

1. **Refactor input buttons layout:**
   - Remove `position: absolute` from `.input-buttons`
   - Remove inline `padding-bottom: 32px` style from textarea in App.tsx
   - Add proper spacing with margin-top or gap
   - Adjust textarea padding to be uniform

2. **Unify backgrounds:**
   - Change body background from `editor-background` to `sideBar-background`
   - Keep other backgrounds as sideBar-background (already set)

3. **Remove empty state divider:**
   - Remove `border-bottom` from `.input-container` base style
   - Keep `border-top` for has-messages state

4. **Add line-height:**
   - Add `line-height: 20px` to `.prompt-input`
   - Add `line-height: 20px` to `.message--user .message-content`

5. **Fix message text margins:**
   - Add `.message-text:first-child { margin-top: 0; }`
   - Add `.message-text:last-child { margin-bottom: 0; }`

6. **Update tool call background:**
   - Change from `var(--vscode-sideBar-background)` to `color-mix(in oklab, var(--vscode-editor-background) 60%, transparent)`

## Files to Modify

1. `src/webview/App.tsx` - Remove inline padding-bottom style
2. `src/webview/App.css` - All CSS changes

## Success Criteria

- [x] Input buttons are in document flow (not absolutely positioned)
- [x] Buttons don't overlap textarea
- [x] All backgrounds use sideBar-background
- [x] No divider in empty state
- [x] 20px line-height on prompt input
- [x] 20px line-height on user messages
- [x] First message text has no top margin
- [x] Last message text has no bottom margin
- [x] Tool calls use color-mix for background

## Implementation Summary

### Changes Made

1. **Refactored Input Button Layout:**
   - Removed `position: absolute` from `.input-buttons`
   - Removed wrapper div (`.textarea-wrapper`) - no longer needed
   - Removed inline `padding-bottom: 32px` style from textarea
   - Removed `padding-right: 48px` from `.prompt-input`
   - Added `margin-top: 8px` to `.input-buttons` for proper spacing
   - Buttons now sit below textarea in normal document flow

2. **Unified Backgrounds:**
   - Changed body background from `var(--vscode-editor-background)` to `var(--vscode-sideBar-background)`
   - All surfaces now use consistent sideBar-background

3. **Removed Empty State Divider:**
   - Removed `border-bottom` from base `.input-container` style
   - Kept only `border-top` for `.app--has-messages .input-container`
   - Empty state now has no border/divider

4. **Added Line Heights:**
   - Added `line-height: 20px` to `.prompt-input`
   - Added `line-height: 20px` to `.message--user .message-content`

5. **Fixed Message Text Margins:**
   - Added `.message-text:first-child { margin-top: 0; }`
   - Added `.message-text:last-child { margin-bottom: 0; }`
   - First and last items now have cleaner spacing

6. **Updated Tool Call Background:**
   - Changed from `var(--vscode-sideBar-background)` to `color-mix(in oklab, var(--vscode-editor-background) 60%, transparent)`
   - Creates subtle semi-transparent background effect

### Files Modified

1. `src/webview/App.tsx` - Removed wrapper div and inline padding style
2. `src/webview/App.css` - 6 CSS updates for layout, backgrounds, line-height, margins, and color-mix

### Impact

- Cleaner input layout with buttons in document flow
- More consistent background colors throughout
- Better spacing with proper line-heights
- Cleaner message text spacing
- Subtle tool call backgrounds with color-mix
