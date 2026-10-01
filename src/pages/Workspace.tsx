import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { AlertTriangle } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { SplitPane } from '../components/SplitPane';
import { PaperViewer } from '../components/PaperViewer';
import { SourcePane } from '../components/SourcePane';
import { StatusBar } from '../components/StatusBar';
import { PreviewModal } from '../components/PreviewModal';
import { ToastViewport } from '../components/Toast';
import { EditorToolbar } from '../components/editor/EditorToolbar';
import { useDocStore } from '../store/docStore';
import { useMediaQuery } from '../hooks/useDocumentWorkspace';
import type { Editor } from '@tiptap/react';

export function WorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const openDoc = useDocStore((s) => s.openDoc);
  const activeId = useDocStore((s) => s.activeId);
  const doc = useDocStore((s) => (s.activeId ? s.docs[s.activeId] : null));
  const viewMode = useDocStore((s) => s.viewMode);
  const setViewMode = useDocStore((s) => s.setViewMode);
  const warnDismissed = useDocStore((s) => s.warnDismissed);
  const dismissWarn = useDocStore((s) => s.dismissWarn);
  const splitRatio = useDocStore((s) => s.splitRatio);
  const setSplitRatio = useDocStore((s) => s.setSplitRatio);
  const mobilePane = useDocStore((s) => s.mobilePane);
  const setMobilePane = useDocStore((s) => s.setMobilePane);
  const isMobile = useMediaQuery('(max-width: 859px)');
  const isNarrow = useMediaQuery('(max-width: 1023px)');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    if (activeId !== id) {
      void openDoc(id).then(() => {
        const exists = useDocStore.getState().docs[id];
        if (!exists) navigate('/');
      });
    }
  }, [id, activeId, openDoc, navigate]);

  if (!doc) {
    return (
      <div className="flex h-full flex-col bg-[var(--bg)]">
        <TopBar />
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--muted)]">
          Loading document…
        </div>
      </div>
    );
  }

  const documentPane = (
    <div className="flex h-full min-h-0 flex-col">
      {viewMode === 'editable' && !warnDismissed && (
        <div className="flex items-start gap-2 border-b border-[var(--warn-ink)]/20 bg-[var(--warn-bg)] px-3 py-2 text-sm text-[var(--warn-ink)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="flex-1">
            Editable view may change fonts, spacing, and colors. Switch to Exact Word view for the
            original layout (including page numbers).{' '}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setViewMode('exact')}
            >
              Exact Word view
            </button>
          </p>
          <button type="button" className="text-xs font-semibold" onClick={dismissWarn}>
            Dismiss
          </button>
        </div>
      )}
      {viewMode === 'editable' && (
        <EditorToolbar editor={editor} />
      )}
      <PaperViewer onEditorReady={setEditor} className="min-h-0 flex-1" />
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <TopBar />
      <WorkspaceHeader onPreview={() => setPreviewOpen(true)} isNarrow={isNarrow} />

      {isMobile ? (
        <Tabs.Root
          value={mobilePane === 'doc' ? 'document' : 'html'}
          onValueChange={(v) => setMobilePane(v === 'html' ? 'html' : 'doc')}
          className="flex min-h-0 flex-1 flex-col"
        >
          <Tabs.List className="flex border-b border-[var(--line)] bg-[var(--surface)] px-2">
            <Tabs.Trigger
              value="document"
              className="min-h-10 flex-1 px-3 text-sm font-medium data-[state=active]:border-b-2 data-[state=active]:border-[var(--primary)] data-[state=active]:text-[var(--primary)]"
            >
              Document
            </Tabs.Trigger>
            <Tabs.Trigger
              value="html"
              className="min-h-10 flex-1 px-3 text-sm font-medium data-[state=active]:border-b-2 data-[state=active]:border-[var(--primary)] data-[state=active]:text-[var(--primary)]"
            >
              HTML source
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="document" className="min-h-0 flex-1 outline-none">
            {documentPane}
          </Tabs.Content>
          <Tabs.Content value="html" className="min-h-0 flex-1 outline-none">
            <SourcePane />
          </Tabs.Content>
        </Tabs.Root>
      ) : (
        <SplitPane
          ratio={splitRatio}
          onRatioChange={setSplitRatio}
          left={documentPane}
          right={<SourcePane />}
        />
      )}

      <StatusBar showStatusChips={isMobile} />
      <ToastViewport />

      <PreviewModal open={previewOpen} onOpenChange={setPreviewOpen} title={doc.title}>
        <PaperViewer />
      </PreviewModal>
    </div>
  );
}
