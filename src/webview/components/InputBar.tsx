
import { createEffect, onMount, Show } from "solid-js";
import type { Agent } from "../types";
import { AgentSwitcher } from "./AgentSwitcher";

interface InputBarProps {
  value: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  disabled: boolean;
  isThinking: boolean;
  selectedAgent: string | null;
  agents: Agent[];
  onAgentChange: (agentName: string) => void;
}

export function InputBar(props: InputBarProps) {
  let inputRef!: HTMLTextAreaElement;

  const adjustTextareaHeight = () => {
    if (inputRef) {
      inputRef.style.height = "auto";
      inputRef.style.height = `${Math.min(
        inputRef.scrollHeight,
        120
      )}px`;
    }
  };

  createEffect(() => {
    props.value;
    adjustTextareaHeight();
  });

  onMount(() => {
    inputRef?.focus();
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (props.isThinking) {
      props.onCancel();
      return;
    }
    if (!props.value.trim() || props.disabled) {
      return;
    }
    props.onSubmit();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && props.isThinking) {
      e.preventDefault();
      props.onCancel();
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleContainerClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      !target.closest("button") &&
      !target.closest(".agent-switcher-button") &&
      inputRef
    ) {
      inputRef.focus();
    }
  };

  return (
    <form class="input-container" onSubmit={handleSubmit} onClick={handleContainerClick}>
      <textarea
        ref={inputRef!}
        class="prompt-input"
        placeholder=""
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        aria-label="Message input"
      />
      <div class="input-buttons">
        <Show when={props.agents.length > 0 && !props.isThinking}>
          <AgentSwitcher
            agents={props.agents}
            selectedAgent={props.selectedAgent}
            onAgentChange={props.onAgentChange}
          />
        </Show>
        <Show
          when={props.isThinking}
          fallback={
            <button
              type="submit"
              class="shortcut-button shortcut-button--secondary"
              disabled={props.disabled || !props.value.trim()}
              aria-label="Submit"
            >
              ⌘⏎
            </button>
          }
        >
          <button
            type="button"
            class="shortcut-button shortcut-button--stop"
            onClick={() => props.onCancel()}
            aria-label="Stop"
          >
            <svg viewBox="0 0 10 10" fill="currentColor">
              <rect width="10" height="10" rx="2" />
            </svg>
          </button>
        </Show>
      </div>
    </form>
  );
}
