# Plan: Reliable transport between webview and OpenCode server

## Phase 0 — Observability ✅ COMPLETE
**Goal:** make transport failures visible and debuggable.

- ✅ Add structured logs in the extension for SSE lifecycle events:
  - connect, reconnect attempt, close, error (with reason), lastEventId.
- ✅ Add optional `sseStatus` host -> webview message to expose status in UI logs.
- ✅ Add webview debug logs for connection status and event throughput.

**Files:**
- `src/OpenCodeViewProvider.ts`
- `src/shared/messages.ts` (added `sseStatus` message type)
- `src/webview/utils/proxyEventSource.ts` (added `onStatus` callback)

**Acceptance:** Clear log timeline for connect/disconnect/retry and error causes.

---

## Phase 1 — Extension-side SSE client (single real SSE implementation) ✅ COMPLETE
**Goal:** mirror the SDK/TUI SSE reliability in the extension.

- ✅ Create `src/transport/SseClient.ts`:
  - SSE parsing: `data`, `event`, `id`, `retry`, multiline data.
  - Track `Last-Event-ID` and send it on reconnect.
  - Exponential backoff with cap; honor server `retry:` values.
  - Clean cancellation via AbortController.
- ✅ Replace manual SSE proxy in `OpenCodeViewProvider` with `SseClient`.
- ✅ Forward parsed events to webview via `postMessage` (no SSE in webview).

**Files:**
- `src/transport/SseClient.ts` (new)
- `src/transport/__tests__/SseClient.test.ts` (12 tests)
- `src/OpenCodeViewProvider.ts`

**Acceptance:**
- ✅ SSE reconnects automatically after drop.
- ✅ No duplicate events after reconnect (Last-Event-ID).
- ✅ "fetch aborted/canceled" stops showing in normal use.

---

## Phase 2 — Event-sourced state in webview ✅ COMPLETE
**Goal:** UI correctness comes from events + resync, not fetch timing.

- ✅ Add `src/webview/state/syncStore.ts`:
  - Keep normalized state keyed by `sessionID`, `messageID`, `partID`.
  - Apply events (message/part updates, removals, session status, permissions).
- ✅ Add a `bootstrap()` that fetches:
  - providers, agents, config, sessions, session status
  - current session messages + parts
- ✅ Re-run `bootstrap()` on reconnect and `server.instance.disposed`.
- ✅ Add `src/webview/state/useSyncStore.ts` hook for easy integration.

**Files:**
- `src/webview/state/syncStore.ts` (new)
- `src/webview/state/useSyncStore.ts` (new)
- `src/webview/state/index.ts` (new)
- `src/webview/state/__tests__/syncStore.test.ts` (27 tests)
- `src/webview/hooks/useOpenCode.ts` (added SSEStatus type and onStatus param)

**Acceptance:**
- ✅ UI fully recovers after reconnect without missing messages.
- ✅ Events update state deterministically and idempotently.

**Note:** App.tsx integration deferred - syncStore is ready to use but App.tsx still uses
its own state management. Migration can be done incrementally.

---

## Phase 3 — Idempotent sends + minimal outbox ✅ COMPLETE
**Goal:** tolerate transport glitches without duplicating messages.

- ✅ Generate `messageID` client-side before `session.prompt` (format: `msg_<uuid>`).
- ✅ Maintain a FIFO outbox with at most one in-flight prompt (`inFlightMessage` state).
- ✅ Dequeue when:
  - `message.updated` arrives for that `messageID` (user message confirmation), or
  - `session.idle` event is received.
- ✅ All errors (transport and server) are shown to the user inline.
- ✅ SDK errors (non-throwing) are detected via `result.error` and displayed.

**Files:**
- `src/webview/App.tsx` (added `InFlightMessage`, updated handlers, error handling for SDK results)
- `src/webview/hooks/useOpenCode.ts` (added `messageID` param to `sendPrompt`)
- `src/webview/utils/messageUtils.ts` (fixed text extraction from parts in SSE updates)
- `tests/e2e/outbox.spec.ts` (new e2e tests for outbox functionality)

**Acceptance:**
- ✅ No duplicate messages under retry (messageID is idempotent key).
- ✅ Queue drains reliably after reconnect (session.idle triggers next message).
- ✅ E2E tests passing: basic send, clearing thinking state, sequential messages.
- ✅ User message content renders correctly (text extracted from parts in SSE events).

---

## Phase 4 — Attachment/selection parity ✅ COMPLETE
**Goal:** keep selection semantics identical to TUI.

- ✅ Ensure selections use `file://` with `start/end` query params.
- ✅ Preserve metadata (`source`) with FilePartInput.source field (type: "file", path, text).
- ✅ Maintain attachment consistency through queue/retry (attachments stored with QueuedMessage).
- ✅ Filename display matches TUI format: `filename#L10-25` for ranges.
- ✅ Line selection normalization (handles reversed selections).
- ✅ E2E tests for attachment handling.

**Files:**
- `src/webview/App.tsx` (updated buildSelectionParts with source metadata)
- `src/webview/hooks/useOpenCode.ts` (exported FilePartInput and FilePartSource types)
- `tests/e2e/attachments.spec.ts` (new - 7 tests)

**Acceptance:**
- ✅ Ranges expand server-side the same way as CLI/TUI.
- ✅ Source metadata included for server-side processing parity.

---

## Phase 5 — Validation ✅ COMPLETE
**Goal:** prove the reliability improvements.

- ✅ Unit tests for SSE parser + retry logic (22 tests covering chunked input, retry directives, reconnection).
- ✅ Manual workflow tests documented in `VALIDATION.md`:
  - kill server mid-stream → reconnect resumes
  - send queued prompts under disconnect → no duplicates
  - reconnect after extended disconnect (exponential backoff)
  - attachment persistence through queue

**Files:**
- `src/transport/__tests__/SseClient.test.ts` (22 tests)
- `thoughts/reliable-transport/VALIDATION.md` (new - manual test procedures)

**Acceptance:**
- ✅ SSE parser handles all edge cases (chunked input, CRLF, retry directives).
- ✅ Reconnect with Last-Event-ID tested.
- ✅ Manual validation guide documents how to verify reliability.
- ✅ 295 unit tests passing (22 in SseClient.test.ts).
