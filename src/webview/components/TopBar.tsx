import { createSignal } from "solid-js";
import { SessionSwitcher } from "./SessionSwitcher";
import { NewSessionButton } from "./NewSessionButton";
import { RenameSessionButton } from "./RenameSessionButton";
import type { Session } from "../types";
import type { SessionStatus } from "../state/types";

interface TopBarProps {
  sessions: Session[];
  currentSessionId: string | null;
  currentSessionTitle: string;
  sessionStatus: (sessionId: string) => SessionStatus | null;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => void;
  onRenameSession: (title: string) => Promise<void>;
  onRefreshSessions: () => Promise<void>;
}

export function TopBar(props: TopBarProps) {
  const [isRenaming, setIsRenaming] = createSignal(false);
  const [draftTitle, setDraftTitle] = createSignal("");
  const [isSaving, setIsSaving] = createSignal(false);

  const startRename = () => {
    if (!props.currentSessionId) return;
    setDraftTitle(props.currentSessionTitle === "New Session" ? "" : props.currentSessionTitle);
    setIsRenaming(true);
  };

  const cancelRename = () => {
    setIsRenaming(false);
    setDraftTitle("");
  };

  const submitRename = async () => {
    const title = draftTitle().trim();
    if (!title || isSaving()) return;

    setIsSaving(true);
    try {
      await props.onRenameSession(title);
      setIsRenaming(false);
      setDraftTitle("");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRenameKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submitRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  };

  return (
    <div class="top-bar">
      {isRenaming() ? (
        <form
          class="session-rename-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitRename();
          }}
        >
          <input
            class="session-rename-input"
            value={draftTitle()}
            onInput={(event) => setDraftTitle(event.currentTarget.value)}
            onKeyDown={handleRenameKeyDown}
            aria-label="Session title"
            autofocus
            disabled={isSaving()}
          />
          <button
            class="session-rename-action"
            type="submit"
            aria-label="Save session title"
            title="Save session title"
            disabled={isSaving() || !draftTitle().trim()}
          >
            ✓
          </button>
          <button
            class="session-rename-action"
            type="button"
            aria-label="Cancel rename"
            title="Cancel rename"
            onClick={cancelRename}
            disabled={isSaving()}
          >
            ×
          </button>
        </form>
      ) : (
        <>
          <SessionSwitcher
            sessions={props.sessions}
            currentSessionId={props.currentSessionId}
            currentSessionTitle={props.currentSessionTitle}
            sessionStatus={props.sessionStatus}
            onSessionSelect={props.onSessionSelect}
            onRefreshSessions={props.onRefreshSessions}
          />
          <RenameSessionButton
            disabled={!props.currentSessionId}
            onClick={startRename}
          />
        </>
      )}
      <NewSessionButton onClick={props.onNewSession} />
    </div>
  );
}
