import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { Agent } from "../types";
import type { QueuedMessage } from "../App";
import { AgentSwitcher } from "./AgentSwitcher";

interface InputBarProps {
  value: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onQueue: () => void;
  disabled: boolean;
  isThinking: boolean;
  selectedAgent: string | null;
  agents: Agent[];
  onAgentChange: (agentName: string) => void;
  queuedMessages: QueuedMessage[];
  onRemoveFromQueue: (id: string) => void;
  onEditQueuedMessage: (id: string) => void;
}

export function InputBar(props: InputBarProps) {
  let inputRef!: HTMLTextAreaElement;
  const [isShiftHeld, setIsShiftHeld] = createSignal(false);

  const adjustTextareaHeight = () => {
    if (inputRef) {
      inputRef.style.height = "auto";
      inputRef.style.height = `${Math.min(inputRef.scrollHeight, 120)}px`;
    }
  };

  createEffect(() => {
    props.value;
    adjustTextareaHeight();
  });

  onMount(() => {
    inputRef?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setIsShiftHeld(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setIsShiftHeld(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    });
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (props.isThinking && !props.value.trim()) {
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
      if (props.isThinking && e.shiftKey && props.value.trim()) {
        props.onQueue();
      } else if (!props.isThinking || props.value.trim()) {
        handleSubmit(e);
      }
    }
  };

  const handleContainerClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      !target.closest("button") &&
      !target.closest(".agent-switcher-button") &&
      !target.closest(".queued-message") &&
      inputRef
    ) {
      inputRef.focus();
    }
  };

  const hasText = () => props.value.trim().length > 0;
  const showQueueButton = () => props.isThinking && hasText() && isShiftHeld();
  const showSubmitButton = () => !props.isThinking || hasText();
  const showStopButton = () => props.isThinking && !hasText();

  return (
    <div class="input-bar-wrapper">
      <Show when={props.queuedMessages.length > 0}>
        <div class="queued-messages">
          <For each={props.queuedMessages}>
            {(message) => (
              <div
                class="queued-message"
                onClick={() => props.onEditQueuedMessage(message.id)}
              >
                <span class="queued-message__text">{message.text}</span>
                <button
                  type="button"
                  class="queued-message__remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onRemoveFromQueue(message.id);
                  }}
                  aria-label="Remove from queue"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M9.354 3.354a.5.5 0 0 0-.708-.708L6 5.293 3.354 2.646a.5.5 0 1 0-.708.708L5.293 6 2.646 8.646a.5.5 0 0 0 .708.708L6 6.707l2.646 2.647a.5.5 0 0 0 .708-.708L6.707 6l2.647-2.646z" />
                  </svg>
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
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
          <Show when={showStopButton()}>
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
          <Show when={showQueueButton()}>
            <button
              type="button"
              class="shortcut-button shortcut-button--queue"
              onClick={() => props.onQueue()}
              disabled={props.disabled || !hasText()}
              aria-label="Queue message"
            >
              <span>⇧⌘⏎</span>
              <span class="queue-label">Queue</span>
            </button>
          </Show>
          <Show when={showSubmitButton() && !showQueueButton()}>
            <button
              type="submit"
              class="shortcut-button shortcut-button--secondary"
              disabled={props.disabled || !hasText()}
              aria-label="Submit"
            >
              <span>⌘⏎</span>
              <Show when={props.isThinking && hasText()}>
                <span class="queue-label">Steer</span>
              </Show>
            </button>
          </Show>
        </div>
      </form>
    </div>
  );
}
