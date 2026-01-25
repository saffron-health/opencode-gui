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

## Phase 3 — Idempotent sends + minimal outbox
**Goal:** tolerate transport glitches without duplicating messages.

- Generate `messageID` + `part` IDs client-side before `session.prompt`.
- Maintain a FIFO outbox with at most one in-flight prompt.
- Dequeue when:
  - `message.updated` arrives for that `messageID`, or
  - `session.status` transitions to `idle`.
- Transport errors are retried silently; server errors are shown to the user.

**Files:**
- `src/webview/App.tsx`
- `src/webview/hooks/useOpenCode.ts`

**Acceptance:**
- No duplicate messages under retry.
- Queue drains reliably after reconnect.

---

## Phase 4 — Attachment/selection parity
**Goal:** keep selection semantics identical to TUI.

- Ensure selections use `file://` with `start/end` query params.
- Preserve metadata (`source`) when possible.
- Maintain attachment consistency through queue/retry.

**Files:**
- `src/webview/App.tsx`
- `src/shared/messages.ts` (if selection metadata expands)

**Acceptance:**
- Ranges expand server-side the same way as CLI/TUI.

---

## Phase 5 — Validation
**Goal:** prove the reliability improvements.

- Unit tests for SSE parser + retry logic (chunked input, retry directives).
- Manual workflow tests:
  - kill server mid-stream → reconnect resumes
  - send queued prompts under disconnect → no duplicates

**Files:**
- `src/transport/__tests__/SseClient.test.ts` (new)

**Acceptance:**
- Reconnect works; no partial state; no spurious transport errors.
