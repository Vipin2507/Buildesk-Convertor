import { useCallback, useRef, useState, type DragEvent } from 'react';
import { FileUp } from 'lucide-react';
import './upload.css';

interface FileDropzoneProps {
  accept?: string;
  disabled?: boolean;
  onFiles: (files: FileList) => void;
  label?: string;
  hint?: string;
}

export function FileDropzone({
  accept = '.docx,.html,.htm',
  disabled,
  onFiles,
  label = 'Drop your document here',
  hint = 'DOCX or HTML — or click to browse',
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0 || disabled) return;
      onFiles(files);
    },
    [disabled, onFiles],
  );

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragging(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`file-dropzone ${dragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <div className="file-dropzone-icon" aria-hidden>
        <FileUp size={28} strokeWidth={1.5} />
      </div>
      <div className="file-dropzone-label">{label}</div>
      <div className="file-dropzone-hint">{hint}</div>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
