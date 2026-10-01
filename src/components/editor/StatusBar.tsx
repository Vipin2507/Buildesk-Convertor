import { StatusIndicator } from '../ui/StatusIndicator';

interface StatusBarProps {
  words: number;
  saveState: 'saved' | 'saving' | 'unsaved';
  htmlValid: boolean;
}

export function StatusBar({ words, saveState, htmlValid }: StatusBarProps) {
  const pages = Math.max(1, Math.ceil(words / 300));
  const saveLabel =
    saveState === 'saved' ? 'Autosaved' : saveState === 'saving' ? 'Saving…' : 'Unsaved';

  return (
    <footer className="status-bar">
      <div className="status-bar-left">
        <span>Words: {words.toLocaleString()}</span>
        <span>Pages: ~{pages}</span>
      </div>
      <div className="status-bar-right">
        <StatusIndicator
          state={htmlValid ? 'valid' : 'invalid'}
          label={htmlValid ? 'HTML valid' : 'HTML has syntax errors'}
        />
        <StatusIndicator state={saveState} label={saveLabel} />
      </div>
    </footer>
  );
}
