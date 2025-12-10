# Streamdown Port to Solid.js

## Summary

Ported Vercel's streamdown library (https://streamdown.ai) from React to Solid.js for streaming markdown rendering in the OpenCode extension.

## Branch

`feature/streamdown-port` - https://github.com/saffron-health/opencode-gui/pull/new/feature/streamdown-port

## Files Created

Core library at `src/webview/lib/streamdown/`:

- `remend/` - Incomplete markdown healing (10 files, copied from original)
- `parse-blocks.ts` - Block tokenization using marked Lexer
- `hast-to-solid.tsx` - HAST tree to Solid JSX renderer
- `markdown.tsx` - Unified pipeline with processor cache
- `index.tsx` - Main Streamdown component

Tests:

- `remend/__tests__/*.test.ts` - 17 test files from original repo
- `parse-blocks.test.ts` - Block parsing tests
- `streamdown.test.ts` - Integration tests
- 221 tests total, all passing

## Dependencies Added

- unified, remark-parse, remark-gfm, remark-rehype
- rehype-raw, rehype-sanitize
- marked, shiki

## What Works

1. remend() fixes incomplete markdown during streaming (bold, italic, code, links, math)
2. parseMarkdownIntoBlocks() splits markdown for incremental rendering
3. Markdown component renders HAST to Solid JSX
4. Streamdown component combines everything with static/streaming modes

## Completed

1. ✅ Integration into TextBlock component - uses Streamdown with streaming mode detection
2. ✅ CSS styling for rendered markdown elements - comprehensive styles in App.css
3. ✅ isStreaming prop passed through MessageList → MessageItem → MessagePartRenderer → TextBlock

## Not Yet Done

1. Code block syntax highlighting with Shiki
2. Mermaid diagram support

## Usage

```tsx
import { Streamdown } from "./lib/streamdown";

<Streamdown mode="streaming">{aiResponseText}</Streamdown>
```

## Next Steps

1. Update TextBlock to use Streamdown instead of plain text
2. Add markdown CSS styles to App.css
3. Optional: Add code highlighting with Shiki
