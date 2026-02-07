# OpenCode VSCode Extension

[Install for VSCode](https://marketplace.visualstudio.com/items?itemName=TanishqKancharla.opencode-vscode&ssr=false#review-details)

A VSCode sidebar extension for OpenCode - the AI coding agent. Simple chat interface to interact with OpenCode directly from your sidebar.

![OpenCode VSCode Extension Preview](media/preview.png)

> **Note**: This is an independent community project and is not officially affiliated with or maintained by the OpenCode team.

## Prerequisites

1. **OpenCode CLI must be installed**:
   ```bash
   curl -fsSL https://opencode.ai/install | bash
   ```

2. **OpenCode must be configured** with API credentials:
   ```bash
   opencode auth login
   ```
   Select your provider (OpenCode Zen, Anthropic, OpenAI, etc.) and add your API key.

## Development Setup

### Install Dependencies
```bash
npm install
```

### Build the Extension
```bash
npm run build
```

This builds both:
- Extension code → `dist/extension.js`
- Webview UI → `out/main.js` and `out/main.css`

### Development Workflow

1. **Start watch mode** (in a terminal):
   ```bash
   npm run watch
   ```

2. **Launch Extension Development Host**:
   - Press `F5` in VSCode/Cursor
   - Or open Run and Debug panel (`Cmd+Shift+D`) and click "Run Extension"

3. **Use the extension**:
   - Look for the OpenCode icon in the Activity Bar (left side)
   - Click it to open the sidebar
   - Type a message and hit Send or press Enter

### Making Changes

- **Extension code** (src/extension.ts, src/OpenCodeService.ts, src/OpenCodeViewProvider.ts):
  - Save your changes
  - Reload the Extension Development Host window: `Cmd+R` (Mac) or `Ctrl+R` (Windows/Linux)

- **Webview UI** (src/webview/App.tsx, src/webview/App.css):
  - Changes hot-reload automatically
  - Just save and see updates instantly

## How It Works

### Architecture

```
┌─────────────────────────────────────┐
│  React Webview (Chat UI)           │
│  - Input box                        │
│  - Message history                  │
│  - Thinking indicator               │
└──────────┬──────────────────────────┘
           │ postMessage
           ▼
┌─────────────────────────────────────┐
│  Extension Host (Node.js)           │
│  - OpenCodeService                  │
│    ├─ Manages OpenCode client      │
│    ├─ Creates sessions              │
│    └─ Sends prompts                 │
└──────────┬──────────────────────────┘
           │ @opencode-ai/sdk
           ▼
┌─────────────────────────────────────┐
│  OpenCode Server (embedded)         │
│  - Runs on localhost                │
│  - Uses workspace opencode.json     │
│  - Handles AI interactions          │
└─────────────────────────────────────┘
```

### Key Components

**Extension Side (TypeScript/ESM):**
- `src/extension.ts`: Entry point, initializes OpenCodeService
- `src/OpenCodeService.ts`: Manages OpenCode client/server, sessions, and prompts
- `src/OpenCodeViewProvider.ts`: Webview provider, handles message passing

**Webview Side (React):**
- `src/webview/App.tsx`: Chat UI with input, message history, thinking indicator
- `src/webview/App.css`: Styles using VSCode theme variables

**Build System:**
- `vite.config.extension.ts`: Bundles extension (ESM → CJS for VSCode)
- `vite.config.ts`: Bundles webview (React)

## Configuration

The extension automatically uses:
1. Workspace `opencode.json` (if present in project root)
2. Global OpenCode config at `~/.config/opencode/opencode.json`

Example workspace config:
```json
{
  "model": "anthropic/claude-3-5-sonnet-20241022",
  "mcp": {
    // MCP server configurations
  }
}
```

## Project Structure

```
opencode-vscode-2/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── OpenCodeService.ts        # OpenCode client/server manager
│   ├── OpenCodeViewProvider.ts   # Webview provider
│   └── webview/                  # React UI
│       ├── App.tsx               # Chat component
│       ├── App.css               # Styles
│       ├── main.tsx              # React entry point
│       └── vscode.d.ts           # VSCode API types
├── media/
│   └── icon.svg                  # Activity bar icon
├── dist/                         # Compiled extension (Vite output)
├── out/                          # Compiled webview (Vite output)
├── vite.config.extension.ts      # Extension build config
├── vite.config.ts                # Webview build config
├── tsconfig.json                 # TypeScript config
└── package.json
```

## Tech Stack

- **Extension**: TypeScript (ESM), VSCode Extension API, OpenCode SDK
- **Webview**: React, TypeScript
- **Build**: Vite for both extension and webview
- **Styling**: CSS with VSCode theme variables

## Features

✅ Simple chat interface
✅ Send prompts and get AI responses
✅ Thinking indicator during processing
✅ Message history (user and assistant)
✅ Workspace configuration support
✅ Full TypeScript type safety
✅ VSCode theme integration

## Future Enhancements

- Real-time streaming responses
- File attachments from workspace
- Markdown rendering in responses
- Code syntax highlighting
- Multi-session support
- Session persistence
- Undo/redo functionality

## Publishing

To publish a new version:

1. Bump the version in `package.json`
2. Set environment variable: `export OVSX_PAT=your_open_vsx_token`
3. Login to VS Code Marketplace: `npx vsce login <publisher>`
4. Run: `npm run publish`

This publishes to both VS Code Marketplace and Open VSX Registry.

**Note**: You'll need:
- A VS Code Marketplace Personal Access Token (PAT) from Azure DevOps with "Marketplace (Manage)" scope
- An Open VSX token set as `OVSX_PAT` environment variable

## Troubleshooting

**"Failed to start OpenCode"**
- Make sure OpenCode CLI is installed: `which opencode`
- Configure authentication: `opencode auth login`

**"No response received"**
- Check API credentials are valid
- Verify workspace has internet connection
- Check VSCode Developer Console for errors (Help → Toggle Developer Tools)
