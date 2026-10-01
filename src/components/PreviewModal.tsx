import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface PreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

export function PreviewModal({ open, onOpenChange, title, children }: PreviewModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[900] bg-black/50" />
        <Dialog.Content className="fixed inset-3 z-[901] flex flex-col overflow-hidden rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--bg)] shadow-[var(--shadow-soft)] focus:outline-none sm:inset-6">
          <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3">
            <Dialog.Title className="text-sm font-semibold">Preview — {title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-[var(--radius-control)] hover:bg-[var(--primary-soft)]"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
