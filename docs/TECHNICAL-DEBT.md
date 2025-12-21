# Technical Debt & Architecture Limitations

This document outlines the major technical debt items in the OpenCode VSCode extension, their impact, and recommended approaches for fixing them. Each section includes references to relevant files and a concrete plan for improvement.

---

## 1. Type Safety - Pervasive Use of `any` and `unknown`

**Problem:**
The codebase has extensive use of `any` and `unknown` types, particularly around SDK event handling, message passing between webview and extension, and configuration responses. Event properties are cast with `(event as any).properties`, incoming messages use `raw: any`, and diff objects lack type definitions. This means TypeScript cannot catch structural changes from SDK upgrades or message schema drift, leading to silent runtime failures.

**Impact:**
- Breaking changes in `@opencode-ai/sdk` event shapes go undetected until runtime
- Message passing between webview and extension has no compile-time safety
- Refactoring is dangerous because you can't trust the type checker
- New developers can't rely on IntelliSense to understand data structures

**Files to Review:**
- [`src/OpenCodeService.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeService.ts) - Lines 9, 389-405, 342, 369, 407
- [`src/OpenCodeViewProvider.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeViewProvider.ts) - Lines 87, 186-187, 200-208, 393, 411, 448, 528, 560-564
- [`src/webview/App.tsx`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/App.tsx) - Lines 90-100, 114, 213-221, 238
- [`src/webview/hooks/useVsCodeBridge.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/hooks/useVsCodeBridge.ts) - Line 4
- [`src/webview/types.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/types.ts) - Line 14

**Recommended Fix:**
Create a shared type library with runtime validation using zod. Start by defining precise types for:
1. SDK Event shapes you depend on (create discriminated unions for `SessionUpdatedEvent`, `PartUpdatedEvent`, `PermissionUpdatedEvent`, etc.)
2. Message payloads crossing webview/extension boundary (already have `HostMessage` and `WebviewMessage` unions, but add zod schemas)
3. Configuration structures (provider/model/limits)
4. Message info and parts (create `MessageInfo` and `PartInfo` interfaces)

Add validation at boundaries: validate incoming events in `_handleStreamEvent()`, validate webview messages in `onDidReceiveMessage()`, and validate extension messages in the webview message handler. Create typed adapter functions like `normalizeMessage(raw: unknown): Message` that handle the `m.info ?? m` pattern safely. Replace all `any` casts with proper type guards or adapters. Consider creating a `src/shared/` directory with schemas that can be used by both extension and webview code.

---

## 2. No Runtime Message Validation

**Problem:**
While TypeScript types exist for messages passing between webview and extension (`HostMessage` and `WebviewMessage` unions), there's no runtime validation. Messages are just `postMessage()`'d across the boundary and blindly trusted. Additionally, the type definitions don't always match what's actually sent—for example, `defaultAgent` is sent in the `agentList` message but the TypeScript type doesn't include it.

**Impact:**
- Typos in message type strings cause silent failures
- Schema changes between extension and webview versions can break in production
- Malformed messages from webview won't be caught, leading to crashes
- Type/runtime mismatches undermine confidence in the type system

