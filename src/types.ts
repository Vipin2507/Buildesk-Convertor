export type ViewMode = 'exact' | 'editable';
export type SaveState = 'saving' | 'saved' | 'error' | 'unsaved';
export type SyncState = 'synced' | 'syncing' | 'offline';
export type ChangeOrigin = 'editor' | 'source' | 'load' | null;
export type ThemeMode = 'light' | 'dark';

export interface Doc {
  id: string;
  title: string;
  sourceFormat: 'docx' | 'html' | 'blank';
  exactHtml: string;
  editableHtml: string;
  pageCount: number;
  approxPages: number;
  wordCount: number;
  htmlValid: boolean;
  saveState: SaveState;
  syncState: SyncState;
  updatedAt: string;
  version: number;
  /** Base64 original DOCX for Exact Word fidelity (repo extension) */
  originalDocxBase64?: string;
  /** Editable TipTap body HTML */
  editorBodyHtml?: string;
}

export interface RecentDoc {
  id: string;
  title: string;
  updatedAt: string;
  sourceFormat: Doc['sourceFormat'];
}

export interface ToastMessage {
  id: string;
  message: string;
  kind: 'info' | 'success' | 'error';
}

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
}
