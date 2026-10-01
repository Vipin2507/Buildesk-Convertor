import type { ReactNode } from 'react';
import {
  FileDown,
  Eye,
  Pencil,
  Share2,
  Undo2,
  Redo2,
  X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { StatusIndicator } from '../ui/StatusIndicator';
import { FileMenubar } from './FileMenubar';
import './shell.css';

export type SaveState = 'saved' | 'saving' | 'unsaved';

interface AppShellProps {
  documentName: string;
  saveState: SaveState;
  mode: 'edit' | 'preview';
  canUndo: boolean;
  canRedo: boolean;
  syncLabel: string;
  onUndo: () => void;
  onRedo: () => void;
  onPreviewToggle: () => void;
  onExportDocx: () => void;
  onExportHtml: () => void;
  onShare: () => void;
  onRename: (name: string) => void;
  onHome: () => void;
  onNew: () => void;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  toolbar?: ReactNode;
}

export function AppShell({
  documentName,
  saveState,
  mode,
  canUndo,
  canRedo,
  syncLabel,
  onUndo,
  onRedo,
  onPreviewToggle,
  onExportDocx,
  onExportHtml,
  onShare,
  onRename,
  onHome,
  onNew,
  onOpen,
  onClose,
  children,
  footer,
  toolbar,
}: AppShellProps) {
  const saveLabel =
    saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Unsaved changes';

  return (
    <div className="app-shell">
      <FileMenubar
        canClose
        onHome={onHome}
        onNew={onNew}
        onOpen={onOpen}
        onClose={onClose}
        onExportDocx={onExportDocx}
        onExportHtml={onExportHtml}
      />

      <header className="app-header">
        <div className="app-header-left">
          <div className="app-logo" aria-hidden>
            B
          </div>
          <div className="app-brand">
            <span className="app-brand-name">Buildesk Convertor</span>
            <input
              className="app-doc-name"
              value={documentName}
              aria-label="Document name"
              onChange={(e) => onRename(e.target.value)}
            />
          </div>
          <Button
            variant="icon"
            className="app-header-close"
            aria-label="Close document"
            title="Close document"
            onClick={onClose}
          >
            <X size={16} />
          </Button>
        </div>

        <div className="app-header-center">
          <StatusIndicator state={saveState} label={saveLabel} />
          <span className="app-sync-badge" title="Synchronization status">
            {syncLabel}
          </span>
        </div>

        <div className="app-header-right">
          <Button variant="icon" aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
            <Undo2 size={16} />
          </Button>
          <Button variant="icon" aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
            <Redo2 size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onPreviewToggle}
            aria-label={mode === 'preview' ? 'Back to edit' : 'Preview'}
          >
            {mode === 'preview' ? <Pencil size={14} /> : <Eye size={14} />}
            {mode === 'preview' ? 'Edit' : 'Preview'}
          </Button>
          <div className="export-menu">
            <Button variant="secondary" size="sm" onClick={onExportDocx}>
              <FileDown size={14} />
              Export DOCX
            </Button>
            <Button variant="ghost" size="sm" onClick={onExportHtml} aria-label="Export HTML">
              HTML
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onShare}>
            <Share2 size={14} />
            Share
          </Button>
        </div>
      </header>

      {mode === 'edit' && toolbar}

      <main className="app-main">{children}</main>

      {footer}
    </div>
  );
}