**Files to Review:**
- [`src/OpenCodeViewProvider.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeViewProvider.ts) - Lines 42-78 (message handler), 129-133 (agentList), 560-564 (_sendMessage)
- [`src/webview/hooks/useVsCodeBridge.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/hooks/useVsCodeBridge.ts) - Lines 26-96 (message handler)
- [`src/webview/types.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/types.ts) - Lines 92-117 (message type definitions)

**Recommended Fix:**
Create a `src/shared/messages.ts` file with zod schemas for all message types. Define schemas like `const SendPromptSchema = z.object({ type: z.literal('sendPrompt'), text: z.string(), agent: z.string().nullable() })` for each message type. In the webview message handler, wrap the switch statement with validation: `const result = HostMessageSchema.safeParse(event.data); if (!result.success) { console.error('Invalid message', result.error); return; }`. Do the same in the extension's `onDidReceiveMessage()`. Fix the type/runtime mismatch by updating the TypeScript definitions to match what's actually sent (add `defaultAgent?: string` to the `agentList` message type). Add a message version field (e.g., `version: '1.0'`) to support graceful degradation in future schema changes. Consider creating a `MessageBridge` class that encapsulates validation and provides typed `send()` methods on both sides.

---

## 3. Global State That Should Be Per-Session

**Problem:**
Several pieces of state are global when they should be tracked per-session. `isThinking` is a single boolean, so if you switch sessions while one is processing, the new session shows a thinking indicator even though it's not processing. `pendingPermissions` is a global Map that accumulates permissions from all sessions, never clearing old ones when switching sessions. The `_activeSessionId` in the view provider duplicates `currentSessionId` in the service, creating two sources of truth.

**Impact:**
- Switching sessions mid-stream shows incorrect UI state (thinking indicator on wrong session)
- Stale permissions from other sessions clutter the permissions map and could cause bugs
- Duplicate session tracking makes it unclear which is authoritative
- Testing session switching is hard because state isn't properly isolated

**Files to Review:**
- [`src/webview/App.tsx`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/App.tsx) - Lines 17 (isThinking), 35 (pendingPermissions), 67-69 (hasMessages check)
- [`src/OpenCodeViewProvider.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeViewProvider.ts) - Lines 11 (_activeSessionId), 169 (session switching), 332-390 (_handleSendPrompt)
- [`src/OpenCodeService.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeService.ts) - Lines 30 (currentSessionId)

**Recommended Fix:**
Change `isThinking` to `Map<string, boolean>` keyed by session ID. Derive the UI state with `const isCurrentSessionThinking = () => isThinking().get(currentSessionId() ?? '') ?? false`. Update the thinking state when receiving events filtered by session ID. For permissions, change `pendingPermissions` to also be keyed by session ID: `Map<string, Map<string, Permission>>` or create a composite key like `${sessionId}:${callID}`. Clear permissions for a session when switching away from it in the `onSessionSwitched` callback. For session ID tracking, make `OpenCodeService` the single source of truth—remove `_activeSessionId` from the view provider and query the service directly when needed, or maintain it as a cache but always sync from the service on switch/create operations. Add explicit lifecycle methods like `onSessionActivated(sessionId)` to coordinate state cleanup across components.

---

## 4. Fragile SSE Event Stream Handling

**Problem:**
The SSE event handling has multiple issues. The stop condition in `sendPromptStreaming()` breaks the loop on `session.idle` even when the event's `sessionID` is missing or doesn't match, potentially stopping streams prematurely. The `_getEventSessionId()` method tries six different property paths because event shapes are inconsistent. Each prompt creates a new SSE subscription which adds overhead and might miss out-of-band events like session updates or permissions for other operations.

**Impact:**
- Streams can stop early due to idle events from other sessions or system events
- Difficult to debug which events are being filtered and why
- Performance overhead from creating/destroying SSE connections for each prompt
- Risk of missing events if they arrive between subscription and prompt
- New developers won't understand why events have so many possible shapes

**Files to Review:**
- [`src/OpenCodeService.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeService.ts) - Lines 279-381 (sendPromptStreaming), 340-361 (SSE loop), 315-318 (SSE subscribe)
- [`src/OpenCodeViewProvider.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeViewProvider.ts) - Lines 392-399 (_getEventSessionId), 401-515 (_handleStreamEvent)

**Recommended Fix:**
First, fix the immediate bug: change the stop condition from `if (typedEvent.type === 'session.idle') break;` to `if (evSessionID === sid && typedEvent.type === 'session.idle') break;` to only stop when the target session goes idle. Create typed event adapters with type guards: `function isSessionIdleEvent(event: Event): event is SessionIdleEvent` that validate structure. Replace `_getEventSessionId()` with these adapters so you're working with known event shapes.

For the architecture, consider moving to a single long-lived SSE subscription per workspace that's established during service initialization. Create a `StreamingController` class that manages the subscription and routes events to listeners by session ID. This controller would have methods like `addSessionListener(sessionId, callback)` and `removeSessionListener(sessionId)`. The view provider would register/unregister listeners as sessions are created/switched. This avoids connection overhead and ensures you never miss events. If a long-lived connection isn't feasible, at least move the subscription lifecycle to match the session lifecycle (subscribe when session created, unsubscribe when switched away) rather than per-prompt. Add explicit error recovery: if the SSE connection drops, show a notification and attempt to reconnect with exponential backoff.

---

## 5. OpenCodeViewProvider God Object (600+ Lines)

**Problem:**
The `OpenCodeViewProvider` class handles too many responsibilities: webview lifecycle, message routing, session management, SSE streaming coordination, context info calculations, file change summaries, and UI updates. At over 600 lines, it violates the Single Responsibility Principle and makes testing, debugging, and maintenance difficult. When something breaks, you have to read through the entire class to understand the flow.

**Impact:**
- Hard to unit test because everything is tightly coupled
- Changes in one area (e.g., streaming) risk breaking another (e.g., session management)
- New developers face a steep learning curve understanding all the responsibilities
- Duplicated logic (e.g., session title handling appears in multiple methods)
- Difficult to add features without making the class even larger

**Files to Review:**
- [`src/OpenCodeViewProvider.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeViewProvider.ts) - Entire file, particularly:
  - Lines 20-79 (resolveWebviewView + message routing)
  - Lines 81-114 (_handleReady)
  - Lines 151-238 (session management handlers)
  - Lines 332-390 (_handleSendPrompt)
  - Lines 401-515 (_handleStreamEvent)
  - Lines 528-558 (_updateContextInfo)

