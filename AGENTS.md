# AGENTS.md

## Commands

- **Build**: `pnpm build` (builds extension + webview)
- **Watch**: `pnpm watch` (dev mode with hot reload)
- **Test**: `pnpm test` (runs vitest)
- **Single test**: `pnpm test -- path/to/file.test.ts`
- **E2E Tests**: `pnpm test:e2e` (runs playwright e2e tests with AI generation)
- **Package**: `pnpm package` (creates .vsix)
- **UI Kit**: `pnpm uikit` (opens component playground)

## Architecture

VSCode extension with SolidJS webview. Two build targets:

- **Extension** (`src/extension.ts`, `OpenCodeService.ts`, `OpenCodeViewProvider.ts`) - VSCode extension host
- **Webview** (`src/webview/`) - SolidJS chat UI communicating via `@opencode-ai/sdk`

## Code Style

- TypeScript with strict mode, no `any` types
- SolidJS for webview components (signals, createMemo, Show/For)
- Functional components with hooks in `src/webview/hooks/`
- CSS files colocated with components (App.css, uikit.css)
- Use VSCode API types from `@types/vscode`
- Prefer explicit imports, avoid barrel files
- Error handling: use VSCode's `window.showErrorMessage` and `LogOutputChannel`

## Publishing

Use the `pnpm run publish` script to publish the extension to the VSCode and OVSX marketplaces.

## Logging into gcloud

CRITICAL: If you try to run a command get an error related to the user not being logged into Gcloud e.g. `{"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)","error_uri":"https://support.google.com/a/answer/9368756","error_subtype":"invalid_rapt"}`, then you MUST instruct the user to log into gcloud before you can continue.
