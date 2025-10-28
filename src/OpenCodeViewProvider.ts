import * as vscode from 'vscode';
import { OpenCodeService } from './OpenCodeService';
import type { Event } from '@opencode-ai/sdk';

export class OpenCodeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'opencode.chatView';
  private _view?: vscode.WebviewView;

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
            await this._handleSendPrompt(message.text);
            return;
          case 'ready':
            // Webview is ready, send initialization data
            this._sendMessage({
              type: 'init',
              ready: this._openCodeService.isReady()
            });
            return;
        }
      }
    );
  }

  private async _handleSendPrompt(text: string) {
    try {
      // Send thinking state
      this._sendMessage({ type: 'thinking', isThinking: true });

      // Create session if needed
      let sessionId = await this._openCodeService.getCurrentSession();
      if (!sessionId) {
        sessionId = await this._openCodeService.createSession();
      }

      // Send the prompt with streaming
      await this._openCodeService.sendPromptStreaming(
        text,
        (event) => this._handleStreamEvent(event),
        sessionId
      );

      this._sendMessage({ type: 'thinking', isThinking: false });
    } catch (error) {
      console.error('Error sending prompt:', error);
      this._sendMessage({
        type: 'error',
        message: `Error: ${(error as Error).message}`
      });
      this._sendMessage({ type: 'thinking', isThinking: false });
    }
  }

  private _handleStreamEvent(event: Event) {
    console.log('Stream event:', event.type, event);
    
    if (event.type === 'message.part.updated') {
      // Forward part updates to webview for real-time display
      this._sendMessage({
        type: 'part-update',
        part: event.properties.part,
        delta: event.properties.delta
      });
    } else if (event.type === 'message.updated') {
      // Full message update (can use for final state)
      this._sendMessage({
        type: 'message-update',
        message: event.properties.info
      });
    } else if (event.type === 'session.idle') {
      // Session finished processing
      console.log('Session idle - streaming complete');
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
