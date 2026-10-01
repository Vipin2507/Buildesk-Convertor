import { useCallback, useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { MAX_UPLOAD_BYTES } from '../lib/api';

interface DropzoneProps {
  onFile: (file: File) => void | Promise<void>;
  progress: number | null;
  progressMessage: string | null;
  onCancel?: () => void;
  disabled?: boolean;
}

const ACCEPT_EXT = ['.docx', '.html', '.htm'];

export function Dropzone({
  onFile,
  progress,
  progressMessage,
  onCancel,
  disabled,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback((file: File): string | null => {
    const name = file.name.toLowerCase();
    if (!ACCEPT_EXT.some((ext) => name.endsWith(ext))) {
      return 'Unsupported type. Use DOCX or HTML.';
    }
    if (file.size <= 0) return 'The file is empty.';
    if (file.size > MAX_UPLOAD_BYTES) return 'File too large. Maximum size is 50 MB.';
    return null;
  }, []);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const err = validate(file);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      await onFile(file);
    },
    [onFile, validate],
  );

  const busy = progress !== null;

  return (
    <div className="w-full">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-[color,background,border] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2',
          dragOver
            ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
            : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]',
        )}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileUp className="h-5 w-5" />}
        </span>
        <div>
          <p className="text-base font-semibold text-[var(--ink)]">Drop your DOCX here</p>
          <p className="mt-1 text-sm text-[var(--muted)]">DOCX, HTML — or click to browse</p>
        </div>
      </button>

      {busy && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-[var(--muted)]">
            <span>{progressMessage || 'Working…'}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--line)]">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          {onCancel && (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--danger)]"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".docx,.html,.htm,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
