import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, FilePlus2, FileText, FolderOpen, Home } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { useDocStore } from '../store/docStore';
import { cn, formatRelativeTime } from '../lib/utils';

export function TopBar() {
  const navigate = useNavigate();
  const createBlank = useDocStore((s) => s.createBlank);
  const uploadFile = useDocStore((s) => s.uploadFile);
  const openDoc = useDocStore((s) => s.openDoc);
  const recents = useDocStore((s) => s.recents);
  const activeId = useDocStore((s) => s.activeId);
  const docxRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLInputElement>(null);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    const id = await uploadFile(file);
    if (id) navigate(`/doc/${id}`);
  };

  return (
    <header
      className="flex h-[var(--header-height)] shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-3 sm:px-4"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'max(12px, env(safe-area-inset-left))',
        paddingRight: 'max(12px, env(safe-area-inset-right))',
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-medium hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
            >
              File <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-[800] min-w-[220px] rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] p-1 shadow-[var(--shadow-soft)]"
              sideOffset={6}
            >
              <MenuItem
                onSelect={() => {
                  const id = createBlank();
                  navigate(`/doc/${id}`);
                }}
              >
                <FilePlus2 className="h-4 w-4" /> New blank document
              </MenuItem>
              <MenuItem onSelect={() => docxRef.current?.click()}>
                <FolderOpen className="h-4 w-4" /> Open DOCX
              </MenuItem>
              <MenuItem onSelect={() => htmlRef.current?.click()}>
                <FileText className="h-4 w-4" /> Open HTML
              </MenuItem>
              {recents.length > 0 && (
                <>
                  <DropdownMenu.Separator className="my-1 h-px bg-[var(--line)]" />
                  <DropdownMenu.Label className="px-2 py-1 text-xs text-[var(--muted)]">
                    Recent
                  </DropdownMenu.Label>
                  {recents.map((r) => (
                    <MenuItem
                      key={r.id}
                      onSelect={() => {
                        void openDoc(r.id).then(() => navigate(`/doc/${r.id}`));
                      }}
                    >
                      <span className="truncate">{r.title}</span>
                      <span className="ml-auto text-xs text-[var(--muted)]">
                        {formatRelativeTime(r.updatedAt)}
                      </span>
                    </MenuItem>
                  ))}
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <button
          type="button"
          className={cn(
            'inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-medium text-[var(--muted)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2',
            !activeId && 'opacity-50',
          )}
          onClick={() => navigate('/')}
          aria-label="Home"
        >
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">Home</span>
        </button>
      </div>

      <ThemeToggle />

      <input
        ref={docxRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
      <input
        ref={htmlRef}
        type="file"
        accept=".html,.htm,text/html"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
    </header>
  );
}

function MenuItem({
  children,
  onSelect,
}: {
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-[highlighted]:bg-[var(--primary-soft)] data-[highlighted]:text-[var(--primary)]"
      onSelect={(e) => {
        e.preventDefault();
        onSelect();
      }}
    >
      {children}
    </DropdownMenu.Item>
  );
}
