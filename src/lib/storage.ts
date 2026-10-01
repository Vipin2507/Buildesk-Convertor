import { get, set, del, keys } from 'idb-keyval';
import type { Doc, RecentDoc } from '../types';

const DOC_PREFIX = 'bc-doc:';
const RECENTS_KEY = 'bc-recents';
const SPLIT_KEY = 'bc-split-ratio';

export async function saveDocToIdb(doc: Doc): Promise<void> {
  await set(`${DOC_PREFIX}${doc.id}`, doc);
  const recents = await loadRecents();
  const next: RecentDoc[] = [
    {
      id: doc.id,
      title: doc.title,
      updatedAt: doc.updatedAt,
      sourceFormat: doc.sourceFormat,
    },
    ...recents.filter((r) => r.id !== doc.id),
  ].slice(0, 5);
  await set(RECENTS_KEY, next);
}

export async function loadDocFromIdb(id: string): Promise<Doc | undefined> {
  return get(`${DOC_PREFIX}${id}`);
}

export async function deleteDocFromIdb(id: string): Promise<void> {
  await del(`${DOC_PREFIX}${id}`);
  const recents = await loadRecents();
  await set(
    RECENTS_KEY,
    recents.filter((r) => r.id !== id),
  );
}

export async function loadRecents(): Promise<RecentDoc[]> {
  const list = await get<RecentDoc[]>(RECENTS_KEY);
  return Array.isArray(list) ? list : [];
}

export async function listDocKeys(): Promise<string[]> {
  const all = await keys();
  return all
    .map(String)
    .filter((k) => k.startsWith(DOC_PREFIX))
    .map((k) => k.slice(DOC_PREFIX.length));
}

export function loadSplitRatio(): number {
  try {
    const raw = localStorage.getItem(SPLIT_KEY);
    const n = raw ? Number(raw) : 0.5;
    return Number.isFinite(n) && n > 0.2 && n < 0.8 ? n : 0.5;
  } catch {
    return 0.5;
  }
}

export function saveSplitRatio(ratio: number): void {
  try {
    localStorage.setItem(SPLIT_KEY, String(ratio));
  } catch {
    /* ignore */
  }
}
