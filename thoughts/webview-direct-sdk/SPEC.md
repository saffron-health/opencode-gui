# Webview Direct SDK Architecture

## Summary

Refactor the extension so the webview communicates directly with the OpenCode server using `@opencode-ai/sdk`, instead of proxying all messages through the extension host via `postMessage`.

## Current Architecture

```
┌─────────────────────────────────────┐
│  Webview (SolidJS)                  │
│  └─ useVsCodeBridge hook            │
│     └─ postMessage ────────────────────┐
└─────────────────────────────────────┘  │
                                         ▼
┌─────────────────────────────────────┐
│  Extension Host                      │
│  ├─ OpenCodeViewProvider.ts         │ ◄── ~600 lines of message proxying
│  │   └─ switch/case for 12+ types   │
│  └─ OpenCodeService.ts              │
│      └─ SDK client ────────────────────┐
└─────────────────────────────────────┘  │
                                         ▼
┌─────────────────────────────────────┐
│  OpenCode Server (localhost:XXXX)   │
└─────────────────────────────────────┘
```

**Problems:**
1. Every SDK feature requires adding handlers in 3 places (webview types, bridge, ViewProvider)
2. ~400+ lines of boilerplate message proxying
3. Duplicated types between SDK and webview
4. Extension becomes bottleneck for new features

## Proposed Architecture

```
┌─────────────────────────────────────┐
│  Webview (SolidJS)                  │
│  └─ useOpenCode hook                │
│     └─ SDK client (HTTP/SSE) ──────────┐
└─────────────────────────────────────┘  │
                                         │
┌─────────────────────────────────────┐  │
│  Extension Host (minimal)            │  │
│  └─ Spawns server, sends URL ────────┼──┘
│  └─ Persists settings (globalState)  │
└─────────────────────────────────────┘  
                                         │
                                         ▼
┌─────────────────────────────────────┐
│  OpenCode Server (localhost:XXXX)   │
└─────────────────────────────────────┘
```

**Benefits:**
1. Webview gets full SDK API surface automatically
2. Remove ~400 lines of proxy code
3. SDK types used directly (no duplication)
4. New SDK features work immediately

## Implementation Plan

### Phase 1: Verify SDK Browser Compatibility

The SDK uses:
- `fetch()` for HTTP requests - ✅ works in browser
- Server-Sent Events for streaming - ✅ works in browser
- `createOpencodeClient(config)` - just needs `baseUrl`

**Test**: Import SDK in webview and verify it builds/runs.

### Phase 2: Update CSP

The webview's Content-Security-Policy must allow connections to localhost.

**Current CSP** (in OpenCodeViewProvider.ts):
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'none'; 
               style-src ${webview.cspSource} 'unsafe-inline'; 
               script-src 'nonce-${nonce}';">
```

**New CSP**:
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'none'; 
               style-src ${webview.cspSource} 'unsafe-inline'; 
               script-src 'nonce-${nonce}';
               connect-src http://127.0.0.1:* ws://127.0.0.1:*;">
```

### Phase 3: Minimal Extension Host

**New extension.ts responsibilities:**
1. Spawn OpenCode server via `createOpencode()`
2. Send server URL to webview on `ready` message
3. Persist agent selection via `globalState`
4. Handle any VSCode-specific APIs (open file, show notification, etc.)

**Simplified OpenCodeViewProvider.ts:**
```typescript
export class OpenCodeViewProvider implements vscode.WebviewViewProvider {
  private serverUrl?: string;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly globalState: vscode.Memento
  ) {}

  async setServerUrl(url: string) {
    this.serverUrl = url;
    // Send to webview if already mounted
    this._view?.webview.postMessage({ type: 'server-url', url });
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'out')]
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          if (this.serverUrl) {
            webviewView.webview.postMessage({ 
              type: 'server-url', 
              url: this.serverUrl 
            });
          }
          break;
        case 'persist-agent':
          await this.globalState.update('lastAgent', message.agent);
          break;
        case 'get-persisted-agent':
          webviewView.webview.postMessage({
            type: 'persisted-agent',
            agent: this.globalState.get('lastAgent')
          });
          break;
        // VSCode-specific actions (optional)
        case 'open-file':
          vscode.window.showTextDocument(vscode.Uri.file(message.path));
          break;
      }
    });
  }
}
```

### Phase 4: New Webview Hook