**Recommended Fix:**
Split the class into focused modules using composition. Create:

1. **MessageRouter** - Handles `onDidReceiveMessage` and dispatches to command handlers. Each command becomes a method like `handleSendPrompt(message)`.

2. **SessionController** - Manages session lifecycle (create, switch, list) and coordinates with the service. Emits events like `onSessionChanged`.

3. **StreamingController** - Manages SSE subscription, event filtering by session, and routes events to registered handlers. Provides `startStreaming(sessionId, callback)` and `stopStreaming(sessionId)`.

4. **UIStatePublisher** - Marshals data into `HostMessage` types and sends to webview. Methods like `publishThinkingState()`, `publishSessionList()`, etc.

5. **ContextManager** - Calculates context info and file change summaries, caches model limits.

The refactored `OpenCodeViewProvider` becomes a thin coordinator that wires these components together and manages the webview lifecycle. Each component can be unit tested in isolation. Start by extracting the easiest piece (probably `UIStatePublisher`), then progressively move more logic out. Use dependency injection to pass the `OpenCodeService` and `vscode.Memento` to the components that need them. Consider using events/callbacks for component communication rather than direct method calls to reduce coupling.

---

## 6. Inconsistent Message Shape Handling

**Problem:**
Throughout the codebase, incoming messages from the OpenCode SDK are handled inconsistently. Sometimes the message is accessed as `m.info`, sometimes as just `m`, and sometimes as `raw.info ?? raw`. Parts are accessed as `raw.parts ?? m.parts ?? []`. This pattern appears in multiple places (App.tsx initialization, session switching, message rendering) and makes it unclear what the canonical message shape is. There's no centralized normalization logic.

**Impact:**
- Bugs are introduced when one location uses the wrong pattern
- Refactoring is error-prone because you have to find all variations
- New developers don't know which pattern to use
- Adding new message fields requires updating multiple locations
- Dead code paths exist (e.g., `onResponse` callback) because streaming changed the shape

**Files to Review:**
- [`src/webview/App.tsx`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/App.tsx) - Lines 88-110 (onInit message normalization), 213-234 (onSessionSwitched), 175-185 (onResponse - dead code)
- [`src/OpenCodeViewProvider.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeViewProvider.ts) - Lines 88-94 (loading messages)
- [`src/OpenCodeService.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeService.ts) - Lines 389-405 (getMessages)

