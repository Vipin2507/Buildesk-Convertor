import { FileText, FileCode2, FilePlus } from 'lucide-react';
import { Button } from '../ui/Button';
import { FileDropzone } from './FileDropzone';
import './upload.css';

interface EmptyStateProps {
  busy?: boolean;
  progressMessage?: string | null;
  onUploadFiles: (files: FileList) => void;
  onCreateBlank: () => void;
  onUploadDocxClick: () => void;
  onUploadHtmlClick: () => void;
}

export function EmptyState({
  busy,
  progressMessage,
  onUploadFiles,
  onCreateBlank,
  onUploadDocxClick,
  onUploadHtmlClick,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-card">
        <div className="empty-state-brand">
          <div className="empty-state-logo" aria-hidden>
            B
          </div>
          <span>Buildesk Convertor</span>
        </div>

        <h1>Document Workspace</h1>
        <p>Edit your document and HTML side by side. Changes stay synchronized automatically.</p>

        <FileDropzone
          disabled={busy}
          onFiles={onUploadFiles}
          label={busy ? progressMessage || 'Working…' : 'Drop your DOCX here'}
          hint="DOCX, HTML — or click to browse"
        />

        <div className="empty-state-actions">
          <Button variant="primary" disabled={busy} onClick={onUploadDocxClick}>
            <FileText size={16} />
            Upload DOCX
          </Button>
          <Button disabled={busy} onClick={onUploadHtmlClick}>
            <FileCode2 size={16} />
            Upload HTML
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onCreateBlank}>
            <FilePlus size={16} />
            Create blank document
          </Button>
        </div>

        <div className="empty-state-supported">
          <strong>Supported</strong>
          <span className="empty-state-chip">DOCX</span>
          <span className="empty-state-chip">HTML</span>
        </div>
      </div>
    </div>
  );
}
