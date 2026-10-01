/**
 * API adapter — wraps existing local conversion services.
 * Repo has no HTTP backend; contracts map to file-service / converters.
 */
import type { DocumentModel } from '../core/document-model/types';
import { modelToHtml, modelToEditorHtml } from '../core/converters/model-to-html';
import { detectExactHtml } from '../core/converters/exact-html';
import {
  importDocxFile,
  importHtmlFile,
  exportDocx,
  exportHtml,
  copyHtmlToClipboard,
  validateDocxFile,
  validateHtmlFile,
} from '../services/file-service';
import { arrayBufferToBase64 } from '../utils/binary';
import type { ApiError, Doc } from '../types';
import { createId } from './utils';
import { countWords } from '../core/document-model/create';
import { htmlToModel } from '../core/converters/html-to-model';

export function toApiError(err: unknown, code = 'UNKNOWN'): ApiError {
  const message = err instanceof Error ? err.message : 'Something went wrong.';
  return { code, message, retryable: true };
}

function countPagesFromExactHtml(html: string): number {
  const matches = html.match(/<section\b[^>]*class=["'][^"']*docx-exact/gi);
  return matches?.length || 1;
}

function estimatePages(words: number): number {
  return Math.max(1, Math.ceil(words / 300));
}

export async function convertDocxToHtml(
  file: File,
  onProgress?: (pct: number, message: string) => void,
): Promise<{
  exactHtml: string;
  editableHtml: string;
  editorBodyHtml: string;
  meta: { pageCount: number; wordCount: number; title: string };
  originalDocxBase64: string;
  model: DocumentModel;
}> {
  const validation = validateDocxFile(file);
  if (!validation.ok) throw new Error(validation.message);

  onProgress?.(10, 'Reading DOCX…');
  onProgress?.(35, 'Parsing document…');
  const imported = await importDocxFile(file, (msg) => onProgress?.(55, msg));
  const model = imported.document;
  const originalDocxBase64 = arrayBufferToBase64(imported.originalBytes);

  onProgress?.(80, 'Building HTML…');
  const editableHtml = modelToHtml(model);
  const editorBodyHtml = modelToEditorHtml(model);
  const wordCount = countWords(model);
  const title = model.metadata.title || file.name.replace(/\.docx$/i, '');

  const exactHtml = editableHtml;
  const pageCount = estimatePages(wordCount);

  onProgress?.(100, 'Done');
  return {
    exactHtml,
    editableHtml,
    editorBodyHtml,
    meta: { pageCount, wordCount, title },
    originalDocxBase64,
    model,
  };
}

export async function convertHtmlFile(file: File): Promise<{
  exactHtml: string;
  editableHtml: string;
  editorBodyHtml: string;
  meta: { pageCount: number; wordCount: number; title: string };
  model: DocumentModel;
  isExact: boolean;
  originalDocxBase64?: string;
}> {
  const validation = validateHtmlFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const text = await file.text();
  const detected = detectExactHtml(text);
  const { document: model } = await importHtmlFile(file);
  const editableHtml = modelToHtml(model);
  const editorBodyHtml = modelToEditorHtml(model);
  const wordCount = countWords(model);
  const title = model.metadata.title || file.name.replace(/\.html?$/i, '');

  if (detected.isExact) {
    return {
      exactHtml: text,
      editableHtml,
      editorBodyHtml,
      meta: {
        pageCount: detected.meta?.pageCount || countPagesFromExactHtml(text),
        wordCount,
        title: detected.meta?.title || title,
      },
      model,
      isExact: true,
      originalDocxBase64: detected.meta?.originalDocxBase64,
    };
  }

  return {
    exactHtml: editableHtml,
    editableHtml,
    editorBodyHtml,
    meta: { pageCount: estimatePages(wordCount), wordCount, title },
    model,
    isExact: false,
  };
}

export async function htmlToDocxBlob(html: string, title: string): Promise<Blob> {
  const { document: model } = htmlToModel(html, { filename: `${title}.html` });
  const { modelToDocx } = await import('../core/converters/model-to-docx');
  return modelToDocx(model);
}

export async function downloadDocxFromModel(model: DocumentModel): Promise<void> {
  await exportDocx(model);
}

export function downloadHtmlFile(html: string, title: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const { saveAs } = requireFileSaver();
  saveAs(blob, `${title || 'document'}.html`);
}

function requireFileSaver() {
  // reuse package already in deps
  return { saveAs: (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  } };
}

export { exportHtml, copyHtmlToClipboard, validateDocxFile, validateHtmlFile };

export function createBlankDoc(): Doc {
  const now = new Date().toISOString();
  return {
    id: createId(),
    title: 'Untitled document',
    sourceFormat: 'blank',
    exactHtml: '<p></p>',
    editableHtml: '<!DOCTYPE html><html><body><p></p></body></html>',
    editorBodyHtml: '<p></p>',
    pageCount: 1,
    approxPages: 1,
    wordCount: 0,
    htmlValid: true,
    saveState: 'saved',
    syncState: navigator.onLine ? 'synced' : 'offline',
    updatedAt: now,
    version: 1,
  };
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
