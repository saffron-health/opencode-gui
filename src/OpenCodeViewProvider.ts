import * as vscode from 'vscode';
import { OpenCodeService } from './OpenCodeService';

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

      // Send the prompt
      const response = await this._openCodeService.sendPrompt(text);

      // Get the full messages including tool calls
      const messages = await this._openCodeService.getMessages(sessionId);
      const lastMessage = messages[messages.length - 1];
      
      // Log for debugging
      console.log('Last message parts:', JSON.stringify(lastMessage?.parts, null, 2));

      // Use parts from the full message if available, otherwise fall back to response
      const parts = lastMessage?.parts || response.parts || [];

      // Extract text from the response for backward compatibility
      const responseText = this._extractResponseText({ parts });

      // Send response back to webview with both text and parts
      this._sendMessage({
        type: 'response',
        text: responseText,
        parts: parts
      });

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
