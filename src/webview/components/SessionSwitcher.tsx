import { createSignal, Show, For } from "solid-js";
import type { Session } from "../types";

interface SessionSwitcherProps {
  sessions: Session[];
  currentSessionId: string | null;
  currentSessionTitle: string;
  onSessionSelect: (sessionId: string) => void;
}

export function SessionSwitcher(props: SessionSwitcherProps) {
  const [isOpen, setIsOpen] = createSignal(false);

  const toggleDropdown = () => setIsOpen(!isOpen());

  const handleSessionClick = (sessionId: string) => {
    props.onSessionSelect(sessionId);
    setIsOpen(false);
  };

  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  };

  return (
    <div class="session-switcher">
      <button
        class={`session-switcher-button ${isOpen() ? "active" : ""}`}
        onClick={toggleDropdown}
        disabled={props.sessions.length === 0}
        aria-label="Switch session"
        aria-expanded={isOpen()}
      >
        <span class="session-title">{props.currentSessionTitle}</span>
      </button>

      <Show when={isOpen()}>
        <div class="session-dropdown">
          <For each={props.sessions}>
            {(session) => (
              <div
                class={`session-item ${
                  session.id === props.currentSessionId ? "selected" : ""
                }`}
                onClick={() => handleSessionClick(session.id)}
              >
                <div class="session-item-title">{session.title}</div>
                <div class="session-item-time">
                  {formatRelativeTime(session.time.created)}
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
