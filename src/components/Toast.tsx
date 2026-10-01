import * as Toast from '@radix-ui/react-toast';
import { useDocStore } from '../store/docStore';
import { cn } from '../lib/utils';

export function ToastViewport() {
  const toasts = useDocStore((s) => s.toasts);
  const dismissToast = useDocStore((s) => s.dismissToast);

  return (
    <Toast.Provider swipeDirection="right">
      {toasts.map((t) => (
        <Toast.Root
          key={t.id}
          open
          duration={4000}
          onOpenChange={(open) => {
            if (!open) dismissToast(t.id);
          }}
          className={cn(
            'rounded-[var(--radius-panel)] border px-4 py-3 text-sm shadow-[var(--shadow-soft)]',
            t.kind === 'error' && 'border-[var(--danger)] bg-[var(--surface)] text-[var(--danger)]',
            t.kind === 'success' && 'border-[var(--success)] bg-[var(--surface)] text-[var(--success)]',
            t.kind === 'info' && 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]',
          )}
        >
          <Toast.Title>{t.message}</Toast.Title>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed bottom-4 right-4 z-[1000] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2 outline-none" />
    </Toast.Provider>
  );
}
