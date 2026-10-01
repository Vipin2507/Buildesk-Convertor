import { openDB, type IDBPDatabase } from 'idb';
import type { DocumentModel } from '../core/document-model/types';

const DB_NAME = 'buildesk-convertor';
const DB_VERSION = 1;
const STORE = 'documents';
const PREFS_KEY = 'buildesk-convertor-prefs';

export interface SavedDocumentRecord {
  id: string;
  document: DocumentModel;
  html: string;
  savedAt: string;
  /** Base64 of original DOCX for exact Word preview */
  originalDocxBase64?: string;
  /** True when HTML is a fidelity snapshot from Exact Word view */
  isExactHtml?: boolean;
}

export interface AppPreferences {
  splitRatio: number;
  lastDocumentId?: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveDocumentRecord(record: SavedDocumentRecord): Promise<void> {
  const db = await getDb();
  await db.put(STORE, record);
  const prefs = loadPreferences();
  savePreferences({ ...prefs, lastDocumentId: record.id });
}

export async function loadDocumentRecord(id: string): Promise<SavedDocumentRecord | undefined> {
  const db = await getDb();
  return db.get(STORE, id);
}

export async function loadLatestDocument(): Promise<SavedDocumentRecord | undefined> {
  const prefs = loadPreferences();
  if (prefs.lastDocumentId) {
    const record = await loadDocumentRecord(prefs.lastDocumentId);
    if (record) return record;
  }
  const db = await getDb();
  const all = await db.getAll(STORE);
  if (!all.length) return undefined;
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
}

export async function clearDocumentRecord(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}

export function loadPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { splitRatio: 0.55 };
    const parsed = JSON.parse(raw) as AppPreferences;
    return {
      splitRatio: typeof parsed.splitRatio === 'number' ? parsed.splitRatio : 0.55,
      lastDocumentId: parsed.lastDocumentId,
    };
  } catch {
    return { splitRatio: 0.55 };
  }
}

export function savePreferences(prefs: AppPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}