**Recommended Fix:**
Create a single message normalization function in a shared utilities file: `function normalizeMessage(raw: unknown): Message`. This function should handle all variations of the message shape and return a consistent structure. Define a clear contract for what a "normalized message" looks like (id, role, text, parts). Use this normalizer at every point where messages come from the backend: in `_handleReady()`, `_handleSwitchSession()`, and in the App's `onInit` and `onSessionSwitched` callbacks.

Update `OpenCodeService.getMessages()` to return properly typed messages rather than `Array<{ info: unknown; parts: unknown[] }>`. If the SDK doesn't provide clear types, define your own `RawMessage` interface that documents the variations, then use the normalizer to convert to the canonical shape. Remove the dead `onResponse` callback path in App.tsx (lines 175-185) since streaming mode never triggers it—or gate it behind a feature flag if non-streaming mode is still supported. Document the expected message structure in a comment or type definition so it's clear why normalization is needed. Consider contributing clearer types back to the `@opencode-ai/sdk` if the shapes are stable but undocumented.

---

## 7. Missing Error Handling and Recovery

**Problem:**
Several operations lack proper error handling and recovery mechanisms. In `sendPromptStreaming()`, if the SSE loop throws an error before the prompt completes, the prompt may still be running on the backend with no way to abort it. When `_handleEditPreviousMessage()` optimistically truncates messages before reverting, if the revert fails, the messages aren't restored, leaving the UI in a broken state. Permission response errors in `respondToPermission()` don't provide user feedback or retry options—the UI removes the permission immediately, assuming success. The `_updateContextInfo()` method assumes a deeply nested config structure without optional chaining, risking crashes if the structure changes.

**Impact:**
- Users see spinning indicators forever when operations fail silently
- Edit operations can leave the UI in an inconsistent state with no recovery
- Permission failures are invisible to users, leading to confusion
- Config structure changes crash the context display
- Debugging is hard because errors are swallowed or logged inconsistently

**Files to Review:**
- [`src/OpenCodeService.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeService.ts) - Lines 336-381 (sendPromptStreaming error paths), 466-487 (abortSession)
- [`src/OpenCodeViewProvider.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeViewProvider.ts) - Lines 253-309 (_handleEditPreviousMessage), 240-252 (_handlePermissionResponse), 528-558 (_updateContextInfo)
- [`src/webview/App.tsx`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/App.tsx) - Lines 346-375 (handleSubmitEdit), 377-429 (handlePermissionResponse)

**Recommended Fix:**
For SSE/prompt coordination, wrap the SSE loop in a try-catch and call `abortSession()` if the SSE fails before the prompt completes. Add a flag to track if the prompt is still running and clean it up in the finally block. Make `sendPromptStreaming()` return a cleanup function or AbortController that can be called to cancel both the SSE subscription and the prompt.

For edit-revert safety, snapshot the messages array before optimistic truncation: `const preEditSnapshot = [...messages()];`. Wrap the revert + prompt logic in try-catch and restore from snapshot on error: `catch (error) { setMessages(preEditSnapshot); /* show error */ }`. Show a notification to the user explaining what went wrong.

For permissions, defer removing from `pendingPermissions` until you receive a confirmation event (`permission.replied`). Show the permission as "submitting" with a spinner while waiting for confirmation. If `respondToPermission()` throws, show an error banner with a "Retry" button that calls the method again. Add timeout handling for permissions that never get a reply.

For context info, add comprehensive optional chaining: `const contextLimit = configResult?.providers?.[providerID]?.models?.[modelID]?.limit?.context ?? this._currentModelContextLimit;`. Cache the limit by model ID so you don't re-query config on every message. Add fallback UI when context info can't be calculated: show "Context: unknown" or hide the indicator entirely rather than crashing. Consider making `_updateContextInfo()` async and showing a loading state if the config fetch is slow.

---

## 8. Hard-Coded Model String Will Become Stale

**Problem:**
The default model is hard-coded as `"anthropic/claude-sonnet-4-5-20250929"` in two places in `OpenCodeService.ts`. This date-versioned model string will become outdated as new models are released. When the model is deprecated or the SDK changes its default, prompts will fail with unclear errors. Users might not realize they need to update their config because the extension appears to have a built-in default.

