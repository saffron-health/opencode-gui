
import { createSignal, For, Show } from "solid-js";
import { render } from "solid-js/web";
import "./uikit.css";
import "./App.css";
import { ContextIndicator } from "./components/ContextIndicator";
import { FileChangesSummary } from "./components/FileChangesSummary";
import { InputBar } from "./components/InputBar";
import { MessageList } from "./components/MessageList";
import { TopBar } from "./components/TopBar";
import { MockSyncProvider } from "./state/MockSyncProvider";
import type { QueuedMessage } from "./App";
import type {
  Agent,
  ContextInfo,
  FileChangesInfo,
  Message,
  Permission,
  Session,
} from "./types";

const fakeQueuedMessages: QueuedMessage[] = [
  { id: "q1", text: "After that, can you add unit tests for the auth module?" },
  { id: "q2", text: "Also update the README with the new API endpoints" },
];

// Fake data for UI development
const fakeAgents: Agent[] = [
  {
    name: "general",
    description: "General purpose agent",
    mode: "primary",
    builtIn: true,
  },
  {
    name: "code",
    description: "Code specialist",
    mode: "subagent",
    builtIn: true,
  },
  {
    name: "debug",
    description: "Debugging expert",
    mode: "subagent",
    builtIn: true,
  },
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
          status: "pending",
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
            command: `npm run test -- --grep "auth" \\
  --reporter=verbose \\
  --coverage \\
  --watch=false \\
  --timeout=5000`,
            description: "Run authentication tests",
          },
          status: "pending",
        },
      },
      {
        id: "part-3b",
        type: "tool",
        tool: "task",
        messageID: "msg-2",
        callID: "call-task-1",
        state: {
          input: {
            description: "Refactoring authentication module",
            subagent_type: "code",
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
          metadata: {
            diff: `@@ -42,10 +42,12 @@ export async function login(email: string, password: string) {
   const user = await db.users.findByEmail(email);
   if (!user) {
     throw new AuthError('User not found');
   }
-  if (user.password === password) {
-    return generateToken(user);
+  const isValid = await bcrypt.compare(password, user.hashedPassword);
+  if (isValid) {
+    const token = generateToken(user);
+    await logLoginAttempt(user.id, true);
+    return token;
   }
-  throw new AuthError('Invalid password');
+  await logLoginAttempt(user.id, false);
+  throw new AuthError('Invalid credentials');
 }`,
          },
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
          output: `login.ts:45:  if (user.password === inputPassword) {
signup.ts:23:  if (password === confirmPassword) {
resetPassword.ts:67:  if (oldPassword === newPassword) {
validators.ts:12:  return password === user.hashedPassword;`,
        },
      },
      {
        id: "part-6b",
        type: "tool",
        tool: "edit",
        messageID: "msg-4",
        state: {
          input: { filePath: "/src/auth/validators.ts" },
          status: "completed",
          metadata: {
            diff: `@@ -10,5 +10,5 @@ export function validateUser(user: User) {
+  return user.email && user.password;
 }`,
            diagnostics: {
              "/src/auth/validators.ts": [
                { severity: 1, message: "Property 'email' does not exist on type 'User'" },
                { severity: 1, message: "Cannot find name 'validateEmail'" },
                { severity: 2, message: "Variable 'user' is declared but never used" },
              ],
            },
          },
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
  {
    id: "msg-6",
    type: "assistant",
    text: "I've also created some tasks to track the remaining work.",
    parts: [
      {
        id: "part-8",
        type: "text",
        text: "I've also created some tasks to track the remaining work.",
        messageID: "msg-6",
      },
      {
        id: "part-9",
        type: "tool",
        tool: "todowrite",
        messageID: "msg-6",
        state: {
          input: {
            todos: [
              {
                id: "1",
                content: "Add unit tests for bcrypt password comparison",
                status: "pending",
              },
              {
                id: "2",
                content: "Update documentation for new auth flow",
                status: "pending",
              },
              {
                id: "3",
                content: "Review session timeout handling",
                status: "in-progress",
              },
            ],
          },
          status: "completed",
        },
      },
      {
        id: "part-10",
        type: "tool",
        tool: "todoread",
        messageID: "msg-6",
        state: {
          input: {},
          status: "completed",
          output: JSON.stringify([
            {
              id: "1",
              content: "Add unit tests for bcrypt password comparison",
              status: "pending",
            },
            {
              id: "2",
              content: "Update documentation for new auth flow",
              status: "completed",
            },
            {
              id: "3",
              content: "Review session timeout handling",
              status: "in-progress",
            },
          ]),
        },
      },
    ],
  },
  {
    id: "msg-7",
    type: "user",
    text: "Can you run the tests?",
  },
  {
    id: "msg-8",
    type: "assistant",
    text: "I'll run the test suite for you.",
    parts: [
      {
        id: "part-11",
        type: "text",
        text: "I'll run the test suite for you.",
        messageID: "msg-8",
      },
      {
        id: "part-12",
        type: "tool",
        tool: "bash",
        messageID: "msg-8",
        state: {
          input: {
            command: "npm test",
            description: "Run test suite",
          },
          status: "error",
          error: "Error: ENOENT: no such file or directory, open 'package.json'",
        },
      },
      {
        id: "part-13",
        type: "tool",
        tool: "bash",
        messageID: "msg-8",
        state: {
          input: {
            command: "npm run build",
            description: "Build project",
          },
          status: "error",
          error: "interrupted",
        },
      },
      {
        id: "part-14",
        type: "tool",
        tool: "read",
        messageID: "msg-8",
        state: {
          input: { filePath: "/nonexistent/file.ts" },
          status: "error",
          error: "File not found: /nonexistent/file.ts",
        },
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
  const [currentSessionTitle, setCurrentSessionTitle] = createSignal<string>(
    "Fix authentication bug"
  );

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
  const [pendingPermissions, setPendingPermissions] = createSignal<
    Map<string, Permission>
  >(
    new Map([
      [
        "call-1",
        {
          id: "perm-1",
          type: "bash",
          sessionID: "session-1",
          messageID: "msg-2",
          callID: "call-1",
          title: "Run bash command: npm run test -- --grep auth",
          metadata: {},
          time: { created: Date.now() },
        },
      ],
    ])
  );

  // Queued messages state
  const [queuedMessages, setQueuedMessages] = createSignal<QueuedMessage[]>([]);
  const [showQueuedMessages, setShowQueuedMessages] = createSignal(false);
  
  // Error state for testing error banner
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

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

  const handlePermissionResponse = (
    permissionId: string,
    response: "once" | "always" | "reject"
  ) => {
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
  const toggleQueuedMessages = () => {
    if (showQueuedMessages()) {
      setQueuedMessages([]);
      setShowQueuedMessages(false);
    } else {
      setQueuedMessages(fakeQueuedMessages);
      setShowQueuedMessages(true);
    }
  };

  const cycleContextPercentage = () => {
    const current = contextInfo().percentage;
    if (current < 60) {
      // White -> Pale yellow
      setContextInfo({
        usedTokens: 140000,
        limitTokens: 200000,
        percentage: 70,
      });
    } else if (current < 85) {
      // Pale yellow -> Orange
      setContextInfo({
        usedTokens: 180000,
        limitTokens: 200000,
        percentage: 90,
      });
    } else {
      // Orange -> White
      setContextInfo({
        usedTokens: 50000,
        limitTokens: 200000,
        percentage: 25,
      });
    }
  };

  const toggleError = () => {
    if (errorMessage()) {
      setErrorMessage(null);
    } else {
      setErrorMessage("This is a test error message! Something went wrong with the service connection.");
    }
  };

  const controlButtons = [
    { label: () => isThinking() ? "Stop Thinking" : "Start Thinking", onClick: toggleThinking },
    { label: () => "Clear Messages", onClick: clearMessages },
    { label: () => "Load Fake Messages", onClick: loadFakeMessages },
    { label: () => `Context % (${contextInfo().percentage.toFixed(0)}%)`, onClick: cycleContextPercentage },
    { label: () => showQueuedMessages() ? "Hide Queue" : "Show Queue", onClick: toggleQueuedMessages },
    { label: () => errorMessage() ? "Hide Error" : "Show Error", onClick: toggleError },
  ];

  return (
    <MockSyncProvider
      messages={messages()}
      sessions={sessions()}
      agents={agents()}
      isThinking={isThinking()}
      contextInfo={contextInfo()}
      fileChanges={fileChanges()}
      permissions={pendingPermissions()}
      workspaceRoot="/Users/developer/project"
    >
      <div style={{ display: "flex", height: "100vh" }}>
        {/* Sidebar Control Panel */}
        <div
          style={{
            width: "180px",
            padding: "12px",
            background: "var(--vscode-sideBar-background, #252526)",
            "border-right": "1px solid var(--vscode-panel-border, #3a3a3a)",
            display: "flex",
            "flex-direction": "column",
            gap: "8px",
            "overflow-y": "auto",
          }}
        >
          <span
            style={{
              color: "var(--vscode-descriptionForeground, #888)",
              "font-size": "11px",
              "text-transform": "uppercase",
              "letter-spacing": "0.5px",
              "margin-bottom": "4px",
            }}
          >
          UI Kit Controls
        </span>
        <For each={controlButtons}>
          {(btn) => (
            <button
              onClick={btn.onClick}
              style={{
                padding: "6px 10px",
                "font-size": "12px",
                background: "var(--vscode-button-secondaryBackground, #3a3a3a)",
                color: "var(--vscode-button-secondaryForeground, white)",
                border: "none",
                "border-radius": "4px",
                cursor: "pointer",
                "text-align": "left",
              }}
            >
              {btn.label()}
            </button>
          )}
        </For>
      </div>

      {/* Main App UI */}
      <div
        style={{ flex: 1, display: "flex", "flex-direction": "column" }}
      >
        <div
          class={`app ${hasMessages() ? "app--has-messages" : ""}`}
          style={{ flex: 1, width: "320px", margin: "0 auto" }}
        >
          <Show when={errorMessage()}>
            <div class="error-banner">
              <span class="error-banner__message">{errorMessage()}</span>
              <button class="error-banner__dismiss" onClick={() => setErrorMessage(null)} aria-label="Dismiss error">×</button>
            </div>
          </Show>
          
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
              onCancel={() => setIsThinking(false)}
              onQueue={() => {}}
              disabled={false}
              isThinking={isThinking()}
              selectedAgent={selectedAgent()}
              agents={agents()}
              onAgentChange={setSelectedAgent}
              queuedMessages={queuedMessages()}
              onRemoveFromQueue={(id) => setQueuedMessages((prev) => prev.filter((m) => m.id !== id))}
              onEditQueuedMessage={() => {}}
              attachments={[]}
              onRemoveAttachment={() => {}}
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
                onCancel={() => setIsThinking(false)}
                onQueue={() => {}}
                disabled={false}
                isThinking={isThinking()}
                selectedAgent={selectedAgent()}
                agents={agents()}
                onAgentChange={setSelectedAgent}
                queuedMessages={queuedMessages()}
                onRemoveFromQueue={(id) => setQueuedMessages((prev) => prev.filter((m) => m.id !== id))}
                onEditQueuedMessage={() => {}}
                attachments={[]}
                onRemoveAttachment={() => {}}
              />
            </>
          )}
        </div>
        </div>
      </div>
    </MockSyncProvider>
  );
}

const root = document.getElementById("root");
if (root) {
  render(() => <UIKit />, root);
}
