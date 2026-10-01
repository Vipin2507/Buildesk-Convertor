import { saveAs } from 'file-saver';
import type { DocumentModel } from '../core/document-model/types';
import { modelToDocx } from '../core/converters/model-to-docx';
import { modelToHtml } from '../core/converters/model-to-html';
import { docxToModel, validateDocxFile } from '../core/converters/docx-to-model';
import { htmlToModel } from '../core/converters/html-to-model';

const MAX_HTML_BYTES = 15 * 1024 * 1024;

export function validateHtmlFile(file: File): { ok: true } | { ok: false; message: string } {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.html') && !name.endsWith('.htm')) {
    return { ok: false, message: 'Unsupported file type. Please upload a .html or .htm file.' };
  }
  if (file.size === 0) {
    return { ok: false, message: 'The file is empty.' };
  }
  if (file.size > MAX_HTML_BYTES) {
    return { ok: false, message: 'This file is too large. Maximum size is 15 MB.' };
  }
  return { ok: true };
}

export async function importDocxFile(
  file: File,
  onProgress?: (message: string) => void,
) {
  onProgress?.('Uploading...');
  return docxToModel(file, onProgress);
}

export async function importHtmlFile(file: File) {
  const validation = validateHtmlFile(file);
  if (!validation.ok) throw new Error(validation.message);
  const text = await file.text();
  return htmlToModel(text, { filename: file.name });
}

export async function exportDocx(
  doc: DocumentModel,
  onProgress?: (message: string) => void,
): Promise<void> {
  try {
    onProgress?.('Preparing DOCX...');
    const blob = await modelToDocx(doc);
    onProgress?.('Downloading...');
    const name = (doc.metadata.filename || doc.metadata.title || 'document').replace(
      /\.(docx|html?|htm)$/i,
      '',
    );
    saveAs(blob, `${name}.docx`);
  } catch (err) {
    console.error(err);
    throw new Error("We couldn't generate the DOCX. Your document is still safe.");
  }
}

export function exportHtml(doc: DocumentModel, htmlOverride?: string): void {
  const html = htmlOverride && htmlOverride.trim() ? htmlOverride : modelToHtml(doc);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const name = (doc.metadata.filename || doc.metadata.title || 'document').replace(
    /\.(docx|html?|htm)$/i,
    '',
  );
  saveAs(blob, `${name}.html`);
}

export async function copyHtmlToClipboard(html: string): Promise<void> {
  await navigator.clipboard.writeText(html);
}

export { validateDocxFile };