**Impact:**
- Extension breaks when the hard-coded model is retired
- Users get cryptic "model not found" errors from the API
- Maintenance burden to update the string with each model release
- Inconsistent with the config-driven design of OpenCode

**Files to Review:**
- [`src/OpenCodeService.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeService.ts) - Lines 254, 303 (hard-coded model fallback)

**Recommended Fix:**
Remove the hard-coded model string and rely on the OpenCode SDK or config to provide a default. If `config?.model` is undefined, query the SDK for its current default model rather than falling back to a string. If the SDK doesn't expose a default, fail explicitly with a clear error message: "No model configured. Please set a model in your opencode.json or run `opencode config set model <provider/model>`." This makes the configuration requirement explicit rather than hiding it behind a stale default. Alternatively, fetch the list of available models from the config providers and pick the first one, but document this behavior clearly. Consider adding a UI affordance when no model is configured: show a notification with a link to the config docs or a button that opens the config file. If you must have a fallback, use a symbolic name like `"default"` and let the backend resolve it, or query the SDK's model catalog for the "latest" model of a given capability tier.

---

## 9. Permission Lifecycle Is Unclear and Inconsistent

**Problem:**
The permission flow uses a complex key system (`callID` or `permissionID` as fallback) that isn't well documented. Permissions are stored in `pendingPermissions` Map keyed by either `callID` or `id`, then removed immediately when the user responds, before confirmation from the backend. The search logic in `handlePermissionResponse()` iterates through the entire Map to find a permission by ID, which is inefficient and fragile. The relationship between tool parts (which have `callID`) and permission events isn't explicit, making it hard to match them up.

**Impact:**
- New developers don't understand why permissions use two different key types
- UI state gets out of sync if the backend rejects the response
- Performance degrades with many pending permissions (O(n) search)
- Stale permissions accumulate if events are missed
- Hard to implement features like "show all pending permissions" or "retry failed permission"

**Files to Review:**
- [`src/webview/App.tsx`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/App.tsx) - Lines 35 (pendingPermissions), 272-284 (onPermissionRequired), 377-429 (handlePermissionResponse)
- [`src/OpenCodeViewProvider.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeViewProvider.ts) - Lines 452-467 (permission.updated event), 468-473 (permission.replied event)
- [`src/webview/components/parts/ToolCall.tsx`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/components/parts/ToolCall.tsx) - Permission lookup by callID

**Recommended Fix:**
Standardize on a single key type for permissions. Since `callID` connects permissions to specific tool calls, use it as the primary key and fall back to `id` only if `callID` is missing. Update the Map insertion to: `const key = permission.callID ?? permission.id;`. Document this decision in a comment explaining that `callID` is preferred because it matches tool parts.

Change the removal logic to defer until backend confirmation. Add a `status` field to the Permission type: `'pending' | 'submitting' | 'resolved'`. When the user clicks a button, set status to `'submitting'` and show a spinner. Only remove the permission when you receive a `permission.replied` event matching the `permissionID`. If the API call fails, revert to `'pending'` and show an error. Add a timeout (e.g., 10 seconds) after which you show a warning that the permission response wasn't confirmed.

Replace the O(n) search with direct Map lookups by restructuring the data. If you need to look up by both `permissionID` and `callID`, maintain two maps: `pendingPermissionsByCall` and `permissionsById` that point to the same Permission objects. Or create a `PermissionManager` class that encapsulates this logic with methods like `add(permission)`, `findByCall(callID)`, `findById(permissionID)`, `remove(permissionID)`. Add cleanup logic to remove stale permissions (e.g., older than 5 minutes) to prevent memory leaks. Document the entire permission lifecycle in a flowchart: tool starts → permission.updated event → UI renders → user responds → permission-response message → backend processes → permission.replied event → UI removes.

---

## 10. Broken Filter Logic and Dead Code

