/* @jsxImportSource solid-js */
import { createSignal, createMemo, Show, onMount } from "solid-js";
import { InputBar } from "./components/InputBar";
import { MessageList } from "./components/MessageList";
import { TopBar } from "./components/TopBar";
import { ContextIndicator } from "./components/ContextIndicator";
import { FileChangesSummary } from "./components/FileChangesSummary";
import { useVsCodeBridge } from "./hooks/useVsCodeBridge";
import { applyPartUpdate, applyMessageUpdate } from "./utils/messageUtils";
import type { Message, Agent, Session, Permission, ContextInfo, FileChangesInfo } from "./types";

const DEBUG = false;

function App() {
  const [input, setInput] = createSignal("");
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [isThinking, setIsThinking] = createSignal(false);
  const [isReady, setIsReady] = createSignal(false);
  const [agents, setAgents] = createSignal<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = createSignal<string | null>(null);
  const [sessions, setSessions] = createSignal<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = createSignal<string | null>(null);
  const [currentSessionTitle, setCurrentSessionTitle] = createSignal<string>("New Session");
  const [workspaceRoot, setWorkspaceRoot] = createSignal<string | undefined>(undefined);
  const [contextInfo, setContextInfo] = createSignal<ContextInfo | null>(null);
  const [fileChanges, setFileChanges] = createSignal<FileChangesInfo | null>(null);
  
  // Pending permissions are tracked separately from tool parts
  // Key is either callID (preferred) or permissionID as fallback
  const [pendingPermissions, setPendingPermissions] = createSignal<Map<string, Permission>>(new Map());

  const hasMessages = createMemo(() =>
    messages().some((m) => m.type === "user" || m.type === "assistant")
  );

  const sessionsToShow = createMemo(() => {
    // Don't show the current session if it's new (no ID yet)
    return sessions().filter(s => s.id !== currentSessionId() || currentSessionId() !== null);
  });

  const { send } = useVsCodeBridge({
    onInit: (ready, workspaceRootPath, sessionId, sessionTitle, incomingMessages) => {
      setIsReady(ready);
      setWorkspaceRoot(workspaceRootPath);
      
      // Restore active session state from backend if it exists
      if (sessionId) {
        setCurrentSessionId(sessionId);
        setCurrentSessionTitle(sessionTitle || "New Session");
        
        // Load messages from the active session
        if (incomingMessages && incomingMessages.length > 0) {
          const messages: Message[] = incomingMessages.map((raw: any) => {
            const m = raw?.info ?? raw;
            const parts = raw?.parts ?? m?.parts ?? [];
            const text =
              m?.text ??
              (Array.isArray(parts)
                ? parts
                    .filter((p: any) => p?.type === "text" && typeof p.text === "string")
                    .map((p: any) => p.text)
                    .join("\n")
                : "");
            
            const role = m?.role ?? "assistant";
            
            return {
              id: m.id,
              type: role === "user" ? "user" : "assistant",
              text,
              parts,
            };
          });
          setMessages(messages);
        }
      }
    },

    onAgentList: (agentList) => {
      setAgents(agentList);
      if (!selectedAgent() && agentList.length > 0) {
        setSelectedAgent(agentList[0].name);
      }
    },

    onThinking: (thinking) => {
      setIsThinking(thinking);
    },

    onPartUpdate: (part) => {
      if (DEBUG) {
        console.log('[Webview] part-update received:', {
          partId: part.id,
          partType: part.type,
          messageID: part.messageID,
          callID: part.callID,
        });
      }
      console.log('[App] Part update:', JSON.stringify(part, null, 2));
      setMessages((prev) => applyPartUpdate(prev, part));
    },

    onMessageUpdate: (finalMessage) => {
      if (DEBUG) {
        console.log('[Webview] message-update received:', {
          id: finalMessage.id,
          role: finalMessage.role,
          hasParts: !!(finalMessage.parts && finalMessage.parts.length > 0)
        });
      }
      setMessages((prev) => applyMessageUpdate(prev, finalMessage));
    },

    onResponse: (payload) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "assistant" as const,
          text: payload.text,
          parts: payload.parts,
        },
      ]);
    },

    onError: (errorMessage) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "assistant" as const,
          text: `Error: ${errorMessage}`,
        },
      ]);
    },

    onSessionList: (sessionList) => {
      setSessions(sessionList);
    },

    onSessionSwitched: (sessionId, title, incomingMessages) => {
      setCurrentSessionId(sessionId);
      setCurrentSessionTitle(title);
      // Reset - backend will send updated values via file-changes-update and context-update
      setFileChanges(null);
      setContextInfo(null);
      
      // Load messages from the session
      if (incomingMessages && incomingMessages.length > 0) {
        const messages: Message[] = incomingMessages.map((raw: any) => {
          const m = raw?.info ?? raw;
          const parts = raw?.parts ?? m?.parts ?? [];
          const text =
            m?.text ??
            (Array.isArray(parts)
              ? parts
                  .filter((p: any) => p?.type === "text" && typeof p.text === "string")
                  .map((p: any) => p.text)
                  .join("\n")
              : "");
          
          const role = m?.role ?? "assistant";
          
          return {
            id: m.id,
            type: role === "user" ? "user" : "assistant",
            text,
            parts,
          };
        });
        setMessages(messages);
      } else {
        setMessages([]);
      }
    },

    onPermissionRequired: (permission: Permission) => {
      console.log('[App] Permission required:', permission);
      
      // Store permission in the pending permissions map
      // Key by callID if available, otherwise by permission ID
      const key = permission.callID || permission.id;
      setPendingPermissions((prev) => {
        const next = new Map(prev);
        next.set(key, permission);
        console.log('[App] Added pending permission:', key, 'total:', next.size);
        return next;
      });
    },

    onContextUpdate: (context: ContextInfo) => {
      setContextInfo(context);
    },

    onFileChangesUpdate: (changes: FileChangesInfo) => {
      setFileChanges(changes);
    },
  });

  onMount(() => {
    send({ type: "load-sessions" });
  });

  const handleSubmit = () => {
    const text = input().trim();
    if (!text) return;
    
    const agent = agents().some(a => a.name === selectedAgent()) 
      ? selectedAgent() 
      : null;
    
    send({
      type: "sendPrompt",
      text,
      agent,
    });
    setInput("");
  };

  const handleSessionSelect = (sessionId: string) => {
    send({ type: "switch-session", sessionId });
  };

  const handleNewSession = () => {
    send({ type: "create-session" });
    // The session-switched event handler will update the UI state
  };

  const handleCancel = () => {
    send({ type: "cancel-session" });
  };

  const handlePermissionResponse = (permissionId: string, response: "once" | "always" | "reject") => {
    console.log(`[App] Permission response clicked: ${response} for ${permissionId}`);
    
    // Find the permission in pendingPermissions
    const perms = pendingPermissions();
    let permission: Permission | undefined;
    
    // Search by permission ID
    for (const [key, perm] of perms.entries()) {
      if (perm.id === permissionId) {
        permission = perm;
        break;
      }
    }
    
    const sessionId = permission?.sessionID || currentSessionId();
    
    if (!sessionId) {
      console.error('[App] Cannot respond to permission: no session ID found');
      return;
    }
    
    // Send permission response to extension
    console.log('[App] Sending permission-response message to extension:', {
      type: "permission-response",
      sessionId,
      permissionId,
      response
    });
    
    send({
      type: "permission-response",
      sessionId,
      permissionId,
      response
    });
    
    // Remove the permission from pending permissions
    setPendingPermissions((prev) => {
      const next = new Map(prev);
      // Remove by finding the key that has this permission ID
      for (const [key, perm] of next.entries()) {
        if (perm.id === permissionId) {
          next.delete(key);
          break;
        }
      }
      console.log('[App] Removed pending permission:', permissionId, 'remaining:', next.size);
      return next;
    });
    
    console.log('[App] Permission response sent');
  };

  return (
    <div class={`app ${hasMessages() ? "app--has-messages" : ""}`}>
      <TopBar
        sessions={sessionsToShow()}
        currentSessionId={currentSessionId()}
        currentSessionTitle={currentSessionTitle()}
        onSessionSelect={handleSessionSelect}
        onNewSession={handleNewSession}
      />

      <Show when={!hasMessages()}>
        <InputBar
          value={input()}
          onInput={setInput}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          disabled={!isReady()}
          isThinking={isThinking()}
          selectedAgent={selectedAgent()}
          agents={agents()}
          onAgentChange={setSelectedAgent}
        />
      </Show>

      <MessageList messages={messages()} isThinking={isThinking()} workspaceRoot={workspaceRoot()} pendingPermissions={pendingPermissions()} onPermissionResponse={handlePermissionResponse} />

      <Show when={hasMessages()}>
        <div class="input-divider" />
        <div class="input-status-row">
          <FileChangesSummary fileChanges={fileChanges()} />
          <ContextIndicator contextInfo={contextInfo()} />
        </div>
        <InputBar
          value={input()}
          onInput={setInput}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          disabled={!isReady()}
          isThinking={isThinking()}
          selectedAgent={selectedAgent()}
          agents={agents()}
          onAgentChange={setSelectedAgent}
        />
      </Show>
    </div>
  );
}

export default App;
