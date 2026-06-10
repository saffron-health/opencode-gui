interface RenameSessionButtonProps {
  disabled?: boolean;
  onClick: () => void;
}

export function RenameSessionButton(props: RenameSessionButtonProps) {
  return (
    <button
      class="new-session-button"
      onClick={props.onClick}
      aria-label="Rename session"
      title="Rename session"
      disabled={props.disabled}
    >
      ✎
    </button>
  );
}
