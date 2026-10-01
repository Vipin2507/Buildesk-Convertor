import { create } from 'zustand';
import type {
  ChangeOrigin,
  Doc,
  RecentDoc,
  SaveState,
  SyncState,
  ThemeMode,
  ToastMessage,
  ViewMode,
} from '../types';
import { applyThemeToDocument, readStoredTheme, writeStoredTheme } from '../lib/theme';
import {
  convertDocxToHtml,
  convertHtmlFile,
  createBlankDoc,
  downloadHtmlFile,
  htmlToDocxBlob,
  MAX_UPLOAD_BYTES,
  toApiError,
} from '../lib/api';
import {
  deleteDocFromIdb,
  loadDocFromIdb,
  loadRecents,
  loadSplitRatio,
  saveDocToIdb,
  saveSplitRatio,
} from '../lib/storage';
import { createId } from '../lib/utils';
import { createBlankDocument, countWords } from '../core/document-model/create';
import { modelToHtml, modelToEditorHtml } from '../core/converters/model-to-html';
import { htmlToModel, isHtmlValidEnough } from '../core/converters/html-to-model';
import type { DocumentModel } from '../core/document-model/types';
import { saveAs } from 'file-saver';

interface HistoryEntry {
  exactHtml: string;
  editableHtml: string;
  editorBodyHtml: string;
}

interface DocStore {
  docs: Record<string, Doc>;
  models: Record<string, DocumentModel>;
  activeId: string | null;
  recents: RecentDoc[];
  viewMode: ViewMode;
  mobilePane: 'doc' | 'html';
  splitRatio: number;
  zoom: number;
  theme: ThemeMode;
  warnDismissed: boolean;
  lastChangeOrigin: ChangeOrigin;
  parseProgress: number | null;
  parseMessage: string | null;
  toasts: ToastMessage[];
  canUndo: boolean;
  canRedo: boolean;
  history: HistoryEntry[];
  historyIndex: number;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
  pushToast: (message: string, kind?: ToastMessage['kind']) => void;
  dismissToast: (id: string) => void;
  uploadFile: (file: File) => Promise<string | null>;
  createBlank: () => string;
  openDoc: (id: string) => Promise<void>;
  closeDoc: () => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setMobilePane: (p: 'doc' | 'html') => void;
  setSplitRatio: (n: number) => void;
  setZoom: (n: number) => void;
  updateFromEditor: (bodyHtml: string) => void;
  updateFromSource: (html: string) => void;
  setExactHtml: (html: string, pageCount?: number) => void;
  formatSource: () => Promise<void>;
  copySource: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  exportDocx: () => Promise<void>;
  downloadHtml: () => void;
  dismissWarn: () => void;
  markSaving: (state: SaveState) => void;
  setSyncState: (state: SyncState) => void;
  getActiveDoc: () => Doc | null;
  getActiveModel: () => DocumentModel | null;
}

