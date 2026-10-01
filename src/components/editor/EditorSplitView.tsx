import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface EditorSplitViewProps {
  left: ReactNode;
  right: ReactNode;
  ratio: number;
  onRatioChange: (ratio: number) => void;
  mobileTab: 'document' | 'html';
  onMobileTabChange: (tab: 'document' | 'html') => void;
  isMobile: boolean;
}

export function EditorSplitView({
  left,
  right,
  ratio,
  onRatioChange,
  mobileTab,
  onMobileTabChange,
  isMobile,
}: EditorSplitViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = (e.clientX - rect.left) / rect.width;
      onRatioChange(Math.min(0.75, Math.max(0.3, next)));
    },
    [dragging, onRatioChange],
  );

  const stopDrag = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDrag);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, onPointerMove, stopDrag]);

  return (
    <>
      <div className="mobile-tabs" role="tablist" aria-label="Editor panels">
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'document'}
          className={`mobile-tab ${mobileTab === 'document' ? 'is-active' : ''}`}
          onClick={() => onMobileTabChange('document')}
        >
          Document
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'html'}
          className={`mobile-tab ${mobileTab === 'html' ? 'is-active' : ''}`}
          onClick={() => onMobileTabChange('html')}
        >
          HTML
        </button>
      </div>

      <div
        ref={containerRef}
        className={`split-view ${isMobile ? 'is-mobile' : ''}`}
      >
        <div
          className={`split-pane ${mobileTab === 'document' ? 'is-active' : ''}`}
          style={{ width: isMobile ? '100%' : `${ratio * 100}%` }}
          role="tabpanel"
        >
          {left}
        </div>

        <div
          className={`split-divider ${dragging ? 'is-dragging' : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={Math.round(ratio * 100)}
          tabIndex={0}
          onPointerDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') onRatioChange(Math.max(0.3, ratio - 0.02));
            if (e.key === 'ArrowRight') onRatioChange(Math.min(0.75, ratio + 0.02));
          }}
        />

        <div
          className={`split-pane ${mobileTab === 'html' ? 'is-active' : ''}`}
          style={{ width: isMobile ? '100%' : `${(1 - ratio) * 100}%` }}
          role="tabpanel"
        >
          {right}
        </div>
      </div>
    </>
  );
}
