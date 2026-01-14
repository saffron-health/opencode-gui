import { SessionSwitcher } from "./SessionSwitcher";
import { NewSessionButton } from "./NewSessionButton";
import type { Session } from "../types";

interface TopBarProps {
  sessions: Session[];
  currentSessionId: string | null;
  currentSessionTitle: string;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => void;
  onRefreshSessions: () => Promise<void>;
}

export function TopBar(props: TopBarProps) {
  return (
    <div class="top-bar">
      <SessionSwitcher
        sessions={props.sessions}
        currentSessionId={props.currentSessionId}
        currentSessionTitle={props.currentSessionTitle}
        onSessionSelect={props.onSessionSelect}
        onRefreshSessions={props.onRefreshSessions}
      />
      <NewSessionButton onClick={props.onNewSession} />
    </div>
  );
}
