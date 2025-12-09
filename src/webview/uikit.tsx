/* @jsxImportSource solid-js */
import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { InputBar } from "./components/InputBar";
import { MessageList } from "./components/MessageList";
import { TopBar } from "./components/TopBar";
import { ContextIndicator } from "./components/ContextIndicator";
import { FileChangesSummary } from "./components/FileChangesSummary";
import type { Message, Agent, Session, Permission, ContextInfo, FileChangesInfo } from "./types";
import "./uikit.css"; // VSCode theme variable fallbacks for browser
import "./App.css";

// Fake data for UI development
const fakeAgents: Agent[] = [
  { name: "general", description: "General purpose agent", mode: "primary", builtIn: true },
  { name: "code", description: "Code specialist", mode: "subagent", builtIn: true },
  { name: "debug", description: "Debugging expert", mode: "subagent", builtIn: true },
];

const fakeSessions: Session[] = [
  {
    id: "session-1",
    title: "Fix authentication bug",
    projectID: "project-1",
    directory: "/Users/developer/project",
    time: {
      created: Date.now() - 3600000,
      updated: Date.now() - 3600000,
    },
  },
  {
    id: "session-2",
    title: "Add dark mode support",
    projectID: "project-1",
    directory: "/Users/developer/project",
    time: {
      created: Date.now() - 7200000,
      updated: Date.now() - 7200000,
    },
  },
  {
    id: "session-3",
    title: "Refactor API endpoints",
    projectID: "project-1",
    directory: "/Users/developer/project",
    time: {
      created: Date.now() - 10800000,
      updated: Date.now() - 10800000,
    },
  },
];

const fakeMessages: Message[] = [
  {
    id: "msg-1",
    type: "user",
    text: "Can you help me fix a bug in my authentication system?",
  },
  {
    id: "msg-2",
    type: "assistant",
    text: "I'd be happy to help you fix the authentication bug. Let me first take a look at your authentication files to understand the current implementation.",
    parts: [
      {
        id: "part-1",
        type: "text",
        text: "I'd be happy to help you fix the authentication bug. Let me first take a look at your authentication files to understand the current implementation.",
        messageID: "msg-2",
      },
      {
        id: "part-2",
        type: "tool",
        tool: "read",
        messageID: "msg-2",
        state: {
          input: { filePath: "/src/auth/login.ts" },
          status: "completed",
          output: "// Authentication logic here...",
        },
      },
      {
        id: "part-3",
        type: "tool",
        tool: "bash",
        messageID: "msg-2",
        callID: "call-1",
        state: {
          input: {
            command: "npm test auth",
            description: "Run authentication tests",
          },
          status: "pending",
        },
      },
    ],
  },
  {
    id: "msg-3",
    type: "user",
    text: "The login endpoint returns 401 even with correct credentials",
  },
  {
    id: "msg-4",
    type: "assistant",
    text: "I found the issue. The password comparison is using strict equality instead of a secure comparison method. Let me fix this for you.",
    parts: [
      {
        id: "part-4",
        type: "text",
        text: "I found the issue. The password comparison is using strict equality instead of a secure comparison method. Let me fix this for you.",
        messageID: "msg-4",
      },
      {
        id: "part-5",
        type: "tool",
        tool: "edit",
        messageID: "msg-4",
        state: {
          input: { filePath: "/src/auth/login.ts" },
          status: "completed",
        },
      },
      {
        id: "part-6",
        type: "tool",
        tool: "grep",
        messageID: "msg-4",
        state: {
          input: { pattern: "password.*===" },
          status: "completed",
          output: "login.ts:45:  if (user.password === inputPassword) {",
        },
      },
    ],
  },
  {
    id: "msg-5",
    type: "assistant",
    text: "I've updated the authentication logic to use bcrypt.compare() for secure password verification. This should resolve the 401 errors you were experiencing.",
    parts: [
      {
        id: "part-7",
        type: "text",
        text: "I've updated the authentication logic to use bcrypt.compare() for secure password verification. This should resolve the 401 errors you were experiencing.",
        messageID: "msg-5",
      },
    ],
  },
];

