import { useCallback, useRef } from 'react';
import { cn } from '../lib/utils';

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  ratio: number;
  onRatioChange: (ratio: number) => void;
  className?: string;
}

export function SplitPane({ left, right, ratio, onRatioChange, className }: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next = (clientX - rect.left) / rect.width;
      onRatioChange(Math.min(0.75, Math.max(0.25, next)));
    },
    [onRatioChange],
  );

  return (
    <div ref={containerRef} className={cn('flex min-h-0 flex-1', className)}>
      <div className="min-h-0 min-w-0 overflow-hidden" style={{ width: `${ratio * 100}%` }}>
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={25}
        aria-valuemax={75}
        tabIndex={0}
        className="group relative z-10 w-1.5 shrink-0 cursor-col-resize bg-[var(--line)] hover:bg-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        onMouseDown={(e) => {
          e.preventDefault();
          dragging.current = true;
          const onMove = (ev: MouseEvent) => {
            if (!dragging.current) return;
            setFromClientX(ev.clientX);
          };
          const onUp = () => {
            dragging.current = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') onRatioChange(Math.max(0.25, ratio - 0.02));
          if (e.key === 'ArrowRight') onRatioChange(Math.min(0.75, ratio + 0.02));
        }}
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{right}</div>
    </div>
  );
}
