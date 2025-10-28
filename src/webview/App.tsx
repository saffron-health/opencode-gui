import React, { useState, useEffect, useRef } from "react";

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

// Get VS Code API
declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.some(
    (m) => m.type === "user" || m.type === "assistant"
  );

  useEffect(() => {
    // Listen for messages from extension
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case "init":
          setIsReady(message.ready);
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
        case "response":
          setMessages((prev) => {
            const filtered = prev.filter((m) => m.id !== "thinking");
            return [
              ...filtered,
              {
                id: Date.now().toString(),
                type: "assistant",
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
                type: "assistant",
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

    return () => window.removeEventListener("message", messageHandler);
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // Auto-resize textarea based on content
  const adjustTextareaHeight = () => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(
        inputRef.current.scrollHeight,
        120
      )}px`;
    }
  };

  // Adjust height when input changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isThinking) {
      return;
    }

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: "user",
        text: input,
      },
    ]);

    // Send to extension
    vscode.postMessage({
      type: "sendPrompt",
      text: input,
    });

    // Clear input
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
        key={part.id}
        className="tool-call"
        open={state.status === "running"}
      >
        <summary>
          <span className="tool-icon">{statusIcon}</span>
          <span className="tool-name">{statusLabel}</span>
          <span className="tool-status">{state.status}</span>
        </summary>
        <div className="tool-details">
          {state.input && (
            <div className="tool-section">
              <div className="tool-section-label">Input:</div>
              <pre className="tool-content">
                {JSON.stringify(state.input, null, 2)}
              </pre>
            </div>
          )}
          {state.output && (
            <div className="tool-section">
              <div className="tool-section-label">Output:</div>
              <pre className="tool-content">{state.output}</pre>
            </div>
          )}
          {state.error && (
            <div className="tool-section">
              <div className="tool-section-label">Error:</div>
              <pre className="tool-content tool-error">{state.error}</pre>
            </div>
          )}
        </div>
      </details>
    );
  };

  const renderMessagePart = (part: MessagePart) => {
    switch (part.type) {
      case "text":
        return part.text ? (
          <div key={part.id} className="message-text">
            {part.text}
          </div>
        ) : null;
      case "reasoning":
        return (
          <details key={part.id} className="reasoning-block" open>
            <summary>
              <span className="thinking-icon"></span>
              <span>Reasoning</span>
            </summary>
            <div className="reasoning-content">{part.text}</div>
          </details>
        );
      case "tool":
        return renderToolPart(part);
      case "step-start":
        return (
          <div key={part.id} className="step-indicator">
            <span className="step-icon">🔧</span>
            <span className="step-text">Using tools...</span>
          </div>
        );
      default:
        return null;
    }
  };

  const renderInput = () => (
    <form className="input-container" onSubmit={handleSubmit}>
      <div className="textarea-wrapper">
        <textarea
          ref={inputRef}
          className="prompt-input"
          placeholder={
            isReady ? "Ask OpenCode anything..." : "Initializing OpenCode..."
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isReady || isThinking}
        />
        <button
          type="submit"
          className="shortcut-button"
          disabled={!isReady || isThinking || !input.trim()}
          aria-label="Submit (Cmd+Enter)"
        >
          ⌘⏎
        </button>
      </div>
    </form>
  );

  return (
    <div className={`app ${hasMessages ? "app--has-messages" : ""}`}>
      {!hasMessages && renderInput()}

      <div className="messages-container">
        {messages.length === 0 && !isThinking && (
          <div className="welcome-message">
            <p>
              Hello! I'm OpenCode, ready to help you with your OpenCode VSCode
              extension. What would you like to work on?
            </p>
          </div>
        )}

        {messages.map((message) => {
          if (message.type === "thinking") {
            return (
              <details
                key={message.id}
                className="message message--thinking"
                open
              >
                <summary>
                  <span className="thinking-icon"></span>
                  <span>Thinking...</span>
                </summary>
              </details>
            );
          }

          return (
            <div
              key={message.id}
              className={`message message--${message.type}`}
            >
              <div className="message-content">
                {message.parts
                  ? message.parts.map((part) => renderMessagePart(part))
                  : message.text}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {hasMessages && renderInput()}
    </div>
  );
}

export default App;