function UIKit() {
  const [input, setInput] = createSignal("");
  const [messages, setMessages] = createSignal<Message[]>(fakeMessages);
  const [isThinking, setIsThinking] = createSignal(false);
  const [agents] = createSignal<Agent[]>(fakeAgents);
  const [selectedAgent, setSelectedAgent] = createSignal<string | null>(
    "general"
  );
  const [sessions] = createSignal<Session[]>(fakeSessions);
  const [currentSessionId, setCurrentSessionId] = createSignal<string | null>(
    "session-1"
  );
  const [currentSessionTitle, setCurrentSessionTitle] =
    createSignal<string>("Fix authentication bug");
  
  // Context info for testing
  const [contextInfo, setContextInfo] = createSignal<ContextInfo>({
    usedTokens: 85000,
    limitTokens: 200000,
    percentage: 42.5,
  });

  // File changes for testing
  const [fileChanges, setFileChanges] = createSignal<FileChangesInfo>({
    fileCount: 4,
    additions: 127,
    deletions: 43,
  });
  
  // Pending permissions tracked separately from tool parts
  const [pendingPermissions, setPendingPermissions] = createSignal<Map<string, Permission>>(
    new Map([
      ["call-1", {
        id: "perm-1",
        type: "bash",
        sessionID: "session-1",
        messageID: "msg-2",
        callID: "call-1",
        title: "Run bash command: npm test auth",
        metadata: {},
        time: { created: Date.now() },
      }],
    ])
  );

  const hasMessages = () => messages().length > 0;

  const handleSubmit = () => {
    const text = input().trim();
    if (!text) return;

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        type: "user",
        text,
      },
    ]);

    setInput("");
    setIsThinking(true);

    // Simulate AI response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          type: "assistant",
          text: "This is a simulated response in the UI kit. In the real app, this would be an actual AI response.",
          parts: [
            {
              id: `part-${Date.now()}`,
              type: "text",
              text: "This is a simulated response in the UI kit. In the real app, this would be an actual AI response.",
              messageID: `msg-${Date.now()}`,
            },
          ],
        },
      ]);
      setIsThinking(false);
    }, 1000);
  };

  const handleSessionSelect = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    const session = sessions().find((s) => s.id === sessionId);
    if (session) {
      setCurrentSessionTitle(session.title);
    }
  };

  const handleNewSession = () => {
    setCurrentSessionId(null);
    setCurrentSessionTitle("New Session");
    setMessages([]);
  };

  const handlePermissionResponse = (permissionId: string, response: "once" | "always" | "reject") => {
    console.log(`[UIKit] Permission response: ${response} for ${permissionId}`);
    // Remove the permission from pending permissions
    setPendingPermissions((prev) => {
      const next = new Map(prev);
      for (const [key, perm] of next.entries()) {
        if (perm.id === permissionId) {
          next.delete(key);
          break;
        }
      }
      return next;
    });
  };

  // Control panel for testing states
  const toggleThinking = () => setIsThinking(!isThinking());
  const clearMessages = () => setMessages([]);
  const loadFakeMessages = () => setMessages(fakeMessages);
  
  const cycleContextPercentage = () => {
    const current = contextInfo().percentage;
    console.log('[UIKit] Current context percentage:', current);
    if (current < 60) {
      // White -> Pale yellow
      setContextInfo({ usedTokens: 140000, limitTokens: 200000, percentage: 70 });
    } else if (current < 85) {
      // Pale yellow -> Orange
      setContextInfo({ usedTokens: 180000, limitTokens: 200000, percentage: 90 });
    } else {
      // Orange -> White
      setContextInfo({ usedTokens: 50000, limitTokens: 200000, percentage: 25 });
    }
    console.log('[UIKit] New context percentage:', contextInfo().percentage);
  };

  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100vh" }}>
      {/* Control Panel */}
      <div
        style={{
          padding: "8px",
          background: "var(--vscode-editor-background, #1e1e1e)",
          "border-bottom": "1px solid var(--vscode-panel-border, #3a3a3a)",
          display: "flex",
          gap: "8px",
          "flex-wrap": "wrap",
          "align-items": "center",
        }}
      >
        <button 
          onClick={toggleThinking} 
          style={{ 
            padding: "4px 8px", 
            "font-size": "12px",
            background: "var(--vscode-button-background, #0e639c)",
            color: "var(--vscode-button-foreground, white)",
            border: "none",
            "border-radius": "2px",
            cursor: "pointer",
          }}
        >
          {isThinking() ? "Stop Thinking" : "Start Thinking"}
        </button>
        <button 
          onClick={clearMessages} 
          style={{ 
            padding: "4px 8px", 
            "font-size": "12px",
            background: "var(--vscode-button-secondaryBackground, #3a3a3a)",
            color: "var(--vscode-button-secondaryForeground, white)",
            border: "none",
            "border-radius": "2px",
            cursor: "pointer",
          }}
        >
          Clear Messages
        </button>
        <button 
          onClick={loadFakeMessages} 
          style={{ 
            padding: "4px 8px", 
            "font-size": "12px",
            background: "var(--vscode-button-secondaryBackground, #3a3a3a)",
            color: "var(--vscode-button-secondaryForeground, white)",
            border: "none",
            "border-radius": "2px",
            cursor: "pointer",
          }}
        >
          Load Fake Messages
        </button>
        <button 
          onClick={() => {
            console.log('[UIKit] Button clicked!');
            cycleContextPercentage();
          }}
          style={{ 
            padding: "4px 8px", 
            "font-size": "12px",
            background: "var(--vscode-button-secondaryBackground, #3a3a3a)",
            color: "var(--vscode-button-secondaryForeground, white)",
            border: "none",
            "border-radius": "2px",
            cursor: "pointer",
          }}
        >
          Cycle Context % ({contextInfo().percentage.toFixed(0)}%)
        </button>
        <span style={{ "margin-left": "auto", color: "var(--vscode-descriptionForeground, #888)", "font-size": "12px" }}>
          🎨 UI Kit - Hot Reload Enabled
        </span>
      </div>

      {/* Main App UI */}
      <div class={`app ${hasMessages() ? "app--has-messages" : ""}`} style={{ flex: 1, width: "320px", margin: "0 auto" }}>
        <TopBar
          sessions={sessions()}
          currentSessionId={currentSessionId()}
          currentSessionTitle={currentSessionTitle()}
          onSessionSelect={handleSessionSelect}
          onNewSession={handleNewSession}
        />

        {!hasMessages() && (
          <InputBar
            value={input()}
            onInput={setInput}
            onSubmit={handleSubmit}
            disabled={false}
            selectedAgent={selectedAgent()}
            agents={agents()}
            onAgentChange={setSelectedAgent}
          />
        )}

        <MessageList
          messages={messages()}
          isThinking={isThinking()}
          workspaceRoot="/Users/developer/project"
          pendingPermissions={pendingPermissions()}
          onPermissionResponse={handlePermissionResponse}
        />

        {hasMessages() && (
          <>
            <div class="input-divider" />
            <div class="input-status-row">
              <FileChangesSummary fileChanges={fileChanges()} />
              <ContextIndicator contextInfo={contextInfo()} />
            </div>
            <InputBar
              value={input()}
              onInput={setInput}
              onSubmit={handleSubmit}
              disabled={false}
              selectedAgent={selectedAgent()}
              agents={agents()}
              onAgentChange={setSelectedAgent}
            />
          </>
        )}
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  render(() => <UIKit />, root);
}