**Problem:**
The `sessionsToShow` computed value in App.tsx has a filter condition that is always true: `filter(s => s.id !== currentSessionId() || currentSessionId() !== null)`. This was intended to hide the current session from the list, but the logic is wrong—it never filters anything out. The `onResponse` callback (lines 175-185) is dead code that's never called because the extension only uses streaming mode, but it's still wired up in the bridge. These issues indicate confusion about the intended behavior and make the codebase harder to understand.

**Impact:**
- Sessions list shows all sessions including the active one (may or may not be desired)
- Dead code adds maintenance burden and confuses new developers
- Unclear what the intended UX is for the session list
- Type definitions include message types that are never used

**Files to Review:**
- [`src/webview/App.tsx`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/App.tsx) - Lines 71-74 (sessionsToShow), 175-185 (onResponse)
- [`src/webview/hooks/useVsCodeBridge.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/hooks/useVsCodeBridge.ts) - Lines 59-64 (onResponse handler)
- [`src/webview/types.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/types.ts) - Line 98 (response message type)

**Recommended Fix:**
Decide on the intended UX for the sessions list. If the current session should be hidden, fix the filter to: `const sessionsToShow = createMemo(() => sessions().filter(s => s.id !== currentSessionId()));`. If all sessions should be shown (current approach), remove the filter entirely and rename to just `sessions()` or `sessionsForSwitcher()` for clarity. Add a comment explaining the decision.

For the dead `onResponse` code, remove it entirely if streaming is the only mode. Delete the callback from `VsCodeBridgeCallbacks`, remove the handler in `useVsCodeBridge.ts`, and remove the message type from `HostMessage` union. If there's any chance non-streaming mode will be supported, add a feature flag and gate the code behind it with a clear TODO comment. Run a search for "response" message type to ensure no other code depends on it.

Review the rest of the message types and callbacks to identify other dead code. Use your editor's "Find All References" feature to verify each message type is actually sent from the extension. Remove unused types to keep the API surface minimal and clear. Add JSDoc comments to the remaining message types explaining when they're sent and what triggers them.

---

## 11. Documentation Doesn't Match Implementation

**Problem:**
The AGENTS.md file and other documentation mentions React as the webview framework, but the actual implementation uses SolidJS. This creates confusion for new developers who might expect React patterns and APIs. The SDK types and event handling patterns aren't documented anywhere, so developers have to reverse-engineer how events flow through the system. The permission system, message normalization patterns, and session lifecycle aren't explained in any docs.

**Impact:**
- New developers waste time looking for React-specific code
- People might add React dependencies thinking that's the framework
- No single source of truth for architecture decisions
- Contributors don't understand event flow without reading all the code
- Hard to onboard new team members

**Files to Review:**
- [`AGENTS.md`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/AGENTS.md) - Line mentioning React
- [`README.md`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/README.md) - Architecture documentation
- [`src/webview/`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/) - All SolidJS code

**Recommended Fix:**
Update all documentation to accurately reflect SolidJS as the webview framework. In AGENTS.md, change references from "React" to "SolidJS" and note the key differences (signals vs hooks, JSX compilation, etc.). Add a new `docs/ARCHITECTURE.md` document that explains:

1. The two-process architecture (extension host vs webview)
2. Message passing contracts and the HostMessage/WebviewMessage types
3. How SSE streaming works and the event flow
4. Session lifecycle and state management
5. The permission system and how callID/permissionID relate to tool parts
6. Why message normalization is needed and when to use it

Create a `docs/CONTRIBUTING.md` that covers:
- How to add a new message type (add to types, add zod schema, add handler on both sides)
- How to handle new SDK event types (create adapter, add type guard, update _handleStreamEvent)
- Testing strategy for streaming edge cases
- How to debug message passing (enable verbose logging, use VSCode webview dev tools)

Add JSDoc comments to key interfaces like `Message`, `Permission`, `ToolState` explaining their purpose and lifecycle. Include links to relevant OpenCode SDK docs for developers who need to understand the backend. Consider creating sequence diagrams for complex flows like "sending a prompt with permissions" or "editing a previous message" using mermaid syntax that renders on GitHub.

---

## 12. Logging Infrastructure Is Inconsistent

