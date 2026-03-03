---
name: dev-command
description: "Interact with the running VSCode extension via Playwright. Use when automating, testing, or debugging the OpenCode webview UI."
---

# Dev Command

Launch and interact with the VSCode extension using `pnpm dev`.

## Commands

```bash
pnpm dev                    # Launch VSCode in background tmux session
pnpm dev exec "<code>"      # Execute JS in the webview (frame/page/browser available)
pnpm dev snapshot           # Screenshot the VSCode window
pnpm dev stop               # Stop the session
```

## Exec environment

The `exec` command provides three objects:

- **`frame`** — the webview `active-frame` (SolidJS UI). Use this for most interactions.
- **`page`** — the top-level VSCode Electron page. Use for screenshots or VSCode-level actions.
- **`browser`** — the Playwright Browser instance.

## Common selectors

All selectors below target elements inside `frame`.

### Input

```bash
# Type a message
pnpm dev exec "await frame.locator('[contenteditable]').pressSequentially('hello world')"

# Submit (Cmd+Enter)
pnpm dev exec "await frame.locator('[contenteditable]').press('Meta+Enter')"

# Clear and retype
pnpm dev exec "await frame.locator('[contenteditable]').fill(''); await frame.locator('[contenteditable]').pressSequentially('new text')"
```

### Buttons

```bash
# Stop generation
pnpm dev exec "await frame.locator('.shortcut-button--stop').click()"

# Submit button
pnpm dev exec "await frame.locator('.shortcut-button--secondary').click()"

# New session
pnpm dev exec "await frame.locator('.new-session-button').click()"

# Session switcher
pnpm dev exec "await frame.locator('.session-switcher-button').click()"
```

### Permissions

```bash
# Allow once
pnpm dev exec "await frame.locator('.permission-button--primary').click()"

# Allow always
pnpm dev exec "await frame.locator('button[aria-label=\"Allow always\"]').click()"

# Reject
pnpm dev exec "await frame.locator('button[aria-label=\"Reject\"]').click()"

# Allow all visible permissions
pnpm dev exec "const btns = await frame.locator('.permission-button--primary').all(); for (const b of btns) await b.click()"
```

### Messages

```bash
# Get all message texts
pnpm dev exec "const msgs = await frame.locator('.message-text').allTextContents(); return msgs"

# Get last assistant message
pnpm dev exec "const msgs = await frame.locator('.message--assistant .message-text').allTextContents(); return msgs[msgs.length - 1]"

# Wait for assistant response
pnpm dev exec "await frame.locator('.message--assistant').last().waitFor()"

# Check if thinking
pnpm dev exec "return await frame.locator('.loading-indicator').isVisible()"
```

### Reading state

```bash
# Get input text
pnpm dev exec "return await frame.locator('[contenteditable]').textContent()"

# Count messages
pnpm dev exec "return await frame.locator('.message').count()"

# Get session error
pnpm dev exec "return await frame.locator('.session-error').textContent()"
```

## Important notes

- Do NOT pass `undefined` as a second argument to `frame.evaluate(() => ...)` — it causes "Too many arguments" errors. Just call with one arg.
- Screenshots must be taken from `page`, not `frame` — CDP screenshot only works on top-level targets.
- The webview frame takes ~10-15s to appear after VSCode starts. The `exec` command handles this automatically.
- The input uses Tiptap (ProseMirror), so use `pressSequentially` instead of `fill` for realistic typing. `fill` works for clearing.
