interface NewSessionButtonProps {
  onClick: () => void;
}

export function NewSessionButton(props: NewSessionButtonProps) {
  return (
    <button
      class="new-session-button"
      onClick={props.onClick}
      aria-label="New session"
    >
      +
    </button>
  );
}
