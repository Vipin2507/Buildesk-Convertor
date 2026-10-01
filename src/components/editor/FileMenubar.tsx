import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  FilePlus,
  FolderOpen,
  Home,
  X,
  FileDown,
  FileCode2,
} from 'lucide-react';
import './menubar.css';

export interface FileMenubarProps {
  onHome: () => void;
  onNew: () => void;
  onOpen: () => void;
  onClose: () => void;
  onExportDocx: () => void;
  onExportHtml: () => void;
  canClose: boolean;
}

export function FileMenubar({
  onHome,
  onNew,
  onOpen,
  onClose,
  onExportDocx,
  onExportHtml,
  canClose,
}: FileMenubarProps) {
  const [fileOpen, setFileOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fileOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setFileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFileOpen(false);
    };
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [fileOpen]);

  const run = (fn: () => void) => {
    setFileOpen(false);
    fn();
  };

  return (
    <div className="app-menubar" ref={rootRef}>
      <div className="menubar-item-wrap">
        <button
          type="button"
          className={`menubar-item ${fileOpen ? 'is-open' : ''}`}
          aria-haspopup="menu"
          aria-expanded={fileOpen}
          onClick={() => setFileOpen((v) => !v)}
        >
          File
          <ChevronDown size={12} aria-hidden />
        </button>
        {fileOpen && (
          <div className="menubar-dropdown" role="menu">
            <button type="button" role="menuitem" onClick={() => run(onNew)}>
              <FilePlus size={14} />
              New document
              <span className="menubar-shortcut">⌘N</span>
            </button>
            <button type="button" role="menuitem" onClick={() => run(onOpen)}>
              <FolderOpen size={14} />
              Open…
              <span className="menubar-shortcut">⌘O</span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!canClose}
              onClick={() => run(onClose)}
            >
              <X size={14} />
              Close document
              <span className="menubar-shortcut">⌘W</span>
            </button>
            <div className="menubar-sep" role="separator" />
            <button
              type="button"
              role="menuitem"
              disabled={!canClose}
              onClick={() => run(onExportDocx)}
            >
              <FileDown size={14} />
              Export DOCX
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!canClose}
              onClick={() => run(onExportHtml)}
            >
              <FileCode2 size={14} />
              Export HTML
            </button>
          </div>
        )}
      </div>

      <button type="button" className="menubar-item" onClick={onHome}>
        <Home size={14} aria-hidden />
        Home
      </button>
    </div>
  );
}