**New `useOpenCode.ts`:**
```typescript
import { createSignal, onMount, onCleanup } from 'solid-js';
import { createOpencodeClient, type OpencodeClient, type Event } from '@opencode-ai/sdk';

export function useOpenCode() {
  const [client, setClient] = createSignal<OpencodeClient | null>(null);
  const [isReady, setIsReady] = createSignal(false);

  onMount(() => {
    // Listen for server URL from extension
    window.addEventListener('message', (e) => {
      if (e.data.type === 'server-url') {
        const opencodeClient = createOpencodeClient({
          baseUrl: e.data.url
        });
        setClient(opencodeClient);
        setIsReady(true);
      }
    });

    // Request server URL
    vscode.postMessage({ type: 'ready' });
  });

  // High-level helpers that use the SDK directly
  async function sendPrompt(sessionId: string, text: string, agent?: string) {
    const c = client();
    if (!c) throw new Error('Not connected');

    const config = await c.config.get();
    const model = config.data?.model || 'anthropic/claude-sonnet-4-5-20250929';
    const [providerID, modelID] = model.split('/');

    return c.session.prompt({
      path: { id: sessionId },
      body: {
        model: { providerID, modelID },
        parts: [{ type: 'text', text }],
        agent
      }
    });
  }

  async function subscribeToEvents(
    directory: string,
    onEvent: (event: Event) => void
  ) {
    const c = client();
    if (!c) throw new Error('Not connected');

    const result = await c.event.subscribe({ query: { directory } });
    
    for await (const event of result.stream) {
      onEvent(event as Event);
    }
  }

  return {
    client,
    isReady,
    // Expose SDK methods directly
    listSessions: () => client()?.session.list(),
    getSession: (id: string) => client()?.session.get({ path: { id } }),
    createSession: () => client()?.session.create({ body: {} }),
    getAgents: () => client()?.app.agents(),
    getMessages: (id: string) => client()?.session.messages({ path: { id } }),
    sendPrompt,
    subscribeToEvents,
    respondToPermission: (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') =>
      client()?.postSessionIdPermissionsPermissionId({
        path: { id: sessionId, permissionID: permissionId },
        body: { response }
      }),
    abortSession: (id: string) => client()?.session.abort({ path: { id } }),
    revertToMessage: (sessionId: string, messageId: string) =>
      client()?.session.revert({ path: { id: sessionId }, body: { messageID: messageId } }),
  };
}
```

### Phase 5: Update App.tsx

Replace `useVsCodeBridge` with `useOpenCode`:

```typescript
function App() {
  const { 
    isReady, 
    listSessions, 
    getAgents, 
    sendPrompt, 
    subscribeToEvents,
    // ... etc
  } = useOpenCode();

  // Direct SDK calls instead of postMessage
  onMount(async () => {
    if (isReady()) {
      const agents = await getAgents();
      setAgents(agents.data || []);
      
      const sessions = await listSessions();
      setSessions(sessions.data || []);
    }
  });

  // ... rest of component using SDK directly
}
```

### Phase 6: E2E Playwright Tests

End-to-end tests for the webview, running against a manually-started OpenCode server.

#### Approach

Since the webview now communicates directly with the OpenCode server via HTTP/SSE (after Phase 4), we can test the webview UI in a standalone browser context—no VSCode extension host required for most tests.

**Test harness architecture:**
```
┌─────────────────────────────────────┐
│  Playwright Browser                 │
│  └─ Loads webview HTML directly     │
│     └─ SDK client (HTTP/SSE) ──────────┐
└─────────────────────────────────────┘  │
                                         ▼
┌─────────────────────────────────────┐
│  OpenCode Server (manually started) │
│  └─ Running at localhost:XXXX       │
└─────────────────────────────────────┘
```

#### Prerequisites

1. **OpenCode server running**: Tests assume the server is already running at a configurable URL (e.g., `OPENCODE_URL=http://127.0.0.1:XXXX`)
2. **Webview build**: The webview must be built (`pnpm build`)

#### Test Setup

**New files:**
- `tests/e2e/playwright.config.ts` - Playwright configuration
- `tests/e2e/fixtures.ts` - Shared test fixtures and helpers
- `tests/e2e/webview.spec.ts` - Main test suite

