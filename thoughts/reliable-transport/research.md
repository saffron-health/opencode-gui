# Reliable transport between webview and OpenCode server

## Goal
Understand how the OpenCode TUI handles reliable client/server messaging and compare with this VS Code webview extension. Identify patterns we should adopt.

## Findings from OpenCode repo (TUI + SDK)
- **SSE client reliability is built into the SDK**
  - The generated SSE client tracks `Last-Event-ID`, supports `retry:` directives, and retries with exponential backoff + caps.
  - Source: `/tmp/opencode/packages/sdk/js/src/v2/gen/core/serverSentEvents.gen.ts`.

- **TUI uses a single SSE stream and batches events**
  - The TUI subscribes to events via SDK SSE in a loop and resubscribes on disconnect.
  - Events are queued and flushed in batches (~16ms) to avoid render thrash.
  - Source: `/tmp/opencode/packages/opencode/src/cli/cmd/tui/context/sdk.tsx`.

- **Event-sourced state store is central**
  - The TUI keeps a normalized store keyed by `sessionID`, `messageID`, and `partID`.
  - Events like `message.updated` and `message.part.updated` are applied using binary-search insertion to dedupe/order.
  - Full bootstrap/resync runs on startup and on `server.instance.disposed`.
  - Source: `/tmp/opencode/packages/opencode/src/cli/cmd/tui/context/sync.tsx`.

- **Retry behavior is surfaced via `session.status` events**
  - Server emits `session.status` with `retry` metadata (attempt + next time).
  - TUI uses this to show explicit retry UI instead of treating transport errors as failures.
  - Sources: `/tmp/opencode/packages/opencode/src/session/status.ts`, `/tmp/opencode/packages/opencode/src/session/processor.ts`.

- **Client-side IDs are used for idempotent sends**
  - TUI generates a `messageID` and `part` IDs before calling `session.prompt` / `session.command`.
  - Transport errors are largely ignored; the event stream drives UI state.
  - Source: `/tmp/opencode/packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`.

- **File selection/attachments have a stable contract**
  - Selections are represented as `file://` URLs with `start` / `end` query params.
  - Server expands ranges and inserts synthetic “Read tool” parts before the file part.
  - Sources: `/tmp/opencode/packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx`, `/tmp/opencode/packages/opencode/src/session/prompt.ts`.

## Current extension/webview behavior
- **OpenCode server is started by the extension**
  - Server is launched on `127.0.0.1` with a random port via `createOpencode`.
  - Source: `src/OpenCodeService.ts`.

- **SSE proxy is minimal and non-resilient**
  - Extension uses a one-shot `fetch` stream without `Last-Event-ID`, retry, or backoff.
  - Webview proxy just forwards events and does not reconnect on error.
  - Sources: `src/OpenCodeViewProvider.ts`, `src/webview/utils/proxyEventSource.ts`.

- **Webview treats transport errors as expected noise**
  - `sendPrompt` errors like "proxy fetch timed out" / "aborted" are ignored.
  - This indicates the transport is flaky rather than the server flow.
  - Source: `src/webview/App.tsx`.

- **Selection attachments are already encoded as `file://` with ranges**
  - The webview builds parts from editor selections with `start/end` in query params.
  - Source: `src/webview/App.tsx` (`buildSelectionParts`).

## Implications
- The extension currently lacks the reliability features that the OpenCode TUI gets “for free” from the SDK SSE client.
- Most “fetch aborted/canceled” symptoms likely come from the simple proxy SSE implementation + missing reconnection.
- Keeping a single real SSE client in the extension (not the webview) avoids CORS/CSP issues and matches TUI behavior.

