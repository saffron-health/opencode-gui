import * as vscode from 'vscode';
import { OpenCodeService } from './OpenCodeService';
import type { Event } from '@opencode-ai/sdk';
import { getLogger } from './extension';
import type { HostMessage, WebviewMessage, IncomingMessage, MessagePart } from './shared/messages';
import { parseWebviewMessage } from './shared/messages';

const LAST_AGENT_KEY = 'opencode.lastUsedAgent';

export class OpenCodeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'opencode.chatView';
  private _view?: vscode.WebviewView;
  private _activeSessionId?: string;
  private _currentModelContextLimit: number = 200000; // Default context limit

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
      case 'sendPrompt':
        await this._handleSendPrompt(message.text, message.agent);
        break;
      case 'ready':
        await this._handleReady();
        break;
      case 'getAgents':
        await this._handleGetAgents();
        break;
      case 'load-sessions':
        await this._handleLoadSessions();
        break;
      case 'switch-session':
        await this._handleSwitchSession(message.sessionId);
        break;
      case 'create-session':
        await this._handleCreateSession();
        break;
      case 'permission-response':
        await this._handlePermissionResponse(message.sessionId, message.permissionId, message.response);
        break;
      case 'cancel-session':
        await this._handleCancelSession();
        break;
      case 'agent-changed':
        await this._handleAgentChanged(message.agent);
        break;
      case 'edit-previous-message':
        await this._handleEditPreviousMessage(message.sessionId, message.messageId, message.newText, message.agent);
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
        }
      }
      
      this._sendMessage({
        type: 'init',
        ready: this._openCodeService.isReady(),
        workspaceRoot: this._openCodeService.getWorkspaceRoot(),
        currentSessionId,
        currentSessionTitle,
        currentSessionMessages: messages as IncomingMessage[] | undefined
      });
    } catch (error) {
      console.error('Error handling ready:', error);
      this._sendMessage({
        type: 'init',
        ready: this._openCodeService.isReady(),
        workspaceRoot: this._openCodeService.getWorkspaceRoot(),
        currentSessionId: undefined
      });
    }
  }

  private async _handleGetAgents() {
    try {
      const agents = await this._openCodeService.getAgents();
      const lastUsedAgent = this._globalState.get<string>(LAST_AGENT_KEY);
      
      // Determine the default agent: last used if still valid, otherwise first agent
      let defaultAgent: string | undefined;
      if (lastUsedAgent && agents.some(a => a.name === lastUsedAgent)) {
        defaultAgent = lastUsedAgent;
      } else if (agents.length > 0) {
        defaultAgent = agents[0].name;
      }
      
      this._sendMessage({ 
        type: 'agentList', 
        agents,
        defaultAgent
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

  private async _handleAgentChanged(agent: string) {
    // Persist the selected agent
    await this._globalState.update(LAST_AGENT_KEY, agent);
    const logger = getLogger();
    logger.info('[ViewProvider] Agent selection persisted:', agent);
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
      const session = await this._openCodeService.switchSession(sessionId);
      
      const messages = await this._openCodeService.getMessages(sessionId);
      
      this._sendMessage({
        type: 'session-switched',
        sessionId,
        title: this._openCodeService.getCurrentSessionTitle(),
        messages: messages as unknown as IncomingMessage[]
      });

      // Send file changes summary if available
      if (session.summary?.diffs) {
        const diffs = session.summary.diffs;
        const fileCount = diffs.length;
        const additions = diffs.reduce((sum: number, d: any) => sum + (d.additions || 0), 0);
        const deletions = diffs.reduce((sum: number, d: any) => sum + (d.deletions || 0), 0);
        
        this._sendMessage({
          type: 'file-changes-update',
          fileChanges: {
            fileCount,
            additions,
            deletions
          }
        });
      }

      // Find last assistant message to restore context info
      const lastAssistantMsg = [...messages].reverse().find((m: any) => {
        const info = m.info || m;
        return info.role === 'assistant' && info.tokens;
      });
      
      if (lastAssistantMsg) {
        const info: any = lastAssistantMsg.info || lastAssistantMsg;
        if (info.tokens) {
          this._updateContextInfo(info.tokens, info.modelID, info.providerID);
        }
      }
    } catch (error) {
      console.error('Error switching session:', error);
      this._sendMessage({
        type: 'error',
        message: `Failed to switch session: ${(error as Error).message}`
      });
    }
  }

  private async _handleCreateSession() {
    try {
      const sessionId = await this._openCodeService.createNewSession();
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

  private async _handlePermissionResponse(sessionId: string, permissionId: string, response: "once" | "always" | "reject") {
    try {
      console.log('[ViewProvider] Handling permission response:', { sessionId, permissionId, response });
      await this._openCodeService.respondToPermission(sessionId, permissionId, response);
      console.log('[ViewProvider] Permission response sent successfully');
    } catch (error) {
      console.error('[ViewProvider] Error responding to permission:', error);
      this._sendMessage({
        type: 'error',
        message: `Failed to respond to permission: ${(error as Error).message}`
      });
    }
  }

  private async _handleEditPreviousMessage(sessionId: string, messageId: string, newText: string, agent?: string) {
    const logger = getLogger();
    logger.info('[ViewProvider] Handling edit previous message:', { sessionId, messageId, newText: newText.substring(0, 50) });

    try {
      // Send thinking state
      this._sendMessage({ type: 'thinking', isThinking: true });

      // Revert to before the message being edited
      await this._openCodeService.revertToMessage(sessionId, messageId);
      logger.info('[ViewProvider] Session reverted successfully');

      // Update the active session
      this._activeSessionId = sessionId;

      const messages = await this._openCodeService.getMessages(sessionId);
      this._sendMessage({
        type: 'session-switched',
        sessionId,
        title: this._openCodeService.getCurrentSessionTitle(),
        messages: messages as unknown as IncomingMessage[]
      });

      // Now send the new prompt
      await this._openCodeService.sendPromptStreaming(
        newText,
        (event) => this._handleStreamEvent(event),
        sessionId,
        agent
      );

      this._sendMessage({ type: 'thinking', isThinking: false });

      // Update session title if needed
      try {
        const session = await this._openCodeService.switchSession(sessionId);
        if (session.title) {
          this._sendMessage({
            type: 'session-title-update',
            sessionId: session.id,
            title: session.title
          });
        }
      } catch (e) {
        // Ignore errors
      }
    } catch (error) {
      logger.error('[ViewProvider] Error editing previous message:', error);
      this._sendMessage({
        type: 'error',
        message: `Failed to edit message: ${(error as Error).message}`
      });
      this._sendMessage({ type: 'thinking', isThinking: false });
    }
  }

  private async _handleCancelSession() {
    const sessionId = this._activeSessionId || this._openCodeService.getCurrentSessionId();
    if (!sessionId) {
      console.log('[ViewProvider] No active session to cancel');
      return;
    }

    try {
      console.log('[ViewProvider] Cancelling session:', sessionId);
      await this._openCodeService.abortSession(sessionId);
      this._sendMessage({ type: 'thinking', isThinking: false });
      console.log('[ViewProvider] Session cancelled successfully');
    } catch (error) {
      console.error('[ViewProvider] Error cancelling session:', error);
      this._sendMessage({
        type: 'error',
        message: `Failed to cancel: ${(error as Error).message}`
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
        // Notify webview of the new session so it can track title updates
        this._sendMessage({
          type: 'session-switched',
          sessionId,
          title: this._openCodeService.getCurrentSessionTitle()
        });
      }

      // Send the prompt with streaming, including selected agent
      await this._openCodeService.sendPromptStreaming(
        text,
        (event) => this._handleStreamEvent(event),
        sessionId,
        agent
      );

      this._sendMessage({ type: 'thinking', isThinking: false });

      // Check if the session title was updated (auto-generated by OpenCode after first message)
      // The title update might happen after streaming completes
      try {
        const session = await this._openCodeService.switchSession(sessionId);
        if (session.title && session.title !== 'VSCode Session') {
          const logger = getLogger();
          logger.info('[ViewProvider] Session title updated after streaming:', session.title);
          this._sendMessage({
            type: 'session-title-update',
            sessionId: session.id,
            title: session.title
          });
        }
      } catch (e) {
        // Ignore errors when fetching session
      }

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
    
    if (event.type === 'message.removed') {
      const messageID = (event as any).properties?.messageID;
      console.log('[ViewProvider] Message removed:', messageID);
      
      // Forward message removal to webview
      this._sendMessage({
        type: 'message-removed',
        messageId: messageID,
        sessionId: evSessionId
      });
    } else if (event.type === 'message.part.updated') {
      const part = event.properties.part;
      console.log('[ViewProvider] Sending part-update to webview:', {
        partId: part.id,
        partType: part.type,
        messageID: part.messageID
      });
      
      this._sendMessage({
        type: 'part-update',
        part: event.properties.part as MessagePart & { messageID: string },
        delta: event.properties.delta,
        sessionId: evSessionId
      });
    } else if (event.type === 'message.updated') {
      console.log('[ViewProvider] Sending message-update to webview:', {
        messageId: event.properties.info.id
      });
      
      this._sendMessage({
        type: 'message-update',
        message: event.properties.info as IncomingMessage,
        sessionId: evSessionId
      });

      // Update context info if this is an assistant message
      const info: any = event.properties.info;
      if (info.role === 'assistant' && info.tokens) {
        this._updateContextInfo(info.tokens, info.modelID, info.providerID);
      }
    } else if (event.type === 'permission.updated') {
      console.log('[ViewProvider] Permission required:', {
        permissionId: event.properties.id,
        type: event.properties.type,
        sessionID: event.properties.sessionID,
        callID: event.properties.callID,
        messageID: event.properties.messageID
      });
      
      // Forward permission request to webview
      console.log('[ViewProvider] Sending permission-required message to webview');
      this._sendMessage({
        type: 'permission-required',
        permission: event.properties
      });
      console.log('[ViewProvider] Permission message sent');
    } else if (event.type === 'permission.replied') {
      console.log('[ViewProvider] Permission replied:', {
        permissionId: event.properties.permissionID,
        response: event.properties.response
      });
      // Just log it - the UI will update via part-update events
    } else if (event.type === 'session.idle') {
      // Session finished processing
      console.log('[ViewProvider] Session idle - streaming complete');
    } else if (event.type === 'session.updated') {
      const session = event.properties.info;
      const logger = getLogger();
      logger.info('[ViewProvider] session.updated event received', {
        sessionId: session.id,
        title: session.title,
        activeSessionId: this._activeSessionId,
        isMatch: session.id === this._activeSessionId
      });
      
      // Update session title if it changed (OpenCode auto-generates titles after first message)
      if (session.id === this._activeSessionId && session.title) {
        logger.info('[ViewProvider] Sending session-title-update to webview', { title: session.title });
        this._sendMessage({
          type: 'session-title-update',
          sessionId: session.id,
          title: session.title
        });
      }
      
      // Send file changes summary if available
      if (session.summary?.diffs) {
        const diffs = session.summary.diffs;
        const fileCount = diffs.length;
        const additions = diffs.reduce((sum: number, d: any) => sum + (d.additions || 0), 0);
        const deletions = diffs.reduce((sum: number, d: any) => sum + (d.deletions || 0), 0);
        
        this._sendMessage({
          type: 'file-changes-update',
          fileChanges: {
            fileCount,
            additions,
            deletions
          }
        });
      }
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

  private async _updateContextInfo(tokens: any, modelID: string, providerID: string) {
    try {
      // Get the model's context limit from the SDK
      const configResult = await this._openCodeService.getConfig();
      const contextLimit = configResult?.providers?.[providerID]?.models?.[modelID]?.limit?.context;
      if (contextLimit) {
        this._currentModelContextLimit = contextLimit;
      }

      // Calculate total tokens used (input + output + cache read)
      const usedTokens = (tokens.input || 0) + (tokens.output || 0) + (tokens.cache?.read || 0);
      
      // Skip update if no tokens yet (still streaming)
      if (usedTokens === 0) {
        return;
      }
      
      const percentage = Math.min(100, (usedTokens / this._currentModelContextLimit) * 100);

      this._sendMessage({
        type: 'context-update',
        contextInfo: {
          usedTokens,
          limitTokens: this._currentModelContextLimit,
          percentage
        }
      });
    } catch (error) {
      console.error('[ViewProvider] Error updating context info:', error);
    }
  }

  private _sendMessage(message: HostMessage) {
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
      vscode.Uri.joinPath(this._extensionUri, 'out', 'App.css')
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
