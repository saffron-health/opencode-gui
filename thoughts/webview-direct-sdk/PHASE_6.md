# Phase 6: E2E Playwright Tests

## Goal
Make webview work standalone (for tests + future web app) with minimal changes.

## Strategy
Make existing shims environment-aware; same bundle runs in VSCode and browser.

---

## Step 1: Environment-aware shims

### `src/webview/utils/vscode.ts`
- Export `hasVscodeApi` boolean
- Return no-op stub when `acquireVsCodeApi` is undefined

### `src/webview/utils/proxyFetch.ts`
- If `!hasVscodeApi`, just return `fetch(input, init)` directly

### `src/webview/utils/proxyEventSource.ts`
- If `!hasVscodeApi`, use native `EventSource`

## Step 2: Standalone config

### `src/webview/hooks/useOpenCode.ts`
In `onMount`, check `window.OPENCODE_CONFIG` first:
```ts
const globalConfig = (window as any).OPENCODE_CONFIG;
if (globalConfig?.serverUrl) {
  initFromConfig(globalConfig);
  return; // skip VSCode handshake
}
```

## Step 3: Playwright setup

### New files
- `playwright.config.ts` — webServer runs `pnpm dev`
- `tests/e2e/fixtures.ts` — `openWebview()` helper that sets `window.OPENCODE_CONFIG`
- `tests/e2e/standalone.html` — minimal HTML with config script

### package.json
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

## Step 4: Add `data-testid` attributes

| Component | testid |
|-----------|--------|
| InputBar textarea | `input-textarea` |
| InputBar submit | `input-submit` |
| InputBar stop | `input-stop` |
| SessionSwitcher toggle | `session-switcher-toggle` |
| NewSessionButton | `new-session-button` |
| MessageList | `message-list` |
| MessageItem | `message-{user\|assistant}` |
| Permission card | `permission-card` |
| Permission buttons | `permission-allow-once`, `permission-reject` |

## Step 5: Core tests

- `tests/e2e/session.spec.ts` — create session
- `tests/e2e/prompt.spec.ts` — send prompt, receive response
- `tests/e2e/abort.spec.ts` — cancel streaming
- `tests/e2e/permissions.spec.ts` — permission flow

---

## Notes
- OpenCode server started manually (not mocked)
- CORS must be enabled for standalone origin
- VSCode integration tests (`@vscode/test-electron`) are separate scope — only for extension wiring, not webview DOM
