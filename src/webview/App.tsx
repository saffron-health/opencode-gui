import { createSignal, createEffect, onMount, onCleanup, For, Show } from "solid-js";

interface ToolState {
  status: "pending" | "running" | "completed" | "error";
  input?: any;
  output?: string;
  error?: string;
  title?: string;
  time?: {
    start: number;
    end?: number;
  };
}

interface MessagePart {
  id: string;
  type: "text" | "reasoning" | "tool" | "file" | "step-start" | "step-finish";
  text?: string;
  tool?: string;
  state?: ToolState;
  snapshot?: string;
}

interface Message {
  id: string;
  type: "user" | "assistant" | "thinking";
  text?: string;
  parts?: MessagePart[];
}

interface Agent {
  name: string;
  description?: string;
  mode: "subagent" | "primary" | "all";
  builtIn: boolean;
  options?: {
    color?: string;
    [key: string]: unknown;
  };
}

// Get VS Code API
declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

function App() {
  const [input, setInput] = createSignal("");
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [isThinking, setIsThinking] = createSignal(false);
  const [isReady, setIsReady] = createSignal(false);
  const [agents, setAgents] = createSignal<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = createSignal<string | null>(null);
  
  let inputRef: HTMLTextAreaElement;
  let messagesEndRef: HTMLDivElement;

  const hasMessages = () =>
    messages().some((m) => m.type === "user" || m.type === "assistant");

  onMount(() => {
    // Listen for messages from extension
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case "init":
          setIsReady(message.ready);
          break;
        case "agentList":
          setAgents(message.agents || []);
          // Select first agent by default if none selected
          if (!selectedAgent() && message.agents && message.agents.length > 0) {
            setSelectedAgent(message.agents[0].name);
          }
          break;
        case "thinking":
          setIsThinking(message.isThinking);
          if (message.isThinking) {
            setMessages((prev) => [
              ...prev,
              {
                id: "thinking",
                type: "thinking",
                text: "Thinking...",
              },
            ]);
          } else {
            setMessages((prev) => prev.filter((m) => m.id !== "thinking"));
          }
          break;
        case "part-update": {
          // Streaming part update - SolidJS handles rapid updates efficiently
          const { part } = message;
          console.log('[Webview] part-update received:', {
            partId: part.id,
            partType: part.type,
            messageID: part.messageID,
          });
          
          setMessages((prev) => {
            // Filter out thinking messages
            const filtered = prev.filter((m) => m.id !== "thinking");
            
            // Find or create the message for this part
            const messageIndex = filtered.findIndex((m) => m.id === part.messageID);
            
            if (messageIndex === -1) {
              // New message - create it
              console.log('[Webview] Creating new message:', part.messageID);
              return [
                ...filtered,
                {
                  id: part.messageID,
                  type: "assistant" as const,
                  parts: [part],
                },
              ];
            } else {
              // Update existing message
              const updated = [...filtered];
              const msg = { ...updated[messageIndex] };
              const parts = msg.parts || [];
              const partIndex = parts.findIndex((p) => p.id === part.id);
              
              if (partIndex === -1) {
                // New part - append it
                console.log('[Webview] Adding new part to message:', part.id);
                msg.parts = [...parts, part];
              } else {
                // Update existing part - just replace it
                // The server sends the full accumulated text, not deltas
                console.log('[Webview] Updating existing part:', part.id);
                msg.parts = [...parts];
                msg.parts[partIndex] = part;
              }
              
              updated[messageIndex] = msg;
              console.log('[Webview] Message now has', msg.parts.length, 'parts');
              return updated;
            }
          });
          break;
        }
        case "message-update": {
          // Message metadata update
          const { message: finalMessage } = message;
          
          console.log('[Webview] message-update received:', {
            id: finalMessage.id,
            role: finalMessage.role,
            hasParts: !!(finalMessage.parts && finalMessage.parts.length > 0)
          });
          
          setMessages((prev) => {
            const filtered = prev.filter((m) => m.id !== "thinking");
            const index = filtered.findIndex((m) => m.id === finalMessage.id);
            
            if (index === -1) {
              // New message - create it
              // If it has parts, use them, otherwise create empty message that will be populated by part-update
              console.log('[Webview] Creating message from message-update');
              return [
                ...filtered,
                {
                  id: finalMessage.id,
                  type: finalMessage.role === "user" ? "user" as const : "assistant" as const,
                  parts: finalMessage.parts || [],
                  text: finalMessage.text,
                },
              ];
            } else {
              // Update existing message
              const updated = [...filtered];
              const currentMsg = { ...updated[index] };
              
              // Update role if provided
              if (finalMessage.role) {
                currentMsg.type = finalMessage.role === "user" ? "user" as const : "assistant" as const;
              }
              
              // Only update parts if the new message has parts
              // This preserves streaming content built up from part-update events
              if (finalMessage.parts && finalMessage.parts.length > 0) {
                currentMsg.parts = finalMessage.parts;
              }
              
              updated[index] = currentMsg;
              return updated;
            }
          });
          break;
        }
        case "response":
          setMessages((prev) => {
            const filtered = prev.filter((m) => m.id !== "thinking");
            return [
              ...filtered,
              {
                id: Date.now().toString(),
                type: "assistant" as const,
                text: message.text,
                parts: message.parts,
              },
            ];
          });
          break;
        case "error":
          setMessages((prev) => {
            const filtered = prev.filter((m) => m.id !== "thinking");
            return [
              ...filtered,
              {
                id: Date.now().toString(),
                type: "assistant" as const,
                text: `Error: ${message.message}`,
              },
            ];
          });
          break;
      }
    };

    window.addEventListener("message", messageHandler);

    // Tell extension we're ready
    vscode.postMessage({ type: "ready" });

    // Request agent list
    vscode.postMessage({ type: "getAgents" });

    onCleanup(() => window.removeEventListener("message", messageHandler));
  });

  // Auto-scroll to bottom when messages change
  createEffect(() => {
    // Access signals to track them
    messages();
    isThinking();
    // Scroll after render
    setTimeout(() => {
      messagesEndRef?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  });

  // Auto-resize textarea based on content
  const adjustTextareaHeight = () => {
    if (inputRef) {
      inputRef.style.height = "auto";
      inputRef.style.height = `${Math.min(
        inputRef.scrollHeight,
        120
      )}px`;
    }
  };

  // Adjust height when input changes
  createEffect(() => {
    input(); // Track input signal
    adjustTextareaHeight();
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();

    if (!input().trim() || isThinking()) {
      return;
    }

    // Send to extension - the user message will be added via SSE stream
    vscode.postMessage({
      type: "sendPrompt",
      text: input(),
      agent: selectedAgent(),
    });

    // Clear input
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const renderToolPart = (part: MessagePart) => {
    const { tool, state } = part;
    if (!state) return null;

    const statusIcon = {
      pending: "⏳",
      running: "▶️",
      completed: "✅",
      error: "❌",
    }[state.status];

    const statusLabel = state.title || tool || "Tool";

    return (
      <details
        class="tool-call"
        open={state.status === "running"}
      >
        <summary>
          <span class="tool-icon">{statusIcon}</span>
          <span class="tool-name">{statusLabel}</span>
          <span class="tool-status">{state.status}</span>
        </summary>
        <Show when={state.output || state.error}>
          <pre 
            class="tool-output" 
            style="max-height: 80px; overflow: auto; font-family: monospace;"
          >
            {state.error || state.output}
          </pre>
        </Show>
      </details>
    );
  };

  const renderMessagePart = (part: MessagePart) => {
    switch (part.type) {
      case "text":
        return part.text ? (
          <div class="message-text">
            {part.text}
          </div>
        ) : null;
      case "reasoning":
        return (
          <details class="reasoning-block" open>
            <summary>
              <span class="thinking-icon"></span>
              <span>Reasoning</span>
            </summary>
            <div class="reasoning-content">{part.text}</div>
          </details>
        );
      case "tool":
        return renderToolPart(part);
      case "step-start":
      case "step-finish":
        // Don't render step indicators
        return null;
      default:
        return null;
    }
  };

  const AgentSwitcher = () => {
    const currentAgent = () => {
      const name = selectedAgent();
      return agents().find(a => a.name === name);
    };
    
    const cycleAgent = () => {
      const agentList = agents();
      if (agentList.length === 0) return;
      
      const currentIndex = agentList.findIndex(a => a.name === selectedAgent());
      const nextIndex = (currentIndex + 1) % agentList.length;
      setSelectedAgent(agentList[nextIndex].name);
    };
    
    const agentColor = () => currentAgent()?.options?.color;
    
    return (
      <button
        type="button"
        class="agent-switcher-button"
        onClick={cycleAgent}
        aria-label="Switch agent"
        title={currentAgent()?.description || 'Switch agent'}
        style={agentColor() ? { color: agentColor() } : {}}
      >
        {currentAgent()?.name || 'Agent'}
      </button>
    );
  };

  const renderInput = () => (
    <form class="input-container" onSubmit={handleSubmit}>
      <textarea
        ref={inputRef!}
        class="prompt-input"
        placeholder=""
        value={input()}
        onInput={(e) => setInput(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        disabled={!isReady() || isThinking()}
      />
      <div class="input-buttons">
        <Show when={agents().length > 0}>
          <AgentSwitcher />
        </Show>
        <button
          type="submit"
          class="shortcut-button shortcut-button--secondary"
          disabled={!isReady() || isThinking() || !input().trim()}
          aria-label="Submit (Cmd+Enter)"
        >
          ⌘⏎
        </button>
      </div>
    </form>
  );

  return (
    <div class={`app ${hasMessages() ? "app--has-messages" : ""}`}>
      <Show when={!hasMessages()}>
        {renderInput()}
      </Show>

      <div class="messages-container">
        <For each={messages()}>
          {(message) => {
            if (message.type === "thinking") {
              return (
                <details
                  class="message message--thinking"
                  open
                >
                  <summary>
                    <span class="thinking-icon"></span>
                    <span>Thinking...</span>
                  </summary>
                </details>
              );
            }

            return (
              <div
                class={`message message--${message.type}`}
              >
                <div class="message-content">
                  <Show
                    when={message.parts}
                    fallback={message.text}
                  >
                    <For each={message.parts}>
                      {(part) => renderMessagePart(part)}
                    </For>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>

        <div ref={messagesEndRef!} />
      </div>

      <Show when={hasMessages()}>
        {renderInput()}
      </Show>
    </div>
  );
}

export default App;
