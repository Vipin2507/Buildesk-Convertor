interface StatusIndicatorProps {
  state: 'saved' | 'saving' | 'unsaved' | 'error' | 'valid' | 'invalid';
  label: string;
}

const classMap = {
  saved: 'is-saved',
  saving: 'is-saving',
  unsaved: 'is-unsaved',
  error: 'is-error',
  valid: 'is-valid',
  invalid: 'is-error',
} as const;

export function StatusIndicator({ state, label }: StatusIndicatorProps) {
  return (
    <span className={`status-dot ${classMap[state]}`} role="status">
      {label}
    </span>
  );
}
