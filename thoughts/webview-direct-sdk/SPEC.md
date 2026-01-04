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

## Open Questions

1. **Error handling**: How to surface SDK errors in the UI?
2. **Reconnection**: What if the server restarts? Need to re-establish client.
3. **Workspace directory**: SDK needs `directory` param for events - pass from extension or read from SDK?

## Success Criteria

- [ ] SDK client works in webview
- [ ] All existing features work (sessions, prompts, permissions, streaming)
- [ ] ~400 lines of proxy code removed
- [ ] New SDK features (fork, share, etc.) available immediately
