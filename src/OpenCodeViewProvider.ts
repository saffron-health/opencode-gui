import * as vscode from 'vscode';
import { OpenCodeService } from './OpenCodeService';
import { getLogger } from './extension';
import type { HostMessage, WebviewMessage, IncomingMessage } from './shared/messages';
import { parseWebviewMessage } from './shared/messages';

const LAST_AGENT_KEY = 'opencode.lastUsedAgent';

export class OpenCodeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'opencode.chatView';
  private _view?: vscode.WebviewView;
  private _sseConnections = new Map<string, { close: () => void }>();
  private _proxyFetchControllers = new Map<string, AbortController>();

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _openCodeService: OpenCodeService,
    private readonly _globalState: vscode.Memento
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    const logger = getLogger();
    logger.info('resolveWebviewView called');
    
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'out')
      ]
    };

    const html = this._getHtmlForWebview(webviewView.webview);
    logger.info('Generated webview HTML length:', html.length);
    webviewView.webview.html = html;

    webviewView.webview.onDidReceiveMessage(async (data: unknown) => {
      // Handle proxy messages directly (they don't go through parseWebviewMessage)
      if (typeof data === 'object' && data !== null) {
        const msg = data as Record<string, unknown>;
        if (msg.type === 'proxyFetch') {
          await this._handleProxyFetch(msg as { id: string; url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } });
          return;
        }
        if (msg.type === 'proxyFetchAbort') {
          this._handleProxyFetchAbort(msg.id as string);
          return;
        }
        if (msg.type === 'sseSubscribe') {
          this._handleSSESubscribe(msg as { id: string; url: string });
          return;
        }
        if (msg.type === 'sseClose') {
          this._handleSSEClose(msg.id as string);
          return;
        }
      }

      const message = parseWebviewMessage(data);
      if (!message) {
        console.warn('[ViewProvider] Received invalid message from webview:', data);
        return;
      }
      await this._handleWebviewMessage(message);
    });
  }

  private async _handleWebviewMessage(message: WebviewMessage) {
    switch (message.type) {
      case 'ready':
        await this._handleReady();
        break;
      case 'agent-changed':
        await this._handleAgentChanged(message.agent);
        break;
    }
  }

  private async _handleReady() {
    try {
      const currentSessionId = this._openCodeService.getCurrentSessionId() ?? undefined;
      const currentSessionTitle = this._openCodeService.getCurrentSessionTitle();
      
      let messages: unknown[] | undefined;
      if (currentSessionId) {
        try {
          messages = await this._openCodeService.getMessages(currentSessionId);
        } catch (error) {
          console.error('Error loading session messages:', error);
          this._sendMessage({ type: 'error', message: `Failed to load session messages: ${(error as Error).message}` });
        }
      }
      
      this._sendMessage({
        type: 'init',
        ready: this._openCodeService.isReady(),
        workspaceRoot: this._openCodeService.getWorkspaceRoot(),
        serverUrl: this._openCodeService.getServerUrl(),
        currentSessionId,
        currentSessionTitle,
        currentSessionMessages: messages as IncomingMessage[] | undefined,
        defaultAgent: this._globalState.get<string>(LAST_AGENT_KEY),
      });
    } catch (error) {
      console.error('Error handling ready:', error);
      this._sendMessage({ type: 'error', message: `Failed to initialize: ${(error as Error).message}` });
      this._sendMessage({
        type: 'init',
        ready: this._openCodeService.isReady(),
        workspaceRoot: this._openCodeService.getWorkspaceRoot(),
        serverUrl: this._openCodeService.getServerUrl(),
        currentSessionId: undefined
      });
    }
  }

  private async _handleAgentChanged(agent: string) {
    await this._globalState.update(LAST_AGENT_KEY, agent);
    const logger = getLogger();
    logger.info('[ViewProvider] Agent selection persisted:', agent);
  }

  // SSE Proxy handlers
  private _handleSSESubscribe(message: { id: string; url: string }) {
    const { id, url } = message;
    const logger = getLogger();

    if (typeof id !== 'string' || typeof url !== 'string') {
      logger.warn('[ViewProvider] Invalid sseSubscribe message', message);
      return;
    }

    const serverUrl = this._openCodeService.getServerUrl();
    if (!serverUrl) {
      this._sendMessage({ type: 'sseError', id, error: 'OpenCode server URL not configured' } as HostMessage);
      return;
    }

    let target: URL;
    let allowed: URL;
    try {
      target = new URL(url);
      allowed = new URL(serverUrl);
    } catch {
      this._sendMessage({ type: 'sseError', id, error: 'Invalid URL for SSE subscription' } as HostMessage);
      return;
    }

    if (target.origin !== allowed.origin) {
      this._sendMessage({ type: 'sseError', id, error: 'SSE only allowed to OpenCode server origin' } as HostMessage);
      return;
    }

    this._handleSSEClose(id);

    const controller = new AbortController();

    fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          this._sendMessage({ type: 'sseError', id, error: `SSE connection failed: ${res.status}` } as HostMessage);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processChunk = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                this._sendMessage({ type: 'sseClosed', id } as HostMessage);
                this._sseConnections.delete(id);
                break;
              }

              buffer += decoder.decode(value, { stream: true });

              const messages = buffer.split('\n\n');
              buffer = messages.pop() || '';

              for (const msg of messages) {
                const lines = msg.split('\n');
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    this._sendMessage({ type: 'sseEvent', id, data } as HostMessage);
                  }
                }
              }
            }
          } catch (err) {
            if ((err as Error).name !== 'AbortError') {
              this._sendMessage({ type: 'sseError', id, error: String((err as Error)?.message ?? err) } as HostMessage);
            }
            this._sseConnections.delete(id);
          }
        };

        processChunk();
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') {
          logger.error('[ViewProvider] SSE connection failed', { url, err });
          this._sendMessage({ type: 'sseError', id, error: String((err as Error)?.message ?? err) } as HostMessage);
        }
        this._sseConnections.delete(id);
      });

    this._sseConnections.set(id, { close: () => controller.abort() });
    logger.info('[ViewProvider] SSE subscription started:', id);
  }

  private _handleSSEClose(id: string) {
    const conn = this._sseConnections.get(id);
    if (conn) {
      conn.close();
      this._sseConnections.delete(id);
    }
  }

  private _handleProxyFetchAbort(id: string) {
    const controller = this._proxyFetchControllers.get(id);
    if (controller) {
      controller.abort();
      this._proxyFetchControllers.delete(id);
    }
  }

  private async _handleProxyFetch(message: {
    id: string;
    url: string;
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };
  }) {
    const { id, url, init } = message;
    const logger = getLogger();

    if (typeof id !== 'string' || typeof url !== 'string') {
      logger.warn('[ViewProvider] Invalid proxyFetch message', message);
      return;
    }

    const serverUrl = this._openCodeService.getServerUrl();

    if (!serverUrl) {
      this._sendMessage({
        type: 'proxyFetchResult',
        id,
        ok: false,
        error: 'Proxy fetch disabled: OpenCode server URL not configured',
      } as HostMessage);
      return;
    }

    let target: URL;
    let allowed: URL;
    try {
      target = new URL(url);
      allowed = new URL(serverUrl);
    } catch {
      this._sendMessage({
        type: 'proxyFetchResult',
        id,
        ok: false,
        error: 'Invalid URL for proxy fetch',
      } as HostMessage);
      return;
    }

    if (target.origin !== allowed.origin) {
      this._sendMessage({
        type: 'proxyFetchResult',
        id,
        ok: false,
        error: 'Proxy fetch only allowed to OpenCode server origin',
      } as HostMessage);
      return;
    }

    const controller = new AbortController();
    this._proxyFetchControllers.set(id, controller);

    try {
      const res = await fetch(url, {
        method: init?.method,
        headers: init?.headers,
        body: init?.body,
        signal: controller.signal,
      });

      const bodyText = await res.text();

      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });

      this._sendMessage({
        type: 'proxyFetchResult',
        id,
        ok: true,
        status: res.status,
        statusText: res.statusText,
        headers,
        bodyText,
      } as HostMessage);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.info('[ViewProvider] Proxy fetch aborted', { url, id });
        this._sendMessage({
          type: 'proxyFetchResult',
          id,
          ok: false,
          error: 'Aborted',
        } as HostMessage);
      } else {
        logger.error('[ViewProvider] Proxy fetch failed', { url, error });
        this._sendMessage({
          type: 'proxyFetchResult',
          id,
          ok: false,
          error: String((error as Error)?.message ?? error),
        } as HostMessage);
      }
    } finally {
      this._proxyFetchControllers.delete(id);
    }
  }

  private _sendMessage(message: HostMessage) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'App.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:* ${webview.cspSource};">
        <link href="${styleUri}" rel="stylesheet">
        <title>OpenCode</title>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
