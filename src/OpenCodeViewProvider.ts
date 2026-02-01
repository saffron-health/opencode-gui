import * as vscode from 'vscode';
import { OpenCodeService } from './OpenCodeService';
import { getLogger } from './extension';
import type { HostMessage, WebviewMessage, IncomingMessage } from './shared/messages';
import { parseWebviewMessage } from './shared/messages';
import { SseClient, SseConnectionState, SseEvent, SseLogger } from './transport/SseClient';

const LAST_AGENT_KEY = 'opencode.lastUsedAgent';

export class OpenCodeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'opencode.chatView';
  private _view?: vscode.WebviewView;
  private _sseClients = new Map<string, SseClient>();
  private _proxyFetchControllers = new Map<string, AbortController>();
  private _webviewReady = false;
  private _pendingMessages: HostMessage[] = [];

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
    this._webviewReady = false;

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
        
        // Handle log messages from webview
        if (msg.type === 'log') {
          const logger = getLogger();
          const level = msg.level as 'debug' | 'info' | 'error';
          const message = msg.message as string;
          const logData = msg.data;
          if (level === 'error') {
            logger.error(`[Webview] ${message}`, logData);
          } else if (level === 'info') {
            logger.info(`[Webview] ${message}`, logData);
          } else {
            logger.debug(`[Webview] ${message}`, logData);
          }
          return;
        }
        
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
      case 'open-file':
        await this._handleOpenFile(message.url, message.startLine, message.endLine);
        break;
    }
  }

  private async _handleOpenFile(url: string, startLine?: number, endLine?: number) {
    try {
      const uri = vscode.Uri.parse(url);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document, {
        preview: true,
      });
      if (startLine !== undefined) {
        const start = new vscode.Position(Math.max(startLine - 1, 0), 0);
        const end = new vscode.Position(Math.max((endLine ?? startLine) - 1, 0), 0);
        const range = new vscode.Range(start, end);
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      }
    } catch (error) {
      const logger = getLogger();
      logger.error('[ViewProvider] Failed to open file', { url, error });
      vscode.window.showErrorMessage('OpenCode: Failed to open file.');
    }
  }

  private async _handleReady() {
    try {
      const currentSessionId = this._openCodeService.getCurrentSessionId() ?? undefined;
      const currentSessionTitle = this._openCodeService.getCurrentSessionTitle();
      
      let messages: IncomingMessage[] | undefined;
      if (currentSessionId) {
        try {
          const sdkMessages = await this._openCodeService.getMessages(currentSessionId);
          // Transform SDK Message[] to IncomingMessage[]
          messages = sdkMessages.map(msg => ({
            id: msg.id,
            role: msg.role,
          }));
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
        currentSessionMessages: messages,
        defaultAgent: this._globalState.get<string>(LAST_AGENT_KEY),
      });
      this._webviewReady = true;
      this._flushPendingMessages();
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
      this._webviewReady = true;
      this._flushPendingMessages();
    }
  }

  private async _handleAgentChanged(agent: string) {
    await this._globalState.update(LAST_AGENT_KEY, agent);
    const logger = getLogger();
    logger.info('[ViewProvider] Agent selection persisted:', agent);
  }

  // SSE Proxy handlers using resilient SseClient
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

    // Close existing connection with this id
    this._handleSSEClose(id);

    // Create logger adapter for SseClient
    const sseLogger: SseLogger = {
      info: (msg, ...args) => logger.info(msg, ...args),
      warn: (msg, ...args) => logger.warn(msg, ...args),
      error: (msg, ...args) => logger.error(msg, ...args),
    };

    // Build headers including x-opencode-directory
    const headers: Record<string, string> = {};
    const workspaceRoot = this._openCodeService.getWorkspaceRoot();
    if (workspaceRoot) {
      // Encode directory as per SDK client (percent-encode non-ASCII)
      headers['x-opencode-directory'] = encodeURIComponent(workspaceRoot);
    }

    const client = new SseClient(url, {
      onEvent: (event: SseEvent) => {
        this._sendMessage({ type: 'sseEvent', id, data: event.data } as HostMessage);
      },
      onStateChange: (state: SseConnectionState) => {
        logger.info('[ViewProvider] SSE state change', { id, state });
        
        // Send status to webview for observability
        if (state.status === 'connecting') {
          this._sendMessage({ type: 'sseStatus', id, status: 'connecting' } as HostMessage);
        } else if (state.status === 'connected') {
          this._sendMessage({ type: 'sseStatus', id, status: 'connected' } as HostMessage);
        } else if (state.status === 'reconnecting') {
          this._sendMessage({ 
            type: 'sseStatus', 
            id, 
            status: 'reconnecting', 
            attempt: state.attempt, 
            nextRetryMs: state.nextRetryMs 
          } as HostMessage);
        } else if (state.status === 'closed') {
          this._sendMessage({ 
            type: 'sseStatus', 
            id, 
            status: 'closed', 
            reason: state.reason 
          } as HostMessage);
          this._sendMessage({ type: 'sseClosed', id } as HostMessage);
          this._sseClients.delete(id);
        }
      },
      onError: (error: Error) => {
        logger.error('[ViewProvider] SSE unrecoverable error', { id, error: error.message });
        this._sendMessage({ type: 'sseError', id, error: error.message } as HostMessage);
        this._sseClients.delete(id);
      },
      logger: sseLogger,
      headers,
    });

    this._sseClients.set(id, client);
    client.connect();
    logger.info('[ViewProvider] SSE subscription started with resilient client:', id);
  }

  private _handleSSEClose(id: string) {
    const client = this._sseClients.get(id);
    if (client) {
      client.close();
      this._sseClients.delete(id);
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

  public sendHostMessage(message: HostMessage) {
    if (this._view && this._webviewReady) {
      this._view.webview.postMessage(message);
      return;
    }
    this._pendingMessages.push(message);
  }

  private _flushPendingMessages() {
    if (!this._view || this._pendingMessages.length === 0) return;
    const pending = this._pendingMessages;
    this._pendingMessages = [];
    for (const message of pending) {
      this._sendMessage(message);
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
