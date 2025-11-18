import * as vscode from 'vscode';
import { OpenCodeService } from './OpenCodeService';
import type { Event } from '@opencode-ai/sdk';
import { getLogger } from './extension';

export class OpenCodeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'opencode.chatView';
  private _view?: vscode.WebviewView;
  private _activeSessionId?: string;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _openCodeService: OpenCodeService
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'out')
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'sendPrompt':
            await this._handleSendPrompt(message.text, message.agent);
            return;
          case 'ready':
            // Webview is ready, send initialization data
            this._sendMessage({
              type: 'init',
              ready: this._openCodeService.isReady(),
              workspaceRoot: this._openCodeService.getWorkspaceRoot()
            });
            return;
          case 'getAgents':
            await this._handleGetAgents();
            return;
          case 'load-sessions':
            await this._handleLoadSessions();
            return;
          case 'switch-session':
            await this._handleSwitchSession(message.sessionId);
            return;
          case 'create-session':
            await this._handleCreateSession(message.title);
            return;
        }
      }
    );
  }

  private async _handleGetAgents() {
    try {
      const agents = await this._openCodeService.getAgents();
      this._sendMessage({ 
        type: 'agentList', 
        agents 
      });
    } catch (error) {
      console.error('Error getting agents:', error);
      // Send empty list on error
      this._sendMessage({ 
        type: 'agentList', 
        agents: [] 
      });
    }
  }

  private async _handleLoadSessions() {
    try {
      const sessions = await this._openCodeService.listSessions();
      this._sendMessage({
        type: 'session-list',
        sessions
      });
    } catch (error) {
      console.error('Error loading sessions:', error);
      this._sendMessage({
        type: 'session-list',
        sessions: []
      });
    }
  }

  private async _handleSwitchSession(sessionId: string) {
    try {
      this._activeSessionId = sessionId;
      await this._openCodeService.switchSession(sessionId);
      
      // Load messages from the session
      const messages = await this._openCodeService.getMessages(sessionId);
      
      this._sendMessage({
        type: 'session-switched',
        sessionId,
        title: this._openCodeService.getCurrentSessionTitle(),
        messages
      });
    } catch (error) {
      console.error('Error switching session:', error);
      this._sendMessage({
        type: 'error',
        message: `Failed to switch session: ${(error as Error).message}`
      });
    }
  }

  private async _handleCreateSession(title?: string) {
    try {
      const sessionId = await this._openCodeService.createNewSession(title);
      this._activeSessionId = sessionId;
      this._sendMessage({
        type: 'session-switched',
        sessionId,
        title: this._openCodeService.getCurrentSessionTitle()
      });
      // Reload sessions list
      await this._handleLoadSessions();
    } catch (error) {
      console.error('Error creating session:', error);
      this._sendMessage({
        type: 'error',
        message: `Failed to create session: ${(error as Error).message}`
      });
    }
  }

  private async _handleSendPrompt(text: string, agent?: string) {
    try {
      // Send thinking state
      this._sendMessage({ type: 'thinking', isThinking: true });

      // Prefer the locally tracked session; fallback to service
      let sessionId = this._activeSessionId || await this._openCodeService.getCurrentSession();
      const isNewSession = !sessionId;
      if (!sessionId) {
        sessionId = await this._openCodeService.createSession();
        this._activeSessionId = sessionId;
      }

      // Send the prompt with streaming, including selected agent
      await this._openCodeService.sendPromptStreaming(
        text,
        (event) => this._handleStreamEvent(event),
        sessionId,
        agent
      );

      this._sendMessage({ type: 'thinking', isThinking: false });

      // If this was a new session, just reload the session list (don't switch UI)
      if (isNewSession) {
        await this._handleLoadSessions();
      }
    } catch (error) {
      console.error('Error sending prompt:', error);
      this._sendMessage({
        type: 'error',
        message: `Error: ${(error as Error).message}`
      });
      this._sendMessage({ type: 'thinking', isThinking: false });
    }
  }

  private _getEventSessionId(event: Event): string | undefined {
    const e: any = event;
    return e?.properties?.sessionID
        ?? e?.properties?.info?.sessionID
        ?? e?.properties?.part?.sessionID
        ?? e?.sessionID
        ?? e?.properties?.session?.id;
  }

  private _handleStreamEvent(event: Event) {
    const evSessionId = this._getEventSessionId(event);
    if (this._activeSessionId && evSessionId && evSessionId !== this._activeSessionId) {
      console.log('[ViewProvider] Ignoring stream event for inactive session:', evSessionId, 'active:', this._activeSessionId, 'type:', event.type);
      return;
    }

    console.log('[ViewProvider] Stream event:', event.type);
    
    if (event.type === 'message.part.updated') {
      const part = event.properties.part;
      console.log('[ViewProvider] Sending part-update to webview:', {
        partId: part.id,
        partType: part.type,
        messageID: part.messageID
      });
      
      // Forward part updates to webview for real-time display
      this._sendMessage({
        type: 'part-update',
        part: event.properties.part,
        delta: event.properties.delta,
        sessionId: evSessionId
      });
    } else if (event.type === 'message.updated') {
      console.log('[ViewProvider] Sending message-update to webview:', {
        messageId: event.properties.info.id
      });
      
      // Full message update (can use for final state)
      this._sendMessage({
        type: 'message-update',
        message: event.properties.info,
        sessionId: evSessionId
      });
    } else if (event.type === 'session.idle') {
      // Session finished processing
      console.log('[ViewProvider] Session idle - streaming complete');
    }
    // Add more event handlers as needed
  }

  private _extractResponseText(response: { parts: Array<{ type: string; text?: string }> }): string {
    // The response contains parts, extract text from them for backward compatibility
    if (response?.parts && Array.isArray(response.parts)) {
      return response.parts
        .filter((part) => part.type === 'text' && part.text)
        .map((part) => part.text)
        .join('\n');
    }
    return 'No response received';
  }

  private _sendMessage(message: Record<string, unknown>) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Get URIs for the webview
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'main.css')
    );

    // Use a nonce for security
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <link href="${styleUri}" rel="stylesheet">
        <title>OpenCode</title>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
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
