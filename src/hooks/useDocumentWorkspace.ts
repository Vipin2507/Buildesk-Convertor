import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import prettier from 'prettier/standalone';
import * as prettierPluginHtml from 'prettier/plugins/html';
import type { DocumentModel } from '../core/document-model/types';
import { createBlankDocument, countWords, touchDocument } from '../core/document-model/create';
import { modelToHtml, modelToEditorHtml } from '../core/converters/model-to-html';
import { htmlToModel, isHtmlValidEnough } from '../core/converters/html-to-model';
import { SyncEngine } from '../core/synchronization/sync-engine';
import { DocumentHistory } from '../core/synchronization/history';
import {
  copyHtmlToClipboard,
  exportDocx,
  exportHtml,
  importDocxFile,
  importHtmlFile,
} from '../services/file-service';
import {
  loadLatestDocument,
  loadPreferences,
  saveDocumentRecord,
  savePreferences,
  clearDocumentRecord,
} from '../services/storage-service';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../utils/binary';
import { detectExactHtml } from '../core/converters/exact-html';
import type { ToastItem, ToastKind } from '../components/ui/Toast';
import type { SaveState } from '../components/editor/AppShell';

export type VisualMode = 'exact' | 'editable';
export type ExactSource = 'docx' | 'html' | null;

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export function useDocumentWorkspace() {
  const syncRef = useRef(new SyncEngine());
  const historyRef = useRef(new DocumentHistory());
  const visualDebounce = useRef<number | null>(null);
  const htmlDebounce = useRef<number | null>(null);
  const autosaveTimer = useRef<number | null>(null);
  const lastValidModel = useRef<DocumentModel | null>(null);

  const [document, setDocument] = useState<DocumentModel | null>(null);
  const [editorHtml, setEditorHtml] = useState('');
  const [sourceHtml, setSourceHtml] = useState('');
  const [htmlValid, setHtmlValid] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [busy, setBusy] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [splitRatio, setSplitRatio] = useState(() => loadPreferences().splitRatio);
  const [mobileTab, setMobileTab] = useState<'document' | 'html'>('document');
  const [hydrated, setHydrated] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [originalDocxBytes, setOriginalDocxBytes] = useState<ArrayBuffer | null>(null);
  const [originalDocxBase64, setOriginalDocxBase64] = useState<string | undefined>(undefined);
  const [visualMode, setVisualMode] = useState<VisualMode>('editable');
  const [exactSource, setExactSource] = useState<ExactSource>(null);
  const [exactHtmlSnapshot, setExactHtmlSnapshot] = useState<string | null>(null);
  const isExactHtmlRef = useRef(false);

  const isMobile = useMediaQuery('(max-width: 900px)');
  const docIdRef = useRef(createId());

  const pushToast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = createId();
    setToasts((prev) => [...prev, { id, message, kind }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const applyModel = useCallback(
    (
      model: DocumentModel,
      source: 'USER_VISUAL_EDITOR' | 'USER_HTML_EDITOR' | 'IMPORT' | 'PROGRAMMATIC' | 'RESTORE' | 'HISTORY',
      options?: { pushHistory?: boolean; keepHtml?: boolean },
    ) => {
      const sync = syncRef.current;
      sync.begin(source);
      lastValidModel.current = model;
      setDocument(model);
      setHtmlValid(true);

      const fullHtml = modelToHtml(model);
      const bodyHtml = modelToEditorHtml(model);

      if (sync.shouldPropagate(source, 'visual') || source === 'IMPORT' || source === 'RESTORE' || source === 'HISTORY') {
        setEditorHtml(bodyHtml);
      }
      if (
        (sync.shouldPropagate(source, 'html') || source === 'IMPORT' || source === 'RESTORE' || source === 'HISTORY') &&
        !options?.keepHtml
      ) {
        // Skip simplified model HTML when Exact Word snapshot owns the HTML panel
        if (!(isExactHtmlRef.current && (source === 'IMPORT' || source === 'RESTORE' || source === 'HISTORY'))) {
          setSourceHtml(fullHtml);
        }
      }

      if (options?.pushHistory !== false && source !== 'PROGRAMMATIC') {
        if (source === 'IMPORT' || source === 'RESTORE') {
          historyRef.current.reset(model);
        } else if (source === 'USER_VISUAL_EDITOR' || source === 'USER_HTML_EDITOR') {
          historyRef.current.push(model);
        } else if (source === 'HISTORY') {
          historyRef.current.replaceCurrent(model);
        }
        setCanUndo(historyRef.current.canUndo());
        setCanRedo(historyRef.current.canRedo());
      }

      setSaveState('unsaved');
    },
    [],
  );

  // Hydrate from IndexedDB
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const record = await loadLatestDocument();
        if (cancelled) return;
        if (record) {
          docIdRef.current = record.id;
          if (record.originalDocxBase64) {
            setOriginalDocxBase64(record.originalDocxBase64);
            setOriginalDocxBytes(base64ToArrayBuffer(record.originalDocxBase64));
            setVisualMode('exact');
            setExactSource('docx');
            isExactHtmlRef.current = true;
          } else if (record.isExactHtml || detectExactHtml(record.html).isExact) {
            setOriginalDocxBase64(undefined);
            setOriginalDocxBytes(null);
            setExactHtmlSnapshot(record.html);
            setVisualMode('exact');
            setExactSource('html');
            isExactHtmlRef.current = true;
          } else {
            setOriginalDocxBase64(undefined);
            setOriginalDocxBytes(null);
            setExactHtmlSnapshot(null);
            setVisualMode('editable');
            setExactSource(null);
            isExactHtmlRef.current = false;
          }
          applyModel(record.document, 'RESTORE', { pushHistory: true, keepHtml: true });
          setSourceHtml(record.html || modelToHtml(record.document));
          setSaveState('saved');
          pushToast('Document restored', 'success');
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyModel, pushToast]);

  // Autosave
  useEffect(() => {
    if (!document || saveState !== 'unsaved') return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        await saveDocumentRecord({
          id: docIdRef.current,
          document,
          html: sourceHtml,
          savedAt: new Date().toISOString(),
          originalDocxBase64: originalDocxBase64,
          isExactHtml: isExactHtmlRef.current,
        });
        setSaveState('saved');
      } catch (err) {
        console.error(err);
        setSaveState('unsaved');
        pushToast('Unable to save document locally', 'error');
      }
    }, 900);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [document, sourceHtml, saveState, pushToast, originalDocxBase64]);

  // Persist split ratio
  useEffect(() => {
    const prefs = loadPreferences();
    savePreferences({ ...prefs, splitRatio });
  }, [splitRatio]);

  const createBlank = useCallback(() => {
    docIdRef.current = createId();
    setOriginalDocxBase64(undefined);
    isExactHtmlRef.current = false;
    setOriginalDocxBytes(null);
    setExactHtmlSnapshot(null);
    setExactSource(null);
    setVisualMode('editable');
    const blank = createBlankDocument('Untitled Document');
    applyModel(blank, 'IMPORT');
    setWarnings([]);
    setMode('edit');
    pushToast('Blank document created', 'success');
  }, [applyModel, pushToast]);

  const closeDocument = useCallback(async () => {
    const id = docIdRef.current;
    try {
      await clearDocumentRecord(id);
      const prefs = loadPreferences();
      savePreferences({ ...prefs, lastDocumentId: undefined });
    } catch (err) {
      console.error(err);
    }
    if (visualDebounce.current) window.clearTimeout(visualDebounce.current);
    if (htmlDebounce.current) window.clearTimeout(htmlDebounce.current);
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    lastValidModel.current = null;
    historyRef.current.clear();
    setOriginalDocxBase64(undefined);
    isExactHtmlRef.current = false;
    setOriginalDocxBytes(null);
    setExactHtmlSnapshot(null);
    setExactSource(null);
    setVisualMode('editable');
    setDocument(null);
    setEditorHtml('');
    setSourceHtml('');
    setHtmlValid(true);
    setSaveState('saved');
    setMode('edit');
    setWarnings([]);
    setCanUndo(false);
    setCanRedo(false);
    pushToast('Document closed', 'success');
  }, [pushToast]);

  const goHome = useCallback(async () => {
    await closeDocument();
  }, [closeDocument]);

  const handleFiles = useCallback(
    async (files: FileList) => {
      const file = files[0];
      if (!file) return;
      const name = file.name.toLowerCase();
      setBusy(true);
      setProgressMessage('Uploading…');
      try {
        if (name.endsWith('.docx')) {
          const result = await importDocxFile(file, setProgressMessage);
          docIdRef.current = createId();
          const b64 = arrayBufferToBase64(result.originalBytes);
          setOriginalDocxBase64(b64);
          isExactHtmlRef.current = true;
          setOriginalDocxBytes(result.originalBytes.slice(0));
          setExactHtmlSnapshot(null);
          setExactSource('docx');
          setVisualMode('exact');
          applyModel(result.document, 'IMPORT', { keepHtml: true });
          setSourceHtml('<!-- Rendering Exact Word view into HTML… -->');
          setWarnings(result.warnings);
          pushToast('Document imported — Exact Word view + HTML syncing', 'success');
        } else if (name.endsWith('.html') || name.endsWith('.htm')) {
          setProgressMessage('Reading HTML…');
          const text = await file.text();
          const exact = detectExactHtml(text);
          if (exact.isExact) {
            docIdRef.current = createId();
            isExactHtmlRef.current = true;
            setExactHtmlSnapshot(text);
            setVisualMode('exact');
            if (exact.meta?.originalDocxBase64) {
              setOriginalDocxBase64(exact.meta.originalDocxBase64);
              setOriginalDocxBytes(base64ToArrayBuffer(exact.meta.originalDocxBase64));
              setExactSource('docx');
            } else {
              setOriginalDocxBase64(undefined);
              setOriginalDocxBytes(null);
              setExactSource('html');
            }
            const parsed = htmlToModel(text, {
              filename: file.name,
              title: exact.meta?.title || file.name.replace(/\.(html?|htm)$/i, ''),
            });
            applyModel(parsed.document, 'IMPORT', { keepHtml: true });
            setSourceHtml(text);
            setWarnings([]);
            pushToast('Exact Word HTML opened', 'success');
          } else {
            const result = await importHtmlFile(file);
            docIdRef.current = createId();
            setOriginalDocxBase64(undefined);
            isExactHtmlRef.current = false;
            setOriginalDocxBytes(null);
            setExactHtmlSnapshot(null);
            setExactSource(null);
            setVisualMode('editable');
            applyModel(result.document, 'IMPORT');
            setWarnings(result.warnings);
            pushToast(
              result.usedRoundTripMeta ? 'Document restored from exported HTML' : 'HTML imported',
              'success',
            );
            if (result.warnings.some((w) => w.includes('advanced'))) {
              pushToast('Some advanced HTML features cannot be represented exactly in DOCX.', 'warning');
            }
          }
        } else {
          pushToast('Unsupported file type', 'error');
        }
      } catch (err) {
        console.error(err);
        const message =
          err instanceof Error
            ? err.message
            : "We couldn't read this document. The file may be corrupted or incomplete.";
        pushToast(message, 'error');
      } finally {
        setBusy(false);
        setProgressMessage(null);
      }
    },
    [applyModel, pushToast],
  );

  const onVisualUpdate = useCallback(
    (bodyHtml: string) => {
      if (syncRef.current.isApplying()) return;
      if (visualDebounce.current) window.clearTimeout(visualDebounce.current);
      visualDebounce.current = window.setTimeout(() => {
        try {
          const base = lastValidModel.current ?? createBlankDocument();
          const parsed = htmlToModel(bodyHtml, {
            title: base.metadata.title,
            filename: base.metadata.filename,
          });
          const next: DocumentModel = touchDocument({
            ...parsed.document,
            metadata: {
              ...parsed.document.metadata,
              title: base.metadata.title,
              filename: base.metadata.filename,
              source: base.metadata.source,
              author: base.metadata.author,
              subject: base.metadata.subject,
              creator: base.metadata.creator,
              createdAt: base.metadata.createdAt,
            },
            originalDocxMetadata: base.originalDocxMetadata,
            defaults: base.defaults,
            styles: base.styles,
            assets: mergeAssets(base.assets, parsed.document.assets),
          });
          applyModel(next, 'USER_VISUAL_EDITOR');
        } catch (err) {
          console.error(err);
        }
      }, 280);
    },
    [applyModel],
  );

  const onHtmlChange = useCallback(
    (html: string) => {
      setSourceHtml(html);
      if (syncRef.current.isApplying()) return;

      const exact = detectExactHtml(html);
      if (exact.isExact || isExactHtmlRef.current) {
        isExactHtmlRef.current = true;
        setExactHtmlSnapshot(html);
        setVisualMode('exact');
        if (!originalDocxBytes) setExactSource('html');
        setHtmlValid(true);
        setSaveState('unsaved');
        return;
      }

      const validity = isHtmlValidEnough(html);
      setHtmlValid(validity.valid);

      if (htmlDebounce.current) window.clearTimeout(htmlDebounce.current);
      htmlDebounce.current = window.setTimeout(() => {
        if (!validity.valid) {
          return;
        }
        try {
          const check = isHtmlValidEnough(html);
          if (!check.valid) {
            setHtmlValid(false);
            return;
          }
          const base = lastValidModel.current ?? createBlankDocument();
          const parsed = htmlToModel(html, {
            title: base.metadata.title,
            filename: base.metadata.filename,
          });
          const next = touchDocument({
            ...parsed.document,
            metadata: {
              ...parsed.document.metadata,
              title: base.metadata.title,
              filename: base.metadata.filename?.replace(/\.docx$/i, '.html') ?? parsed.document.metadata.filename,
              source: base.metadata.source === 'blank' ? 'html' : base.metadata.source,
              author: base.metadata.author,
              createdAt: base.metadata.createdAt,
            },
            originalDocxMetadata: base.originalDocxMetadata,
            defaults: parsed.document.defaults ?? base.defaults,
            styles: parsed.document.styles ?? base.styles,
          });
          applyModel(next, 'USER_HTML_EDITOR', { keepHtml: true });
        } catch (err) {
          console.error(err);
          setHtmlValid(false);
          pushToast(
            'The HTML contains syntax errors. Your previous valid version is preserved.',
            'warning',
          );
        }
      }, 400);
    },
    [applyModel, pushToast, originalDocxBytes],
  );

  const applyExactHtmlFromView = useCallback((html: string) => {
    isExactHtmlRef.current = true;
    setExactHtmlSnapshot(html);
    setSourceHtml(html);
    setHtmlValid(true);
    setSaveState('unsaved');
  }, []);

  const undo = useCallback(() => {
    const prev = historyRef.current.undo();
    if (!prev) return;
    applyModel(prev, 'HISTORY');
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
  }, [applyModel]);

  const redo = useCallback(() => {
    const next = historyRef.current.redo();
    if (!next) return;
    applyModel(next, 'HISTORY');
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
  }, [applyModel]);

  const rename = useCallback((name: string) => {
    setDocument((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        metadata: {
          ...prev.metadata,
          title: name,
          filename: `${name.replace(/\.(docx|html?|htm)$/i, '')}.docx`,
          modifiedAt: new Date().toISOString(),
        },
      };
      lastValidModel.current = next;
      return next;
    });
    setSaveState('unsaved');
  }, []);

  const handleExportDocx = useCallback(async () => {
    if (!document) return;
    setBusy(true);
    try {
      await exportDocx(document, setProgressMessage);
      pushToast('DOCX exported', 'success');
    } catch (err) {
      console.error(err);
      pushToast(
        err instanceof Error ? err.message : "We couldn't generate the DOCX. Your document is still safe.",
        'error',
      );
    } finally {
      setBusy(false);
      setProgressMessage(null);
    }
  }, [document, pushToast]);

  const handleExportHtml = useCallback(() => {
    if (!document) return;
    // Prefer Exact Word snapshot so download matches what you see
    const exact =
      exactHtmlSnapshot && exactHtmlSnapshot.trim().length > 0
        ? exactHtmlSnapshot
        : isExactHtmlRef.current && sourceHtml.includes('docx-exact')
          ? sourceHtml
          : undefined;
    if (!exact && isExactHtmlRef.current) {
      pushToast('Wait for Exact Word view to finish rendering, then export again.', 'warning');
      return;
    }
    exportHtml(document, exact);
    pushToast(exact ? 'Exact Word HTML exported' : 'HTML exported', 'success');
  }, [document, exactHtmlSnapshot, sourceHtml, pushToast]);

  const handleCopyHtml = useCallback(async () => {
    try {
      await copyHtmlToClipboard(sourceHtml);
      pushToast('HTML copied', 'success');
    } catch {
      pushToast('Unable to copy HTML', 'error');
    }
  }, [sourceHtml, pushToast]);

  const handleShare = useCallback(async () => {
    await handleCopyHtml();
  }, [handleCopyHtml]);

  const handleFormatHtml = useCallback(async () => {
    try {
      const formatted = await prettier.format(sourceHtml, {
        parser: 'html',
        plugins: [prettierPluginHtml],
        printWidth: 100,
      });
      setSourceHtml(formatted);
      onHtmlChange(formatted);
      pushToast('HTML formatted', 'success');
    } catch {
      pushToast('Unable to format HTML', 'warning');
    }
  }, [sourceHtml, onHtmlChange, pushToast]);

  const words = useMemo(() => (document ? countWords(document) : 0), [document]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (document) {
          setSaveState('saving');
          void saveDocumentRecord({
            id: docIdRef.current,
            document,
            html: sourceHtml,
            savedAt: new Date().toISOString(),
            originalDocxBase64: originalDocxBase64,
            isExactHtml: isExactHtmlRef.current,
          }).then(() => {
            setSaveState('saved');
            pushToast('Changes saved', 'success');
          });
        }
      }

      if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('buildesk:open-file'));
      }

      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('buildesk:new-document'));
      }

      if (e.key.toLowerCase() === 'w') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('buildesk:close-document'));
      }

      if (e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setMobileTab((t) => (t === 'document' ? 'html' : 'document'));
      }

      if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setMode((m) => (m === 'edit' ? 'preview' : 'edit'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [document, sourceHtml, pushToast]);

  return {
    document,
    editorHtml,
    sourceHtml,
    htmlValid,
    saveState,
    mode,
    setMode,
    busy,
    progressMessage,
    warnings,
    toasts,
    dismissToast,
    splitRatio,
    setSplitRatio,
    mobileTab,
    setMobileTab,
    isMobile,
    hydrated,
    words,
    canUndo,
    canRedo,
    originalDocxBytes,
    originalDocxBase64,
    visualMode,
    setVisualMode,
    exactSource,
    exactHtmlSnapshot,
    applyExactHtmlFromView,
    createBlank,
    closeDocument,
    goHome,
    handleFiles,
    onVisualUpdate,
    onHtmlChange,
    undo,
    redo,
    rename,
    handleExportDocx,
    handleExportHtml,
    handleCopyHtml,
    handleShare,
    handleFormatHtml,
    pushToast,
  };
}

function mergeAssets(
  existing: DocumentModel['assets'],
  incoming: DocumentModel['assets'],
): DocumentModel['assets'] {
  const map = new Map<string, (typeof existing)[number]>();
  for (const a of existing) map.set(a.data, a);
  for (const a of incoming) {
    if (!map.has(a.data)) map.set(a.data, a);
  }
  return Array.from(map.values());
}
