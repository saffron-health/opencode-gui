import { createSignal, Show, For } from "solid-js";
import type { Session } from "../types";

interface SessionSwitcherProps {
  sessions: Session[];
  currentSessionId: string | null;
  currentSessionTitle: string;
  onSessionSelect: (sessionId: string) => void;
  onRefreshSessions: () => Promise<void>;
}

export function SessionSwitcher(props: SessionSwitcherProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);

  const toggleDropdown = async () => {
    if (!isOpen()) {
      setIsLoading(true);
      try {
        await props.onRefreshSessions();
      } finally {
        setIsLoading(false);
      }
    }
    setIsOpen(!isOpen());
  };

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
        aria-label="Switch session"
        aria-expanded={isOpen()}
      >
        <span class="session-title">{props.currentSessionTitle}</span>
      </button>

      <Show when={isOpen()}>
        <div class="session-dropdown">
          <Show when={isLoading()}>
            <div class="session-loading">Loading sessions...</div>
          </Show>
          <Show when={!isLoading()}>
            <Show
              when={props.sessions.length > 0}
              fallback={
                <div class="session-loading">No sessions found</div>
              }
            >
              <For each={props.sessions}>
                {(session) => (
                  <div
                    class={`session-item ${
                      session.id === props.currentSessionId ? "current" : ""
                    }`}
                    onClick={() => handleSessionClick(session.id)}
                  >
                    <div class="session-item-title">{session.title}</div>
                    <div class="session-item-time">
                      {formatRelativeTime(session.time.updated)}
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  );
}
