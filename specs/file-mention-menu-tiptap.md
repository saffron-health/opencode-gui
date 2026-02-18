# Spec: File Mention Menu with Tiptap Editor

## Problem Overview

Users currently cannot easily reference specific files from their workspace when chatting with the agent. While the extension supports file attachments through selection (via the editor-selection message), there's no way to manually specify files by typing in the chat input. This limits the user experience, especially when users want to quickly mention files without having to navigate to them in the editor first.

## Solution Overview

Replace the current textarea-based chat input with a Tiptap rich-text editor that supports inline @-mentions. When users type `@` in the editor, a dropdown menu will appear showing workspace files filtered by fuzzy search. Selected files will appear as inline "mention chips" (similar to Slack or GitHub mentions) that can be deleted as a single unit. When submitting a message, the editor will extract both the text and the mentioned files to send as attachments.

The implementation will use:
1. **tiptap-solid**: Community SolidJS bindings for Tiptap
2. **@tiptap/extension-mention**: Official mention extension
3. **@tiptap/suggestion**: Suggestion plugin for dropdown logic
4. **vscode.workspace.findFiles**: Extension host API for file search
5. **Inline chips**: Mentions rendered as styled inline nodes (not separate chips above input)

## Important Files/Docs for Implementation

### Existing Files to Modify
- [src/webview/components/InputBar.tsx](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/components/InputBar.tsx) - Replace textarea with Tiptap editor
- [src/webview/App.tsx](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/App.tsx) - Extract mentions from editor content on submit
- [src/OpenCodeViewProvider.ts](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeViewProvider.ts) - Add file search message handler
- [src/webview/App.css](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/App.css) - Add Tiptap editor styles
- [package.json](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/package.json) - Add new dependencies

### New Files to Create
- `src/webview/components/TiptapEditor.tsx` - Main Tiptap editor component
- `src/webview/components/FileMentionDropdown.tsx` - Dropdown showing file results
- `src/webview/components/TiptapEditor.css` - Tiptap editor styles
- `src/webview/extensions/FileMention.ts` - Custom Tiptap mention extension for files
- `src/webview/utils/editorContent.ts` - Utilities to extract mentions from editor JSON

