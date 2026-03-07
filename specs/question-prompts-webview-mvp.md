## Problem overview

The VSCode webview client does not handle `question.asked` events from OpenCode. When a session (often during sub-agent/task flows) asks a question, the backend waits for `question.reply` or `question.reject`, but the client has no UI or event plumbing for this path. This leaves sessions appearing stalled or failing in a confusing way.

## Solution overview

Add question-request support to the webview client using an accordion-style prompt UI. Each accordion item represents one question. The first item starts expanded, answering a question advances focus to the next question, users can reopen prior items to revise answers, and a single Submit action at the bottom sends the final `answers` payload.

## Goals

- A user can see pending question requests in the webview for the active session (including child/sub-agent sessions).
- Question prompts render as an accordion where each item is one question.
- The first question is selected by default; choosing an answer advances focus to the next question.
- Users can click any prior question item to review and change answers before submit.
- A bottom-level Submit button sends all answers at once via `question.reply`.
- A Reject action is available and sends `question.reject`.
- The client no longer silently stalls when the backend emits `question.asked`.

## Non-goals

- Pixel-perfect visual parity with TUI terminal rendering.
- Full keyboard-shortcut parity with TUI question navigation in v1.
- New backend/API behavior or protocol changes.
- Reworking permission UX as part of this change.
- No migrations or backfills.

## Future work

- Add richer keyboard navigation parity (numeric shortcuts, tab-cycle, custom editor shortcuts).
- Add enhanced accessibility/ARIA semantics and screen-reader optimizations for accordion interaction.
- Unify standalone approval surfaces (permissions + questions) into one shared interaction framework.

## Important files/docs/websites for implementation

- `src/webview/state/eventHandlers.ts` - SSE event reducer; add `question.asked`, `question.replied`, and `question.rejected` handling.
- `src/webview/state/types.ts` - sync store shape; add question state keyed by session ID.
- `src/webview/state/bootstrap.ts` - initial hydration path; load pending questions via SDK `question.list`.
- `src/webview/state/sync.tsx` - expose question selectors and aggregated question map for current/root+child sessions.
- `src/webview/hooks/useOpenCode.tsx` - SDK helpers; add wrappers for `question.reply`, `question.reject`, and optional `question.list`.
- `src/webview/App.tsx` - wire question prompt rendering, answer state callbacks, and submit/reject handlers.
- `src/webview/components/PermissionPrompt.tsx` - existing approval UI pattern to mirror for spacing/buttons.
- `src/webview/App.css` - styles for standalone prompt containers and accordion question prompt variants.
- `node_modules/.pnpm/@opencode-ai+sdk@1.2.14/node_modules/@opencode-ai/sdk/dist/v2/gen/sdk.gen.js` - reference for `question.list`, `question.reply`, `question.reject` SDK operations.
- `node_modules/.pnpm/@opencode-ai+sdk@1.2.14/node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts` - reference for `QuestionRequest`, `QuestionInfo`, `QuestionAnswer`, and question event payload shapes.
- `/tmp/opencode-dev-1772822586/packages/opencode/src/cli/cmd/tui/routes/session/question.tsx` - behavior reference for answer payload structure and lifecycle.

## Implementation

### Phase 1: Add question state and event plumbing

- [ ] Extend `SyncState` with `question: { [sessionID: string]: QuestionRequest[] }` in `src/webview/state/types.ts` and initialize it in `createEmptyState`.
- [ ] Add event handling in `src/webview/state/eventHandlers.ts` for:
- [ ] `question.asked`: insert/update request in `store.question[sessionID]`.
- [ ] `question.replied` and `question.rejected`: remove request by `requestID`.
- [ ] On `question.asked`, clear `thinking` for that session so pending question state is obvious in UI.
- [ ] Add/adjust types in webview code to import `QuestionRequest` from SDK v2 client types without introducing `any`.
- [ ] Success criteria: unit tests validate add/remove behavior for question events and thinking state reset on `question.asked`.

