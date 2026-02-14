import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { MentionItem, Agent } from "../types";
import type { QueuedMessage } from "../App";
import { AgentSwitcher } from "./AgentSwitcher";
import { applyMentionToken, findMentionTokenAtCursor, type MentionTokenMatch } from "../utils/mention";

const MENTION_SEARCH_DEBOUNCE_MS = 120;
const MENTION_SEARCH_LIMIT = 20;

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
  attachments: InputAttachment[];
  onRemoveAttachment: (id: string) => void;
  mentionSearchResult: MentionSearchResult | null;
  onMentionSearch: (query: string, requestId: string, limit?: number) => void;
  onMentionSelect: (item: MentionItem) => void;
}

interface InputAttachment {
  id: string;
  label: string;
  title?: string;
}

interface MentionSearchResult {
  requestId: string;
  items: MentionItem[];
}

export function InputBar(props: InputBarProps) {
  let inputRef!: HTMLTextAreaElement;
  const [isShiftHeld, setIsShiftHeld] = createSignal(false);
  const [activeMention, setActiveMention] = createSignal<MentionTokenMatch | null>(null);
  const [activeMentionRequestId, setActiveMentionRequestId] = createSignal<string | null>(null);
  const [mentionItems, setMentionItems] = createSignal<MentionItem[]>([]);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = createSignal(0);
  const [mentionOpen, setMentionOpen] = createSignal(false);

  let mentionSearchTimer: ReturnType<typeof setTimeout> | null = null;

  const adjustTextareaHeight = () => {
    if (inputRef) {
      inputRef.style.height = "auto";
      inputRef.style.height = `${Math.min(inputRef.scrollHeight, 120)}px`;
    }
  };

  const closeMentionDropdown = () => {
    setMentionOpen(false);
    setMentionItems([]);
    setHighlightedMentionIndex(0);
    setActiveMentionRequestId(null);
  };

  const refreshMentionState = (value: string, cursor: number | null) => {
    const safeCursor = cursor ?? value.length;
    const token = findMentionTokenAtCursor(value, safeCursor);
    setActiveMention(token);

    if (mentionSearchTimer) {
      clearTimeout(mentionSearchTimer);
      mentionSearchTimer = null;
    }

    if (!token || token.query.length === 0) {
      closeMentionDropdown();
      return;
    }

    mentionSearchTimer = setTimeout(() => {
      const requestId = crypto.randomUUID();
      setActiveMentionRequestId(requestId);
      props.onMentionSearch(token.query, requestId, MENTION_SEARCH_LIMIT);
    }, MENTION_SEARCH_DEBOUNCE_MS);
  };

  const applyMentionSelection = (item: MentionItem) => {
    const currentValue = props.value;
    const cursor = inputRef?.selectionStart ?? currentValue.length;
    const token = findMentionTokenAtCursor(currentValue, cursor) ?? activeMention();
    if (!token) return;

    const result = applyMentionToken(currentValue, token, item.filePath);
    props.onInput(result.text);
    props.onMentionSelect(item);
    closeMentionDropdown();

    queueMicrotask(() => {
      inputRef?.focus();
      inputRef?.setSelectionRange(result.cursor, result.cursor);
    });
  };

  createEffect(() => {
    props.value;
    adjustTextareaHeight();
  });

  createEffect(() => {
    const result = props.mentionSearchResult;
    const requestId = activeMentionRequestId();
    if (!result || !requestId || result.requestId !== requestId) {
      return;
    }

    const items = result.items;
    setMentionItems(items);
    setMentionOpen(items.length > 0);
    setHighlightedMentionIndex(0);
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

  onCleanup(() => {
    if (mentionSearchTimer) {
      clearTimeout(mentionSearchTimer);
      mentionSearchTimer = null;
    }
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
    if (mentionOpen()) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedMentionIndex((prev) =>
          mentionItems().length === 0 ? 0 : (prev + 1) % mentionItems().length
        );
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedMentionIndex((prev) =>
          mentionItems().length === 0 ? 0 : (prev - 1 + mentionItems().length) % mentionItems().length
        );
        return;
      }

      if ((e.key === "Enter" || e.key === "Tab") && !e.metaKey && !e.ctrlKey) {
        const current = mentionItems()[highlightedMentionIndex()];
        if (current) {
          e.preventDefault();
          applyMentionSelection(current);
          return;
        }
      }

      if (e.key === "Escape") {
        e.preventDefault();
        closeMentionDropdown();
        return;
      }
    }

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
      !target.closest(".mention-dropdown") &&
      inputRef
    ) {
      inputRef.focus();
    }
  };

  const handleInput = (e: InputEvent & { currentTarget: HTMLTextAreaElement }) => {
    const value = e.currentTarget.value;
    props.onInput(value);
    refreshMentionState(value, e.currentTarget.selectionStart);
  };

  const handleTextAreaClick = () => {
    refreshMentionState(props.value, inputRef.selectionStart);
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
        <Show when={props.attachments.length > 0}>
          <div class="input-attachments">
            <For each={props.attachments}>
              {(attachment) => (
                <div class="input-attachment" title={attachment.title ?? attachment.label}>
                  <span class="input-attachment__text">{attachment.label}</span>
                  <button
                    type="button"
                    class="input-attachment__remove"
                    onClick={() => props.onRemoveAttachment(attachment.id)}
                    aria-label="Remove attachment"
                  >
                    ×
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={mentionOpen()}>
          <div class="mention-dropdown" role="listbox" aria-label="Mention files">
            <For each={mentionItems()}>
              {(item, index) => (
                <button
                  type="button"
                  class={`mention-option ${index() === highlightedMentionIndex() ? "mention-option--active" : ""}`}
                  role="option"
                  aria-selected={index() === highlightedMentionIndex()}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightedMentionIndex(index())}
                  onClick={() => applyMentionSelection(item)}
                >
                  <span class="mention-option__prefix">@</span>
                  <span class="mention-option__path">{item.filePath}</span>
                </button>
              )}
            </For>
          </div>
        </Show>
        <textarea
          ref={inputRef!}
          class="prompt-input"
          placeholder=""
          value={props.value}
          onInput={handleInput}
          onClick={handleTextAreaClick}
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
