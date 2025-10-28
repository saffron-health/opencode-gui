/* @jsxImportSource solid-js */
import { createSignal, createMemo, Show } from "solid-js";
import { InputBar } from "./components/InputBar";
import { MessageList } from "./components/MessageList";
import { useVsCodeBridge } from "./hooks/useVsCodeBridge";
import { applyPartUpdate, applyMessageUpdate } from "./utils/messageUtils";
import type { Message, Agent } from "./types";

const DEBUG = false;

function App() {
  const [input, setInput] = createSignal("");
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [isThinking, setIsThinking] = createSignal(false);
  const [isReady, setIsReady] = createSignal(false);
  const [agents, setAgents] = createSignal<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = createSignal<string | null>(null);

  const hasMessages = createMemo(() =>
    messages().some((m) => m.type === "user" || m.type === "assistant")
  );

  const { send } = useVsCodeBridge({
    onInit: (ready) => {
      setIsReady(ready);
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
        });
      }
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

  return (
    <div class={`app ${hasMessages() ? "app--has-messages" : ""}`}>
      <Show when={!hasMessages()}>
        <InputBar
          value={input()}
          onInput={setInput}
          onSubmit={handleSubmit}
          disabled={!isReady() || isThinking()}
          selectedAgent={selectedAgent()}
          agents={agents()}
          onAgentChange={setSelectedAgent}
        />
      </Show>

      <MessageList messages={messages()} isThinking={isThinking()} />

      <Show when={hasMessages()}>
        <InputBar
          value={input()}
          onInput={setInput}
          onSubmit={handleSubmit}
          disabled={!isReady() || isThinking()}
          selectedAgent={selectedAgent()}
          agents={agents()}
          onAgentChange={setSelectedAgent}
        />
      </Show>
    </div>
  );
}

export default App;
