#!/usr/bin/env bash
# Development environment setup for the OpenCode VSCode extension.
# Installs Node dependencies, builds the extension + webview, and (best-effort)
# provisions the OpenCode CLI and VS Code so the extension can be run manually.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Installing Node dependencies (pnpm)"
corepack enable >/dev/null 2>&1 || true
pnpm install

echo "==> Building extension + webview"
pnpm build

echo "==> Installing OpenCode CLI (required prerequisite)"
if ! command -v opencode >/dev/null 2>&1 && [ ! -x "$HOME/.opencode/bin/opencode" ]; then
  curl -fsSL https://opencode.ai/install | bash || echo "WARN: OpenCode CLI install failed; install manually from https://opencode.ai/install"
fi
if ! grep -q 'opencode/bin' "$HOME/.bashrc" 2>/dev/null; then
  echo 'export PATH="$HOME/.opencode/bin:$PATH"' >> "$HOME/.bashrc"
fi
if ! grep -q 'opencode/bin' "$HOME/.profile" 2>/dev/null; then
  echo 'export PATH="$HOME/.opencode/bin:$PATH"' >> "$HOME/.profile"
fi

echo "==> Installing VS Code (best-effort, requires apt + sudo)"
if ! command -v code >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then
    {
      sudo apt-get update -qq
      sudo apt-get install -y wget gpg apt-transport-https
      wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > /tmp/packages.microsoft.gpg
      sudo install -D -o root -g root -m 644 /tmp/packages.microsoft.gpg /usr/share/keyrings/packages.microsoft.gpg
      echo "deb [arch=amd64,arm64,armhf signed-by=/usr/share/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" | sudo tee /etc/apt/sources.list.d/vscode.list >/dev/null
      rm -f /tmp/packages.microsoft.gpg
      sudo apt-get update -qq
      sudo apt-get install -y code
    } || echo "WARN: VS Code install failed; the extension can still be run via 'pnpm dev' (downloads VS Code test build)."
  else
    echo "WARN: apt/sudo unavailable; skipping VS Code install."
  fi
fi

echo "==> Setup complete"
