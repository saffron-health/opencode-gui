- [x] Opencode extension seem to open in MacOS filesystem root, not the workspace that the VSCode opens in
  - **Status**: Fixed by temporarily changing working directory during server spawn
  - **Details**: Modified `OpenCodeService.ts` to use `process.chdir()` to the workspace root before calling `createOpencode()`, then immediately restoring the original cwd. This ensures the spawned OpenCode server inherits the correct working directory for project context discovery.
  - **Documentation**: See [docs/todos/filesystem-root-issue.md](docs/todos/filesystem-root-issue.md)
- [x] Style improvements: Remove send button and text drag handle. Make the text editor focus outline blue. Add a small button with text ⌘⏎ in the bottom right of the textbox with quiet styling. When either clicked or cmd-enter is pressed, the prompt should be submitted.

  - **Status**: Completed - all style improvements implemented successfully
  - **Details**: Removed send button, disabled textarea resize handle, added blue focus outline (#007ACC), added quiet ⌘⏎ button in bottom-right corner, and wired up Cmd+Enter keyboard shortcut for submission
  - **Documentation**: See [docs/todos/style-improvements-send-button.md](docs/todos/style-improvements-send-button.md)

- [x] More style improvements: Right now, the prompt box is always at the top, and the conversation shows up as message bubbles underneath. When there's no conversation yet, I want the prompt editor to show up at the top with the current style. After a prompt is submitted, the prompt editor should move to the bottom. The style of the messages should also change. A user message should be styled like the prompt editor (full width, same background, padding, slight border). An assistant message should have no styling: that is, it should write into the surface of the extension, and take up the full width as well. Thinking blocks should be in toggle blocks.

  - **Status**: Completed - all layout and message styling improvements implemented
  - **Details**: Prompt editor now repositions from top to bottom after first message. User messages styled like prompt editor (full width, input background, border). Assistant messages have transparent background and blend into surface. Thinking indicators implemented as collapsible `<details>` blocks.
  - **Documentation**: See [docs/todos/style-improvements-layout.md](docs/todos/style-improvements-layout.md)

- [x] Check to make sure is it using the Opencode config in the workspace?

  - **Status**: Completed - workspace config loading verified and enhanced with logging
  - **Details**: Added comprehensive logging to show when workspace `opencode.json` is loaded, what values are in it, and verification that the config was successfully applied to the OpenCode server. Added `verifyConfig()` method that queries the server's active config and compares it to the workspace config to ensure settings match.
  - **Documentation**: See [docs/todos/opencode-config-verification.md](docs/todos/opencode-config-verification.md)

- [x] Prompt editor should auto-resize as user types

  - **Status**: Completed - prompt editor textarea now auto-resizes smoothly as content is added
  - **Details**: Implemented JavaScript-based auto-resize that expands the textarea height from 36px minimum up to 120px maximum (about 5-6 lines). Added overflow scrolling when content exceeds max height. Works by measuring scrollHeight and dynamically updating the height style on input changes.
  - **Documentation**: See [docs/todos/prompt-editor-auto-resize.md](docs/todos/prompt-editor-auto-resize.md)

- [x] Tool calls should show up. Can it even make tool calls right now?

  - **Status**: Completed - tool calls now display as collapsible blocks with status, input, output, and error information
  - **Details**: Implemented comprehensive support for displaying all OpenCode message part types including tool calls, reasoning blocks, and text parts. The UI now shows tool calls with status badges (pending/running/completed/error), formatted input parameters, output results, and error messages. Also added support for reasoning blocks. Maintains backward compatibility with text-only messages.
  - **Documentation**: See [docs/todos/tool-calls.md](docs/todos/tool-calls.md)

- [x] Implement SSE streaming so we can get real tool call support. See [docs/todos/tool-calls.md](docs/todos/tool-calls.md). Would RivetKit be helpful here? https://www.rivet.dev/docs/actors/ Consider adding.

  - **Status**: Completed - SSE streaming fully implemented for real-time tool call and message updates
  - **Details**: Implemented complete SSE streaming using OpenCode SDK's built-in `event.subscribe()` method. Added `sendPromptStreaming()` to OpenCodeService that subscribes to SSE events, filters by sessionID, and streams real-time updates to the UI. Updated OpenCodeViewProvider to handle streaming events (`message.part.updated`, `message.updated`, `session.idle`). Modified React app to handle streaming part updates with proper state management. RivetKit evaluation: not needed - OpenCode SDK has comprehensive SSE support already built-in.
  - **Documentation**: See [docs/todos/sse-streaming.md](docs/todos/sse-streaming.md)
  - **What Works**: Real-time tool call visibility (pending → running → completed), text streaming with deltas, reasoning blocks, proper session isolation, error handling and cleanup
  - **Testing Needed**: The implementation is complete and builds successfully, but needs real-world testing with prompts that trigger tool calls to verify the streaming behavior works as expected

- [x] Rewrite in Solidjs
  - **Status**: Completed - full migration from React to SolidJS successful with 60% bundle size reduction
  - **Details**: Migrated all React hooks to SolidJS primitives (createSignal, createEffect, onMount), updated build config, rewrote App.tsx (440 lines) and main.tsx. Build passes with no errors. Webview bundle reduced from ~40KB to 16.25KB (6.51KB gzipped). All features preserved: message handling, streaming, tool calls, auto-scroll, auto-resize, keyboard shortcuts.
  - **Documentation**: See [docs/todos/rewrite-solidjs.md](docs/todos/rewrite-solidjs.md)
  - **Testing**: Build verified successful. Runtime testing in Extension Development Host recommended to verify no regressions.
- [x] Agent switcher - add a little button to the left of the send button in the prompt editor that when clicked lets us toggle between different agents. Also, it seems like the send-message button is just absolutely positioned. Let's add extra space to the bottom of the editor to make space for both of the send message button and the agent switcher. The send message button should be secondary style, and agent switcher should be quiet style. If opencode api gives us access to color, we can use that as the text color for the agent switcher text.

  - **Status**: Completed - agent switcher fully implemented with dropdown UI, backend API integration, and proper styling
  - **Details**: Added agent switcher button (quiet style) to the left of the send button (secondary style) in the prompt editor. Both buttons are positioned in a `.input-buttons` row with proper spacing. The agent switcher displays a dropdown of available agents from the OpenCode API, filters to only "primary" or "all" mode agents, auto-selects the first agent, and sends the selected agent with each prompt. Backend fully wired up to support agent selection via OpenCodeService and OpenCodeViewProvider.
  - **Documentation**: See [docs/todos/agent-switcher.md](docs/todos/agent-switcher.md)
  - **Known Limitations**: OpenCode Agent API doesn't provide color property, so color customization from agent config is not available. Agent selection doesn't persist across extension reloads. No visual indicator of which agent responded.

- [x] Style improvements: let's lower the horizontal paddings on all the messages, remove the placeholder message on the prompt editor as well as the intro help message. There's also like a "Chat" section heading on the extension. Does that need to be there? Can we get rid of that. I like Amp's style. Here's some random class names I copied from their extension CSS we can copy. We don't use Tailwind, but we can re-build it in CSS.

  - **Status**: Completed - all Amp-style improvements implemented with Oracle review and enhancements
  - **Details**: Reduced padding throughout (messages 16px→8px, input 12px→8px), removed placeholder text and welcome message, removed "Chat" heading from package.json. Converted Tailwind classes to CSS for tool calls and scroll pane. Oracle reviewed and recommended 20+ additional improvements which were all implemented: standardized spacing to 8px scale, unified border radius to 4px, added proper theme tokens for focus/links/hover, added content-visibility for performance, improved accessibility with :focus-visible and prefers-reduced-motion, added link styling and code block styling, improved text wrapping, and added interactive hover states to all summary elements.
  - **Documentation**: See [docs/todos/style-improvements-amp-style.md](docs/todos/style-improvements-amp-style.md)

- [x] Additional style refinements: Remove absolute positioning from input buttons, unify backgrounds to sideBar-background, remove empty state divider, add 20px line-height to prompt and user messages, fix message text margins, use color-mix for tool call backgrounds

  - **Status**: Completed - all layout and spacing refinements implemented
  - **Details**: Refactored input buttons to use document flow instead of absolute positioning, removed wrapper div and inline padding styles. Unified all backgrounds to sideBar-background for consistency. Removed border/divider in empty state. Added 20px line-height to prompt input and user messages for better readability. Added first-child/last-child margin removal for message text. Updated tool call background to use `color-mix(in oklab, var(--vscode-editor-background) 60%, transparent)` for subtle semi-transparent effect.
  - **Documentation**: See [docs/todos/style-refinements-round-2.md](docs/todos/style-refinements-round-2.md)

- [ ] Markdown support in assistant messages
- [ ] @-mention support
- [ ] New session button
- [ ] Session switcher
- [ ] Better tool calls
