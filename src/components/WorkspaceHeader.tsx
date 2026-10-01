import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import {
  Download,
  Eye,
  MoreHorizontal,
  Redo2,
  Share2,
  Undo2,
  X,
} from 'lucide-react';
import { useDocStore } from '../store/docStore';
import { ModeSwitch } from './ModeSwitch';
import { cn } from '../lib/utils';

interface WorkspaceHeaderProps {
  onPreview: () => void;
  isNarrow: boolean;
}

export function WorkspaceHeader({ onPreview, isNarrow }: WorkspaceHeaderProps) {
  const navigate = useNavigate();
  const doc = useDocStore((s) => (s.activeId ? s.docs[s.activeId] : null));
  const viewMode = useDocStore((s) => s.viewMode);
  const canUndo = useDocStore((s) => s.canUndo);
  const canRedo = useDocStore((s) => s.canRedo);
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const exportDocx = useDocStore((s) => s.exportDocx);
  const downloadHtml = useDocStore((s) => s.downloadHtml);
  const closeDoc = useDocStore((s) => s.closeDoc);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  if (!doc) return null;

  const requestClose = () => {
    if (doc.saveState === 'unsaved' || doc.saveState === 'saving') {
      setConfirmOpen(true);
      return;
    }
    void closeDoc().then(() => navigate('/'));
  };

  const saveChip =
    doc.saveState === 'saved'
      ? { label: 'Saved', tone: 'ok' as const }
      : doc.saveState === 'saving'
        ? { label: 'Saving…', tone: 'warn' as const }
        : doc.saveState === 'error'
          ? { label: 'Save error', tone: 'err' as const }
          : { label: 'Unsaved', tone: 'warn' as const };

  const syncChip =
    doc.syncState === 'synced'
      ? { label: 'Synced', tone: 'ok' as const }
      : doc.syncState === 'syncing'
        ? { label: 'Syncing…', tone: 'warn' as const }
        : { label: 'Offline', tone: 'warn' as const };

  return (
    <>
      <header className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="flex items-center gap-3 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)' }}
              aria-hidden
            >
              B
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                Buildesk Convertor
              </p>
              <input
                ref={titleRef}
                className="w-full max-w-[280px] truncate border-0 bg-transparent text-sm font-semibold text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                defaultValue={doc.title}
                title={doc.title}
                aria-label="Document title"
                onBlur={(e) => {
                  const title = e.target.value.trim() || 'Untitled document';
                  useDocStore.setState((s) => {
                    if (!s.activeId || !s.docs[s.activeId]) return s;
                    return {
                      docs: {
                        ...s.docs,
                        [s.activeId]: { ...s.docs[s.activeId], title },
                      },
                    };
                  });
                }}
              />
            </div>
            <button
              type="button"
              className="ml-1 inline-flex min-h-10 min-w-10 items-center justify-center rounded-[var(--radius-control)] text-[var(--muted)] hover:text-[var(--danger)]"
              aria-label="Close document"
              onClick={requestClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="hidden items-center gap-2 md:flex" aria-live="polite">
            <StatusChip {...saveChip} />
            <StatusChip {...syncChip} />
          </div>

          <div className="flex items-center gap-1">
            {!isNarrow && (
              <>
                <IconBtn label="Undo" disabled={!canUndo} onClick={undo}>
                  <Undo2 className="h-4 w-4" />
                </IconBtn>
                <IconBtn label="Redo" disabled={!canRedo} onClick={redo}>
                  <Redo2 className="h-4 w-4" />
                </IconBtn>
              </>
            )}
            <IconBtn label="Preview" onClick={onPreview}>
              <Eye className="h-4 w-4" />
              {!isNarrow && <span className="ml-1 text-xs">Preview</span>}
            </IconBtn>
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-control)] bg-[var(--primary)] px-3 text-sm font-semibold text-white hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
              onClick={() => void exportDocx()}
            >
              <Download className="h-4 w-4" />
              {!isNarrow && 'Export DOCX'}
            </button>
            {isNarrow ? (
              <MoreMenu onHtml={downloadHtml} onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} />
            ) : (
              <>
                <IconBtn label="Download HTML" onClick={downloadHtml}>
                  HTML
                </IconBtn>
                <ShareMenu />
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] bg-[var(--bg)] px-3 py-2 sm:px-4">
          <p className="text-xs text-[var(--muted)]">
            {viewMode === 'exact'
              ? 'Exact Word layout — HTML is generated from this view'
              : 'Editable view — for changing content'}
            <span className="ml-2 font-medium text-[var(--ink)]">{doc.pageCount} pages</span>
          </p>
          <ModeSwitch />
        </div>
      </header>

      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[900] bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[901] w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)] focus:outline-none">
            <Dialog.Title className="text-base font-semibold">Unsaved changes</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-[var(--muted)]">
              Close this document and discard unsaved edits?
            </Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" className="min-h-10 rounded-[var(--radius-control)] px-3 text-sm">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="min-h-10 rounded-[var(--radius-control)] bg-[var(--danger)] px-3 text-sm font-semibold text-white"
                onClick={() => {
                  setConfirmOpen(false);
                  void closeDoc().then(() => navigate('/'));
                }}
              >
                Discard & close
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function StatusChip({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'err' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'ok' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        tone === 'warn' && 'bg-[var(--warn-bg)] text-[var(--warn-ink)]',
        tone === 'err' && 'bg-red-500/10 text-[var(--danger)]',
      )}
    >
      ● {label}
    </span>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line)] px-2 text-sm disabled:opacity-40 hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
    >
      {children}
    </button>
  );
}

function ShareMenu() {
  const [copied, setCopied] = useState(false);
  const pushToast = useDocStore((s) => s.pushToast);
  const doc = useDocStore((s) => (s.activeId ? s.docs[s.activeId] : null));

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-control)] border border-[var(--line)] px-2 text-sm hover:border-[var(--primary)] hover:text-[var(--primary)]"
          aria-label="Share"
        >
          <Share2 className="h-4 w-4" />
          <span className="hidden lg:inline">Share</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-[800] w-72 rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)]"
          sideOffset={6}
        >
          <p className="text-sm font-semibold">Share document</p>
          <label className="mt-2 block text-xs text-[var(--muted)]">
            Permission
            <select className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--bg)] px-2 py-2 text-sm">
              <option value="view">View</option>
              <option value="edit">Edit</option>
            </select>
          </label>
          <button
            type="button"
            className="mt-3 w-full min-h-10 rounded-[var(--radius-control)] bg-[var(--primary)] text-sm font-semibold text-white"
            onClick={async () => {
              const url = `${window.location.origin}/doc/${doc?.id || ''}`;
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                pushToast('Link copied', 'success');
              } catch {
                pushToast('Could not copy link', 'error');
              }
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MoreMenu({
  onHtml,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  onHtml: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line)]"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="z-[800] w-44 rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] p-1 shadow-[var(--shadow-soft)]">
          <button type="button" className="block w-full rounded-md px-3 py-2 text-left text-sm disabled:opacity-40" disabled={!canUndo} onClick={onUndo}>Undo</button>
          <button type="button" className="block w-full rounded-md px-3 py-2 text-left text-sm disabled:opacity-40" disabled={!canRedo} onClick={onRedo}>Redo</button>
          <button type="button" className="block w-full rounded-md px-3 py-2 text-left text-sm" onClick={onHtml}>HTML</button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