### Phase 2: Bootstrap pending questions and expose selectors

- [ ] Update `fetchBootstrapData` in `src/webview/state/bootstrap.ts` to call `client.question.list({ directory })` and group requests by session ID.
- [ ] Include `questionMap` in `BootstrapResult` and commit path (`commitBootstrapData`).
- [ ] Update `setCurrentSessionId` cleanup logic in `src/webview/state/sync.tsx` to clear stale question data when switching sessions (mirroring message/permission behavior).
- [ ] Expose `questions` and `aggregatedQuestions` selectors from sync context (same root+child aggregation model as permissions).
- [ ] Success criteria: after bootstrap, pending questions are visible in store without waiting for new SSE events.

### Phase 3: Add SDK question helpers in webview hook

- [ ] Add `respondToQuestion(requestId, answers)` helper in `src/webview/hooks/useOpenCode.tsx` calling `client.question.reply` with optional `directory`.
- [ ] Add `rejectQuestion(requestId)` helper calling `client.question.reject` with optional `directory`.
- [ ] Optionally add `getQuestions()` helper for direct reads where needed (if bootstrap path benefits from centralization).
- [ ] Ensure helper failures throw actionable errors surfaced by UI callers.
- [ ] Success criteria: hook unit test (or focused integration test) confirms helper calls SDK with expected payload (`answers: Array<QuestionAnswer>`).

### Phase 4: Build accordion QuestionPrompt component

- [ ] Create `src/webview/components/QuestionPrompt.tsx` with accordion behavior per request:
- [ ] Render one accordion item per `QuestionInfo` in request order.
- [ ] Initial expanded item is index `0`.
- [ ] Selecting an answer on current item auto-expands the next item when available.
- [ ] Clicking an item header re-expands it for answer edits.
- [ ] Keep answer state for all questions locally until submit.
- [ ] Add custom-answer input support when `custom !== false`.
- [ ] Add bottom actions: `Reject` and `Submit`.
- [ ] `Submit` disabled until every question has at least one answer.
- [ ] Add styles in `src/webview/App.css` for accordion headers/panels and answered-state affordances.
- [ ] Success criteria: component tests verify auto-advance, answer editing on prior items, and submit payload shape.

### Phase 5: Wire QuestionPrompt into App flow

- [ ] In `src/webview/App.tsx`, derive standalone pending questions for current/root+child sessions and render `QuestionPrompt` blocks near existing standalone permission prompts.
- [ ] Add `handleQuestionSubmit(requestId, answers)` and `handleQuestionReject(requestId)` handlers.
- [ ] Surface inline session error when submit/reject transport fails.
- [ ] Prevent conflicting queued/submitted prompt sends while unresolved question requests exist for the active session tree.
- [ ] Ensure in-flight marker is cleared when a question arrives for that in-flight session.
- [ ] Success criteria: manual flow confirms question appears, answers can be revised via accordion, and submit clears prompt on `question.replied`.

### Phase 6: Verification and regression checks

- [ ] Add targeted tests for reducer changes, submit gating rules, and app-level question render/handler wiring.
- [ ] Run `pnpm test` and verify no regressions in existing permission prompt behavior.
- [ ] Manual verification against a real backend session using a demo-question prompt:
```text
Before making any edits, ask me exactly 3 demo questions using the question tool:
1) one single-select question,
2) one multi-select question,
3) one question that allows a custom typed answer.
Wait for my answers before continuing.
```
- [ ] Confirm the accordion opens with question 1 expanded, auto-advances after each answer, and still allows reopening previous questions to edit answers.
- [ ] Confirm `Submit` stays disabled until every question has at least one answer and then sends one combined `question.reply`.
- [ ] Confirm `question.reject` path removes prompt and unblocks the input/queue flow.
- [ ] Confirm backend observability shows `question.asked` followed by `question.replied` (or `question.rejected`) without ambiguous client-side failure.
- [ ] Success criteria: reproducible real-session run shows clear end-to-end question handling without ambiguous stalled state.
