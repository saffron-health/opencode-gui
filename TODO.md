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
- [ ] User message should auto-resize (use Tiptap)
- [ ] Tool calls should show up
- [ ] Agent switcher
- [ ] Markdown support in assistant messages
- [ ] @-mention support