### External Documentation
- [Tiptap Mention Extension](https://tiptap.dev/docs/editor/extensions/nodes/mention)
- [Tiptap Suggestion Utility](https://tiptap.dev/docs/editor/api/utilities/suggestion)
- [tiptap-solid GitHub](https://github.com/andi23rosca/tiptap-solid)
- [VSCode API: workspace.findFiles](https://code.visualstudio.com/api/references/vscode-api#workspace.findFiles)
- [Floating UI](https://floating-ui.com/) - For dropdown positioning
- [Continue.dev Tiptap Implementation](https://github.com/continuedev/continue) - Reference implementation

## Implementation

### Phase 1: Install dependencies and verify setup

- [x] Install tiptap packages: `pnpm add tiptap-solid @tiptap/core @tiptap/starter-kit @tiptap/extension-mention @tiptap/suggestion`
- [x] Install positioning library: `pnpm add @floating-ui/dom`
- [x] Verify packages are in [package.json](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/package.json)
- [x] Run `pnpm install` successfully
- [x] Run `pnpm type-check` to ensure TypeScript recognizes new packages
- [x] Create a minimal Tiptap editor in a test component to verify the packages work

### Phase 2: Add file search handler in extension

- [x] Add `searchFiles` message handler in [OpenCodeViewProvider.ts](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeViewProvider.ts)
- [x] Accept `{ type: 'searchFiles', query: string }` message from webview
- [x] Implement search using `vscode.workspace.findFiles(\`**/*\${query}*\`, excludePattern, 50)`
- [x] Exclude patterns: `**/node_modules/**`, `**/.git/**`, `**/dist/**`, `**/out/**`, `**/.vscode/**`
- [x] Return `{ type: 'searchFilesResult', files: string[] }` with relative paths
- [x] Use `workspace.asRelativePath(uri)` to convert URIs to relative paths
- [x] Add unit test verifying the handler responds to `searchFiles` messages
- [ ] Manually verify sending `searchFiles` message returns expected file list

### Phase 3: Create FileMention Tiptap extension

- [x] Create `src/webview/extensions/FileMention.ts`
- [x] Define a Tiptap `Node` extending `@tiptap/extension-mention`
- [x] Configure with `char: '@'` trigger
- [x] Add attributes: `id` (file path), `label` (display name), `query` (original search query)
- [x] Set `inline: true` and `atom: true` to make mentions behave as single units
- [x] Implement `renderHTML` to render mention as `<span class="file-mention" data-path="{path}">@{label}</span>`
- [x] Implement `parseHTML` to recognize mentions when content is loaded
- [x] Export configured extension
- [x] Add unit test verifying mention node serializes/deserializes correctly

### Phase 4: Create FileMentionDropdown component

- [x] Create `src/webview/components/FileMentionDropdown.tsx`
- [x] Accept props: `items: Array<{path: string, name: string}>`, `selectedIndex: number`, `onSelect: (item) => void`, `position: {top: number, left: number}`
- [x] Render list of files with VSCode-themed styles
- [x] Display file icon (use file extension to determine icon class)
- [x] Highlight selected item based on `selectedIndex`
- [x] Support keyboard navigation via imperative ref: `{ onKeyDown: (event) => boolean }`
- [x] Handle ArrowUp/ArrowDown to change selection, Enter/Tab to select, Escape to close
- [ ] Use `@floating-ui/dom` to position dropdown relative to cursor
- [x] Return `true` from `onKeyDown` if event was handled (prevents editor from processing it)
- [x] Create `src/webview/components/FileMentionDropdown.css` with VSCode-themed styles
- [x] Manually verify dropdown renders with mock data and keyboard navigation works

### Phase 5: Integrate suggestion logic with Tiptap

- [x] Create `src/webview/utils/suggestionOptions.ts` for suggestion configuration
- [x] Implement `items` function that triggers file search on query change
- [x] Debounce search requests by 200ms to avoid excessive messages
- [x] Implement `render` function returning `{ onStart, onUpdate, onKeyDown, onExit }`
- [x] In `onStart`, create SolidRenderer for `FileMentionDropdown` and position it
- [x] In `onUpdate`, update dropdown props with new query and results
- [x] In `onKeyDown`, delegate to dropdown's `onKeyDown` handler
- [x] In `onExit`, destroy the dropdown renderer
- [x] Calculate cursor position using `editor.view.coordsAtPos()` from ProseMirror
- [x] Use `@floating-ui/dom`'s `computePosition` to position dropdown with flip/shift middleware
- [ ] Add unit test verifying suggestion triggers on `@` character
- [ ] Manually verify dropdown appears when typing `@` in editor

### Phase 6: Create TiptapEditor component

- [x] Create `src/webview/components/TiptapEditor.tsx`
- [x] Use `createEditor` from `tiptap-solid` to initialize editor
- [x] Configure extensions: `Document`, `Paragraph`, `Text`, `History`, and `FileMention`
- [x] Add keyboard shortcuts: Enter to submit, Shift+Enter for new line, Cmd+Enter to submit
- [x] Prevent Enter from submitting when dropdown is open (check dropdown state)
- [x] Accept props: `value: string`, `onInput: (text: string) => void`, `onSubmit: () => void`, `placeholder: string`, `disabled: boolean`
- [x] Use `EditorContent` from `tiptap-solid` to render editor
- [x] Sync editor content with external state using `editor.commands.setContent(value)` when value changes
- [x] Extract plain text on input using `editor.getText()` and call `onInput`
- [x] Create `src/webview/components/TiptapEditor.css` with VSCode-themed styles
- [x] Style `.tiptap` editor container to match current textarea appearance
- [x] Style `.file-mention` to look like chips (rounded background, padding, hover states)
- [x] Manually verify editor renders and basic typing works

### Phase 7: Replace textarea in InputBar with TiptapEditor

- [x] Replace textarea in [InputBar.tsx](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/components/InputBar.tsx) with `TiptapEditor`
- [x] Pass `value`, `onInput`, `disabled` props to TiptapEditor
- [x] Remove textarea-specific height adjustment logic (Tiptap handles this)
- [x] Keep existing keyboard shortcut handlers for non-editor keys (Escape, etc.)
- [x] Ensure focus management still works (clicking container focuses editor)
- [x] Run `pnpm type-check` to verify no TypeScript errors
- [x] Run `pnpm build` to ensure builds successfully
- [ ] Manually verify the editor appears in the chat UI and accepts input

### Phase 8: Extract mentions on message submit

- [ ] Create `src/webview/utils/editorContent.ts` with mention extraction utilities
- [ ] Implement `extractMentions(json: JSONContent): string[]` function
- [ ] Walk editor's JSON content tree to find all `mention` nodes
- [ ] Extract `id` attribute (file path) from each mention node
- [ ] In [App.tsx](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/App.tsx), modify `handleSubmit` to extract mentions
- [ ] Get editor JSON using `editor.getJSON()` before submit
- [ ] Call `extractMentions(json)` to get list of mentioned file paths
- [ ] Convert file paths to `SelectionAttachment` objects with full file URLs
- [ ] Merge mentioned files with existing `selectionAttachments` 
- [ ] Build `FilePartInput` array from merged attachments
- [ ] Add integration test verifying mentions are converted to attachments
- [ ] Manually verify mentioned files are sent with the message

### Phase 9: Handle editor content persistence

- [ ] Store editor HTML/JSON content in drafts instead of plain text
- [ ] Modify draft storage in [App.tsx](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/App.tsx) to store editor content
- [ ] When loading draft, restore editor content with `editor.commands.setContent(html)`
- [ ] Ensure mentions persist when switching sessions
- [ ] Clear editor content on submit using `editor.commands.clearContent()`
- [ ] Add test verifying draft with mentions persists across session switches
- [ ] Manually verify switching sessions preserves editor content with mentions

### Phase 10: Polish and edge cases

- [ ] Handle empty workspace (show "No files found" in dropdown)
- [ ] Handle workspace without workspace root (disable file mentions)
- [ ] Prevent mention trigger when `@` is in middle of a word (check for space before)
- [ ] Support backspace to delete mentions as single unit (already handled by `atom: true`)
- [ ] Ensure dropdown doesn't overflow viewport (use Floating UI flip middleware)
- [ ] Show loading spinner in dropdown while searching
- [ ] Style mentions to match VSCode theme (use CSS variables)
- [ ] Add hover state to mentions showing full file path
- [ ] Handle very long file paths (truncate with ellipsis in middle)
- [ ] Test with files containing special characters and spaces
- [ ] Remove old attachment chip system above textarea (now inline)
- [ ] Update existing selection attachments to also appear as inline mentions
- [ ] Ensure accessibility: mentions should be readable by screen readers
- [ ] Add ARIA labels to dropdown items
- [ ] Test keyboard-only navigation (no mouse)
- [ ] Manually verify end-to-end: type `@`, select file, see inline chip, submit, agent receives file

### Sanity Checklist

- [ ] Run `pnpm type-check` to ensure all TypeScript types are correct
- [ ] Run `pnpm build` to ensure all packages compile successfully
- [ ] Run `pnpm lint` to verify no linting errors
- [ ] Ensure all written code adheres to the quality documentation in AGENTS.md
- [ ] Test the extension in VSCode with various file types and workspace sizes
- [ ] Test with empty workspaces and workspaces with thousands of files
- [ ] Verify bundle size increase is acceptable (should be ~60-80KB gzipped)
- [ ] Update this spec to mark all tasks as completed

## Notes

### Design Decisions

1. **Tiptap over Textarea**: Chosen for:
   - Native inline chip support (mentions as `atom` nodes)
   - Rich keyboard navigation and editing UX
   - Extensible architecture for future features (slash commands, formatting)
   - Better accessibility out of the box
   - Reference implementations from Continue.dev and other tools

2. **tiptap-solid vs React**: Using community SolidJS bindings because:
   - Already using SolidJS for the webview
   - Avoids dual framework bundle overhead
   - `tiptap-solid` is mature and actively maintained
   - SolidRenderer provides bridge to Solid components

3. **Inline Chips vs Separate Chips**: Mentions appear inline in the editor because:
   - More intuitive editing (delete with backspace, copy/paste works)
   - Matches familiar UX from Slack, GitHub, Notion
   - Cleaner UI (no separate chip area needed)
   - Editor state is single source of truth

4. **Extension Host Search**: File searching in extension host because:
   - Access to VSCode's efficient workspace APIs
   - Respects `.gitignore` and workspace settings
   - No need to sync file list to webview

5. **Floating UI for Positioning**: Chosen over Tippy.js because:
   - Smaller bundle size (Tippy includes Popper.js)
   - More modern API
   - Better TypeScript support
   - Only need positioning, not full tooltip features

### Bundle Size Impact

Expected additions to bundle:
- `@tiptap/core`: ~45KB gzipped
- `@tiptap/starter-kit`: ~10KB gzipped
- `@tiptap/extension-mention` + `@tiptap/suggestion`: ~15KB gzipped
- `tiptap-solid`: ~2KB gzipped
- `@floating-ui/dom`: ~8KB gzipped

**Total**: ~80KB gzipped (acceptable for the UX improvement)

### Future Enhancements (Out of Scope)

- **Slash commands**: `/` trigger for quick actions (e.g., `/search`, `/explain`)
- **Multiple mention types**: `@folder` for directories, `@symbol` for functions/classes
- **File preview**: Hover over mention to see file preview
- **Recently mentioned**: Quick access to recently mentioned files
- **Fuzzy search**: Client-side fuzzy search with MiniSearch library
- **Markdown formatting**: Bold, italic, code inline formatting
- **Code blocks**: Multi-line code blocks in input
- **Drag and drop**: Drag files from explorer to insert as mentions

### Migration Strategy

To minimize risk:
1. Keep old textarea-based InputBar as `InputBarLegacy.tsx` initially
2. Add feature flag or environment variable to toggle between old/new
3. Test new editor thoroughly before removing legacy code
4. Provide feedback mechanism for users to report issues
5. Document rollback plan in case of critical bugs

### Accessibility Requirements

- Editor must support screen readers (ARIA labels, roles)
- Keyboard navigation must work without mouse
- Focus indicators must be visible
- Mention dropdown must announce selected item
- All shortcuts must have keyboard alternatives
- Color contrast must meet WCAG AA standards (use VSCode theme vars)