**Problem:**
The codebase uses a mix of `console.log`, `logger.info()` from the extension's VSCode output channel, and a webview logger that sends "log" messages that are never handled by the extension. There's extensive logging in both webview and extension code, but no consistent format, severity levels, or ability to filter logs. The webview logger imports aren't actually functional because the extension doesn't listen for "log" message types.

**Impact:**
- Can't control log verbosity in production
- Webview logs don't appear in the extension output channel
- Hard to debug production issues without flooding console
- Logs don't have consistent timestamps or context (session ID, message ID)
- No structured logging for analytics or error tracking

**Files to Review:**
- [`src/webview/utils/logger.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/webview/utils/logger.ts) - Unused logger implementation
- [`src/extension.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/extension.ts) - Lines 5-9 (getLogger)
- [`src/OpenCodeService.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeService.ts) - Lines 8-18 (debugLog), various console.log calls
- [`src/OpenCodeViewProvider.ts`](file:///Users/tanishqkancharla/Documents/Projects/saffron-health/opencode-gui/src/OpenCodeViewProvider.ts) - Many console.log calls throughout

**Recommended Fix:**
Standardize on the VSCode output channel as the primary logging destination. Remove or fix the webview logger by adding a handler in `OpenCodeViewProvider.onDidReceiveMessage()` for "log" message types that forwards to the extension logger. Or, remove the webview logger entirely and rely on console.log in development, stripping logs in production builds.

Add a `Logger` class that wraps the VSCode logger with structured logging methods: `logger.info(message, context)`, `logger.error(error, context)`, `logger.debug(message, context)`. The context object should include relevant IDs (sessionId, messageId, userId) and be automatically serialized. Add log levels that can be controlled via extension settings: `opencode.logLevel: 'error' | 'warn' | 'info' | 'debug'`.

Replace all `console.log` calls with the structured logger. Use template strings with context objects instead of string concatenation: `logger.debug('Sending prompt', { sessionId, promptLength: text.length, agent })`. Add timing logs for performance-sensitive operations like SSE connection, prompt send, and session switching. Consider integrating with VSCode's telemetry API for error reporting (with user consent).

For production builds, add a Vite plugin that strips debug/info logs from the webview bundle. Add a development mode flag that enables verbose logging. Document how to enable debug logging in TROUBLESHOOTING.md.

---

## Quick Wins (Prioritized)

These fixes can be implemented independently and provide immediate value:

1. **Fix SSE idle condition** (5 min) - Change stop condition to only break on matching session ID
2. **Fix sessionsToShow filter** (2 min) - Remove broken filter logic
3. **Remove dead onResponse code** (10 min) - Delete unused callback and message type
4. **Add defaultAgent to type** (2 min) - Fix type/runtime mismatch in agentList message
5. **Document SolidJS usage** (10 min) - Update AGENTS.md to reflect actual framework
6. **Add optional chaining in _updateContextInfo** (5 min) - Prevent crashes from config shape changes

## Medium-Term Refactors (2-3 weeks)

These require more planning but significantly improve maintainability:

1. **Shared zod schemas** - Add runtime validation for all messages and events
2. **Per-session state** - Make thinking and permissions per-session Maps
3. **Message normalizer** - Centralize inconsistent message shape handling
4. **Split OpenCodeViewProvider** - Extract StreamingController, SessionController, etc.
5. **Long-lived SSE subscription** - Move from per-prompt to per-workspace streaming
6. **Permission lifecycle refactor** - Defer removal until confirmation, add status tracking

## Long-Term Improvements (1-2 months)

These are larger architectural changes that set up future success:

1. **Type safety overhaul** - Replace all `any` with proper SDK types and adapters
2. **Comprehensive error handling** - Add recovery for SSE failures, revert failures, permission errors
3. **Architecture documentation** - Create ARCHITECTURE.md with diagrams and flows
4. **Structured logging** - Replace console.log with configurable logger and telemetry
5. **Testing infrastructure** - Add unit tests for message routing, streaming, session management
6. **Configuration UI** - Add webview panel for editing opencode.json settings