function pushHistory(
  state: Pick<DocStore, 'history' | 'historyIndex'>,
  doc: Doc,
): Pick<DocStore, 'history' | 'historyIndex' | 'canUndo' | 'canRedo'> {
  const entry: HistoryEntry = {
    exactHtml: doc.exactHtml,
    editableHtml: doc.editableHtml,
    editorBodyHtml: doc.editorBodyHtml || '',
  };
  const trimmed = state.history.slice(0, state.historyIndex + 1);
  trimmed.push(entry);
  const history = trimmed.slice(-100);
  return {
    history,
    historyIndex: history.length - 1,
    canUndo: history.length > 1,
    canRedo: false,
  };
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let editorDebounce: ReturnType<typeof setTimeout> | null = null;
let sourceDebounce: ReturnType<typeof setTimeout> | null = null;

export const useDocStore = create<DocStore>((set, get) => ({
  docs: {},
  models: {},
  activeId: null,
  recents: [],
  viewMode: 'exact',
  mobilePane: 'doc',
  splitRatio: loadSplitRatio(),
  zoom: 100,
  theme: readStoredTheme(),
  warnDismissed: false,
  lastChangeOrigin: null,
  parseProgress: null,
  parseMessage: null,
  toasts: [],
  canUndo: false,
  canRedo: false,
  history: [],
  historyIndex: -1,
  hydrated: false,

  hydrate: async () => {
    const theme = readStoredTheme();
    applyThemeToDocument(theme);
    const recents = await loadRecents();
    set({ theme, recents, hydrated: true, splitRatio: loadSplitRatio() });
  },

  setTheme: (t) => {
    writeStoredTheme(t);
    applyThemeToDocument(t);
    set({ theme: t });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  pushToast: (message, kind = 'info') => {
    const id = createId();
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    window.setTimeout(() => get().dismissToast(id), 4000);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  getActiveDoc: () => {
    const { activeId, docs } = get();
    return activeId ? docs[activeId] ?? null : null;
  },

  getActiveModel: () => {
    const { activeId, models } = get();
    return activeId ? models[activeId] ?? null : null;
  },

  uploadFile: async (file) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      get().pushToast('File too large. Maximum size is 50 MB.', 'error');
      return null;
    }
    set({ parseProgress: 0, parseMessage: 'Starting…' });
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith('.docx')) {
        const result = await convertDocxToHtml(file, (pct, message) => {
          set({ parseProgress: pct, parseMessage: message });
        });
        const now = new Date().toISOString();
        const doc: Doc = {
          id: createId(),
          title: result.meta.title,
          sourceFormat: 'docx',
          exactHtml: result.exactHtml,
          editableHtml: result.editableHtml,
          editorBodyHtml: result.editorBodyHtml,
          pageCount: result.meta.pageCount,
          approxPages: result.meta.pageCount,
          wordCount: result.meta.wordCount,
          htmlValid: true,
          saveState: 'saved',
          syncState: navigator.onLine ? 'synced' : 'offline',
          updatedAt: now,
          version: 1,
          originalDocxBase64: result.originalDocxBase64,
        };
        set((s) => ({
          docs: { ...s.docs, [doc.id]: doc },
          models: { ...s.models, [doc.id]: result.model },
          activeId: doc.id,
          viewMode: 'exact',
          parseProgress: null,
          parseMessage: null,
          history: [{
            exactHtml: doc.exactHtml,
            editableHtml: doc.editableHtml,
            editorBodyHtml: doc.editorBodyHtml || '',
          }],
          historyIndex: 0,
          canUndo: false,
          canRedo: false,
          lastChangeOrigin: 'load',
        }));
        await saveDocToIdb(doc);
        set({ recents: await loadRecents() });
        get().pushToast('Document uploaded', 'success');
        return doc.id;
      }

      if (name.endsWith('.html') || name.endsWith('.htm')) {
        set({ parseProgress: 40, parseMessage: 'Parsing HTML…' });
        const result = await convertHtmlFile(file);
        const now = new Date().toISOString();
        const doc: Doc = {
          id: createId(),
          title: result.meta.title,
          sourceFormat: 'html',
          exactHtml: result.exactHtml,
          editableHtml: result.editableHtml,
          editorBodyHtml: result.editorBodyHtml,
          pageCount: result.meta.pageCount,
          approxPages: result.meta.pageCount,
          wordCount: result.meta.wordCount,
          htmlValid: true,
          saveState: 'saved',
          syncState: navigator.onLine ? 'synced' : 'offline',
          updatedAt: now,
          version: 1,
          originalDocxBase64: result.originalDocxBase64,
        };
        set((s) => ({
          docs: { ...s.docs, [doc.id]: doc },
          models: { ...s.models, [doc.id]: result.model },
          activeId: doc.id,
          viewMode: result.isExact ? 'exact' : 'editable',
          parseProgress: null,
          parseMessage: null,
          history: [{
            exactHtml: doc.exactHtml,
            editableHtml: doc.editableHtml,
            editorBodyHtml: doc.editorBodyHtml || '',
          }],
          historyIndex: 0,
          lastChangeOrigin: 'load',
        }));
        await saveDocToIdb(doc);
        set({ recents: await loadRecents() });
        get().pushToast('HTML opened', 'success');
        return doc.id;
      }

      get().pushToast('Unsupported file type. Use DOCX or HTML.', 'error');
      set({ parseProgress: null, parseMessage: null });
      return null;
    } catch (err) {
      const apiErr = toApiError(err, 'UPLOAD');
      get().pushToast(apiErr.message, 'error');
      set({ parseProgress: null, parseMessage: null });
      return null;
    }
  },

  createBlank: () => {
    const blank = createBlankDocument();
    const doc = createBlankDoc();
    doc.editableHtml = modelToHtml(blank);
    doc.editorBodyHtml = modelToEditorHtml(blank);
    doc.exactHtml = doc.editableHtml;
    set((s) => ({
      docs: { ...s.docs, [doc.id]: doc },
      models: { ...s.models, [doc.id]: blank },
      activeId: doc.id,
      viewMode: 'editable',
      history: [{
        exactHtml: doc.exactHtml,
        editableHtml: doc.editableHtml,
        editorBodyHtml: doc.editorBodyHtml || '',
      }],
      historyIndex: 0,
      lastChangeOrigin: 'load',
    }));
    void saveDocToIdb(doc).then(async () => {
      set({ recents: await loadRecents() });
    });
    return doc.id;
  },

  openDoc: async (id) => {
    const existing = get().docs[id];
    if (existing) {
      set({ activeId: id });
      return;
    }
    const stored = await loadDocFromIdb(id);
    if (!stored) {
      get().pushToast('Document not found', 'error');
      return;
    }
    try {
      const parsed = htmlToModel(stored.editableHtml || stored.exactHtml, {
        filename: `${stored.title}.html`,
      });
      set((s) => ({
        docs: { ...s.docs, [id]: stored },
        models: { ...s.models, [id]: parsed.document },
        activeId: id,
        lastChangeOrigin: 'load',
      }));
    } catch {
      set((s) => ({
        docs: { ...s.docs, [id]: stored },
        activeId: id,
        lastChangeOrigin: 'load',
      }));
    }
  },

  closeDoc: async () => {
    const id = get().activeId;
    if (id) await deleteDocFromIdb(id);
    set((s) => {
      const docs = { ...s.docs };
      const models = { ...s.models };
      if (id) {
        delete docs[id];
        delete models[id];
      }
      return { docs, models, activeId: null, warnDismissed: false };
    });
    set({ recents: await loadRecents() });
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  setMobilePane: (p) => set({ mobilePane: p }),
  setSplitRatio: (n) => {
    saveSplitRatio(n);
    set({ splitRatio: n });
  },
  setZoom: (n) => set({ zoom: Math.min(200, Math.max(50, n)) }),
  dismissWarn: () => set({ warnDismissed: true }),

  updateFromEditor: (bodyHtml) => {
    if (editorDebounce) clearTimeout(editorDebounce);
    editorDebounce = setTimeout(() => {
      const { activeId, docs, lastChangeOrigin } = get();
      if (!activeId || lastChangeOrigin === 'source') return;
      const doc = docs[activeId];
      if (!doc) return;
      try {
        const wrapped = `<!DOCTYPE html><html><body>${bodyHtml}</body></html>`;
        const { document: model } = htmlToModel(wrapped, { filename: `${doc.title}.html` });
        const editableHtml = modelToHtml(model);
        const next: Doc = {
          ...doc,
          editorBodyHtml: bodyHtml,
          editableHtml,
          wordCount: countWords(model),
          approxPages: Math.max(1, Math.ceil(countWords(model) / 300)),
          htmlValid: true,
          saveState: 'saving',
          updatedAt: new Date().toISOString(),
          version: doc.version + 1,
        };
        set((s) => {
          const hist = pushHistory(s, next);
          return {
            docs: { ...s.docs, [activeId]: next },
            models: { ...s.models, [activeId]: model },
            lastChangeOrigin: 'editor',
            ...hist,
          };
        });
        scheduleAutosave(activeId);
      } catch {
        set((s) => ({
          docs: {
            ...s.docs,
            [activeId]: { ...doc, editorBodyHtml: bodyHtml, htmlValid: false, saveState: 'unsaved' },
          },
          lastChangeOrigin: 'editor',
        }));
      }
    }, 300);
  },

  updateFromSource: (html) => {
    if (sourceDebounce) clearTimeout(sourceDebounce);
    sourceDebounce = setTimeout(() => {
      const { activeId, docs, lastChangeOrigin } = get();
      if (!activeId || lastChangeOrigin === 'editor') return;
      const doc = docs[activeId];
      if (!doc) return;
      const valid = isHtmlValidEnough(html);
      if (!valid.valid) {
        set((s) => ({
          docs: {
            ...s.docs,
            [activeId]: { ...doc, exactHtml: html, editableHtml: html, htmlValid: false },
          },
          lastChangeOrigin: 'source',
        }));
        return;
      }
      try {
        const { document: model } = htmlToModel(html, { filename: `${doc.title}.html` });
        const editorBodyHtml = modelToEditorHtml(model);
        const next: Doc = {
          ...doc,
          exactHtml: html,
          editableHtml: html,
          editorBodyHtml,
          wordCount: countWords(model),
          approxPages: Math.max(1, Math.ceil(countWords(model) / 300)),
          htmlValid: true,
          saveState: 'saving',
          updatedAt: new Date().toISOString(),
          version: doc.version + 1,
        };
        set((s) => {
          const hist = pushHistory(s, next);
          return {
            docs: { ...s.docs, [activeId]: next },
            models: { ...s.models, [activeId]: model },
            lastChangeOrigin: 'source',
            ...hist,
          };
        });
        scheduleAutosave(activeId);
      } catch {
        set((s) => ({
          docs: {
            ...s.docs,
            [activeId]: { ...doc, exactHtml: html, editableHtml: html, htmlValid: false },
          },
          lastChangeOrigin: 'source',
        }));
      }
    }, 300);
  },

  setExactHtml: (html, pageCount) => {
    const { activeId, docs } = get();
    if (!activeId) return;
    const doc = docs[activeId];
    if (!doc) return;
    const next: Doc = {
      ...doc,
      exactHtml: html,
      pageCount: pageCount || doc.pageCount,
      updatedAt: new Date().toISOString(),
    };
    set((s) => ({ docs: { ...s.docs, [activeId]: next } }));
    scheduleAutosave(activeId);
  },

  formatSource: async () => {
    const doc = get().getActiveDoc();
    if (!doc) return;
    try {
      const prettier = await import('prettier/standalone');
      const plugin = await import('prettier/plugins/html');
      const formatted = await prettier.default.format(doc.exactHtml || doc.editableHtml, {
        parser: 'html',
        plugins: [plugin],
      });
      get().updateFromSource(formatted);
      get().pushToast('Formatted', 'success');
    } catch {
      get().pushToast('Could not format HTML', 'error');
    }
  },

  copySource: async () => {
    const doc = get().getActiveDoc();
    if (!doc) return;
    try {
      await navigator.clipboard.writeText(doc.exactHtml || doc.editableHtml);
      get().pushToast('Copied', 'success');
    } catch {
      get().pushToast('Copy failed', 'error');
    }
  },

  undo: () => {
    const { historyIndex, history, activeId, docs } = get();
    if (!activeId || historyIndex <= 0) return;
    const idx = historyIndex - 1;
    const entry = history[idx];
    const doc = docs[activeId];
    if (!doc || !entry) return;
    set((s) => ({
      historyIndex: idx,
      canUndo: idx > 0,
      canRedo: true,
      lastChangeOrigin: 'load',
      docs: {
        ...s.docs,
        [activeId]: {
          ...doc,
          exactHtml: entry.exactHtml,
          editableHtml: entry.editableHtml,
          editorBodyHtml: entry.editorBodyHtml,
        },
      },
    }));
  },

  redo: () => {
    const { historyIndex, history, activeId, docs } = get();
    if (!activeId || historyIndex >= history.length - 1) return;
    const idx = historyIndex + 1;
    const entry = history[idx];
    const doc = docs[activeId];
    if (!doc || !entry) return;
    set((s) => ({
      historyIndex: idx,
      canUndo: true,
      canRedo: idx < history.length - 1,
      lastChangeOrigin: 'load',
      docs: {
        ...s.docs,
        [activeId]: {
          ...doc,
          exactHtml: entry.exactHtml,
          editableHtml: entry.editableHtml,
          editorBodyHtml: entry.editorBodyHtml,
        },
      },
    }));
  },

  exportDocx: async () => {
    const model = get().getActiveModel();
    const doc = get().getActiveDoc();
    if (!model || !doc) return;
    try {
      const blob = await htmlToDocxBlob(doc.editableHtml, doc.title);
      saveAs(blob, `${doc.title}.docx`);
      get().pushToast('DOCX exported', 'success');
    } catch (err) {
      get().pushToast(toApiError(err).message, 'error');
    }
  },

  downloadHtml: () => {
    const doc = get().getActiveDoc();
    if (!doc) return;
    const html = get().viewMode === 'exact' ? doc.exactHtml : doc.editableHtml;
    downloadHtmlFile(html, doc.title);
    get().pushToast('HTML downloaded', 'success');
  },

  markSaving: (state) => {
    const { activeId, docs } = get();
    if (!activeId || !docs[activeId]) return;
    set((s) => ({
      docs: { ...s.docs, [activeId]: { ...s.docs[activeId], saveState: state } },
    }));
  },

  setSyncState: (state) => {
    const { activeId, docs } = get();
    if (!activeId || !docs[activeId]) return;
    set((s) => ({
      docs: { ...s.docs, [activeId]: { ...s.docs[activeId], syncState: state } },
    }));
  },
}));

function scheduleAutosave(id: string) {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    const doc = useDocStore.getState().docs[id];
    if (!doc) return;
    useDocStore.getState().markSaving('saving');
    useDocStore.getState().setSyncState(navigator.onLine ? 'syncing' : 'offline');
    try {
      await saveDocToIdb({ ...doc, saveState: 'saved', updatedAt: new Date().toISOString() });
      useDocStore.setState((s) => ({
        docs: {
          ...s.docs,
          [id]: { ...s.docs[id], saveState: 'saved', syncState: navigator.onLine ? 'synced' : 'offline' },
        },
        recents: s.recents,
      }));
      const recents = await loadRecents();
      useDocStore.setState({ recents });
    } catch {
      useDocStore.getState().markSaving('error');
      useDocStore.getState().pushToast('Autosave failed', 'error');
    }
  }, 1000);
}
