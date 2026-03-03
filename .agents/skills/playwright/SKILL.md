---
name: playwright
description: |
  Browser automation CLI using Playwright. Use when automating browser workflows, filling forms, clicking elements, scraping pages, or debugging web issues.
---

# Browser Automation with Playwright

Use the `playwright-cli.ts` script bundled with this skill to automate web interactions and debug browser issues.

Run it with: `tsx .agents/skills/playwright/cli.ts`

## When to Use

- Pages require interaction, authentication, or dynamic content loading (instead of read_web_page)
- Debugging browser automation errors (clicks not working, selectors failing, elements not found)
- Testing interactions before codifying them in source files

## Commands

```bash
tsx .agents/skills/playwright/cli.ts open <url>          # Launch browser and navigate to URL
tsx .agents/skills/playwright/cli.ts exec <code>         # Execute Playwright TypeScript code
tsx .agents/skills/playwright/cli.ts snapshot            # Save full-page PNG + HTML to tmp/playwright-screenshots/
tsx .agents/skills/playwright/cli.ts list                # List open tabs
tsx .agents/skills/playwright/cli.ts close               # Close the browser
```

The exec command provides access to: `page`, `context`, `state`, `browser`, `snapshot`

## Example

```bash
tsx .agents/skills/playwright/cli.ts open https://example.com
tsx .agents/skills/playwright/cli.ts exec "await page.locator('button:has-text(\"Sign in\")').click()"
tsx .agents/skills/playwright/cli.ts exec "await page.fill('input[name=\"email\"]', 'user@example.com')"
tsx .agents/skills/playwright/cli.ts snapshot
tsx .agents/skills/playwright/cli.ts close
```

## Sessions & Profiles

Use `--session <name>` to run multiple isolated browser instances simultaneously.

Use `save <domain>` after logging in to persist cookies/localStorage for automatic reuse:

```bash
tsx .agents/skills/playwright/cli.ts open https://linkedin.com
# ... manually log in ...
tsx .agents/skills/playwright/cli.ts save linkedin.com
# Next time, profile is loaded automatically
```

## Connecting to the Extension Debug Session

Launch the extension in a background tmux session with CDP enabled:

```bash
pnpm debug:extension              # starts in tmux "opencode-debug", CDP on :9222
pnpm debug:extension --stop       # stops the session
```

Then connect Playwright to it:

```bash
tsx .agents/skills/playwright/cli.ts connect http://127.0.0.1:9222 --session extension
tsx .agents/skills/playwright/cli.ts exec "return await page.title()" --session extension
```

## Connecting to Other Browsers

Connect to any browser exposing a CDP endpoint:

```bash
tsx .agents/skills/playwright/cli.ts connect http://127.0.0.1:9222 --session my-session
tsx .agents/skills/playwright/cli.ts exec "return await page.title()" --session my-session
```