**`playwright.config.ts`:**
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:5173', // Vite dev server or static serve
  },
  webServer: {
    command: 'pnpm serve-webview', // Serve built webview for tests
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
```

**`fixtures.ts`:**
```typescript
import { test as base, expect } from '@playwright/test';

export const test = base.extend<{
  openCodeUrl: string;
}>({
  openCodeUrl: async ({}, use) => {
    const url = process.env.OPENCODE_URL || 'http://127.0.0.1:1337';
    // Optionally verify server is reachable
    await use(url);
  },
});

export { expect };
```

#### Test Cases

**Core functionality (`webview.spec.ts`):**

```typescript
import { test, expect } from './fixtures';

test.describe('Webview E2E', () => {
  test.beforeEach(async ({ page, openCodeUrl }) => {
    // Navigate to webview and inject server URL
    await page.goto('/');
    await page.evaluate((url) => {
      window.postMessage({ type: 'server-url', url }, '*');
    }, openCodeUrl);
  });

  test('displays agent selector when connected', async ({ page }) => {
    await expect(page.getByTestId('agent-selector')).toBeVisible();
  });

  test('can create a new session', async ({ page }) => {
    await page.getByRole('button', { name: /new session/i }).click();
    await expect(page.getByTestId('message-input')).toBeVisible();
  });

  test('can list existing sessions', async ({ page }) => {
    await expect(page.getByTestId('session-list')).toBeVisible();
  });

  test('can send a prompt and receive streaming response', async ({ page }) => {
    // Create or select session
    await page.getByRole('button', { name: /new session/i }).click();
    
    // Type and send message
    await page.getByTestId('message-input').fill('Hello, world!');
    await page.getByRole('button', { name: /send/i }).click();
    
    // Wait for response to start streaming
    await expect(page.getByTestId('assistant-message')).toBeVisible({ timeout: 30000 });
  });

  test('can abort an in-progress session', async ({ page }) => {
    await page.getByRole('button', { name: /new session/i }).click();
    await page.getByTestId('message-input').fill('Write a long essay');
    await page.getByRole('button', { name: /send/i }).click();
    
    // Wait for streaming to start, then abort
    await expect(page.getByRole('button', { name: /stop/i })).toBeVisible();
    await page.getByRole('button', { name: /stop/i }).click();
    
    // Verify session is no longer active
    await expect(page.getByRole('button', { name: /send/i })).toBeEnabled();
  });

  test('handles permission requests', async ({ page }) => {
    // Trigger a tool that requires permission
    await page.getByRole('button', { name: /new session/i }).click();
    await page.getByTestId('message-input').fill('Read the file README.md');
    await page.getByRole('button', { name: /send/i }).click();
    
    // Wait for permission dialog
    await expect(page.getByTestId('permission-dialog')).toBeVisible({ timeout: 30000 });
    
    // Approve permission
    await page.getByRole('button', { name: /allow once/i }).click();
    
    // Verify permission was handled
    await expect(page.getByTestId('permission-dialog')).not.toBeVisible();
  });
});
```

#### Running Tests

**package.json scripts:**
```json
{
  "scripts": {
    "serve-webview": "vite preview --port 5173",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

**Usage:**
```bash
# 1. Start OpenCode server manually in a separate terminal
opencode

# 2. Run e2e tests (server assumed at http://127.0.0.1:1337)
pnpm test:e2e

# Or specify custom server URL
OPENCODE_URL=http://127.0.0.1:9999 pnpm test:e2e
```

#### Serving the Webview

Since the webview normally runs inside VSCode, we need a way to serve it standalone for Playwright:

**Option A: Vite dev server / preview**
- Run `pnpm serve-webview` which uses `vite preview` to serve the built `out/` directory
- Webview HTML needs a small shim to work outside VSCode (mock `acquireVsCodeApi`)

**Option B: Custom test HTML**
- Create `tests/e2e/test-harness.html` that loads the webview bundle with mocked VSCode API

**Recommended: Option A with shim**

Add to webview entry point:
```typescript
// src/webview/index.tsx
declare global {
  interface Window {
    acquireVsCodeApi?: () => { postMessage: (msg: unknown) => void };
  }
}

// Mock for standalone testing
if (!window.acquireVsCodeApi) {
  window.acquireVsCodeApi = () => ({
    postMessage: (msg: unknown) => {
      console.log('[Mock VSCode API]', msg);
    }
  });
}
```

#### Data-testid Conventions

Add `data-testid` attributes to key components for reliable test selectors:

| Component | data-testid |
|-----------|-------------|
| Agent dropdown | `agent-selector` |
| Session list | `session-list` |
| Message input | `message-input` |
| Send button | `send-button` |
| Stop/abort button | `abort-button` |
| Assistant message | `assistant-message` |
| Permission dialog | `permission-dialog` |

#### CI Integration (Future)

For CI, the OpenCode server would need to be started automatically:

```yaml
# .github/workflows/e2e.yml
jobs:
  e2e:
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm build
      - run: pnpm exec playwright install --with-deps
      # Start opencode server in background (would need mock or test mode)
      - run: pnpm test:e2e
```

**Note**: Full CI integration may require a mock OpenCode server or test mode to avoid real LLM calls.

#### Success Criteria

- [ ] Playwright configured and running
- [ ] Webview can be served standalone for testing
- [ ] Tests pass with manually-started OpenCode server
- [ ] Core flows covered: session create, prompt/response, abort, permissions
- [ ] `data-testid` attributes added to key components

## Files to Modify

| File | Change |
|------|--------|
| `src/OpenCodeViewProvider.ts` | Reduce from ~600 to ~80 lines |
| `src/OpenCodeService.ts` | **Delete** - no longer needed |
| `src/extension.ts` | Simplify to just spawn server |
| `src/webview/hooks/useVsCodeBridge.ts` | **Delete** - replaced |
| `src/webview/hooks/useOpenCode.ts` | **New** - SDK wrapper |
| `src/webview/App.tsx` | Use `useOpenCode` instead |
| `src/webview/types.ts` | Remove duplicated types, import from SDK |

## Types Cleanup

**Before**: `src/webview/types.ts` duplicates SDK types
**After**: Import directly from SDK

```typescript
// Before
export interface Session { id: string; title: string; ... }
export interface Agent { name: string; ... }

// After
export type { Session, Agent, Event, Message } from '@opencode-ai/sdk';
```

## Remaining Extension Responsibilities

The extension host still handles:

1. **Server lifecycle**: Spawn/close OpenCode server
2. **Workspace path**: Get `vscode.workspace.workspaceFolders`
3. **Settings persistence**: `globalState` for agent selection
4. **VSCode commands**: Open files, show notifications, etc.

## Migration Strategy

1. **Phase 1-2**: Add CSP, verify SDK works in webview (non-breaking)
2. **Phase 3**: Create `useOpenCode` hook alongside existing code
3. **Phase 4**: Migrate App.tsx to use new hook
4. **Phase 5**: Delete old proxy code
5. **Phase 6**: E2E Playwright tests for webview

## Implementation Status (Completed)

### What Was Done

**Phase 5 completed** - Webview now uses SDK directly with fetch proxy for CORS bypass.

**Files changed:**
- `src/webview/hooks/useOpenCode.ts` - SDK client with proxyFetch, native EventSource for SSE
- `src/webview/utils/proxyFetch.ts` - Routes fetch through extension via postMessage (30s timeout, cleanup on unload)
- `src/webview/utils/vscode.ts` - Shared acquireVsCodeApi instance
- `src/OpenCodeViewProvider.ts` - Reduced to ~190 lines: init, agent persistence, proxyFetch handler with strict origin validation
- `src/OpenCodeService.ts` - Reduced to ~120 lines: server spawn only
- `src/webview/App.tsx` - Uses useOpenCode instead of useVsCodeBridge
- Deleted: `src/webview/hooks/useVsCodeBridge.ts`

**CORS workaround:**
- OpenCode server doesn't return `Access-Control-Allow-Origin` for `vscode-webview://` origins
- Solution: proxyFetch routes API calls through extension host (which has no CORS)
- SSE uses native EventSource which may have different CORS behavior

**Bundle size reduction:**
- Extension: 64KB → 44KB (~30% smaller)
- ~400 lines of proxy code removed

## Open Questions

1. **Reconnection**: What if the server restarts? Need to re-establish client.
2. **Streaming via proxy**: Currently only text responses supported; binary/streaming would need chunked messages.

## Success Criteria

- [x] SDK client works in webview
- [x] All existing features work (sessions, prompts, permissions, streaming)
- [x] ~400 lines of proxy code removed
- [x] New SDK features available immediately
- [ ] E2E Playwright tests passing for core webview flows
