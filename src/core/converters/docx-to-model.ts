import JSZip from 'jszip';
import type { DocumentModel, UnsupportedElement } from '../document-model/types';
import { ooxmlToModel } from './ooxml-to-model';

const MAX_DOCX_BYTES = 25 * 1024 * 1024;

export interface DocxImportResult {
  document: DocumentModel;
  warnings: string[];
  /** Original DOCX bytes for Word-accurate visual rendering */
  originalBytes: ArrayBuffer;
  progressMessage?: string;
}

export function validateDocxFile(file: File): { ok: true } | { ok: false; message: string } {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.docx')) {
    return { ok: false, message: 'Unsupported file type. Please upload a .docx file.' };
  }
  if (file.size === 0) {
    return { ok: false, message: 'The file is empty.' };
  }
  if (file.size > MAX_DOCX_BYTES) {
    return { ok: false, message: 'This file is too large. Maximum size is 25 MB.' };
  }
  return { ok: true };
}

async function extractDocxCoreMetadata(arrayBuffer: ArrayBuffer): Promise<Record<string, unknown>> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const coreXml = await zip.file('docProps/core.xml')?.async('text');
    if (!coreXml) return {};

    const parser = new DOMParser();
    const xml = parser.parseFromString(coreXml, 'application/xml');
    const get = (local: string) =>
      xml.getElementsByTagNameNS('*', local)[0]?.textContent?.trim() || undefined;

    return {
      title: get('title'),
      creator: get('creator'),
      subject: get('subject'),
      description: get('description'),
      lastModifiedBy: get('lastModifiedBy'),
      created: get('created'),
      modified: get('modified'),
    };
  } catch {
    return {};
  }
}

async function detectUnsupportedDocxFeatures(
  arrayBuffer: ArrayBuffer,
): Promise<UnsupportedElement[]> {
  const unsupported: UnsupportedElement[] = [];
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXml = await zip.file('word/document.xml')?.async('text');
    if (!documentXml) return unsupported;

    const checks: Array<[RegExp, string, string]> = [
      [/<w:drawing[\s>]/i, 'drawing', 'Complex drawings/SmartArt may be simplified.'],
      [/<w:txbxContent[\s>]/i, 'textbox', 'Text boxes are flattened into the document flow.'],
      [/<w:footnoteReference[\s>]/i, 'footnote', 'Footnotes are not fully preserved.'],
      [/<w:endnoteReference[\s>]/i, 'endnote', 'Endnotes are not fully preserved.'],
      [/<w:commentRangeStart[\s>]/i, 'comment', 'Comments are not preserved in the editor.'],
      [/<w:hdr[\s>]|<w:headerReference[\s>]/i, 'header', 'Headers may not appear in the visual editor.'],
      [/<w:ftr[\s>]|<w:footerReference[\s>]/i, 'footer', 'Footers may not appear in the visual editor.'],
      [/<w:object[\s>]/i, 'ole-object', 'Embedded OLE objects are not supported.'],
    ];

    for (const [re, kind, detail] of checks) {
      if (re.test(documentXml)) {
        unsupported.push({ kind, detail });
      }
    }
  } catch {
    // ignore detection failures
  }
  return unsupported;
}

export async function docxToModel(
  file: File,
  onProgress?: (message: string) => void,
): Promise<DocxImportResult> {
  const validation = validateDocxFile(file);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  onProgress?.('Reading document...');
  const arrayBuffer = await file.arrayBuffer();

  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    if (!zip.file('word/document.xml')) {
      throw new Error('CORRUPT_DOCX');
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'CORRUPT_DOCX') {
      throw new Error(
        "We couldn't read this document. The file may be corrupted or incomplete.",
      );
    }
    throw new Error(
      "We couldn't read this document. The file may be corrupted or incomplete.",
    );
  }

  onProgress?.('Extracting formatting...');
  const [coreMeta, unsupported] = await Promise.all([
    extractDocxCoreMetadata(arrayBuffer),
    detectUnsupportedDocxFeatures(arrayBuffer),
  ]);

  onProgress?.('Preserving fonts, spacing & tables...');
  const parsed = await ooxmlToModel(arrayBuffer, {
    filename: file.name,
    title:
      (typeof coreMeta.title === 'string' && coreMeta.title)
      || file.name.replace(/\.docx$/i, '')
      || 'Imported Document',
  });

  onProgress?.('Preparing editor...');

  const title =
    (typeof coreMeta.title === 'string' && coreMeta.title)
    || file.name.replace(/\.docx$/i, '')
    || 'Imported Document';

  const document: DocumentModel = {
    ...parsed.document,
    metadata: {
      ...parsed.document.metadata,
      source: 'docx',
      title,
      author: typeof coreMeta.creator === 'string' ? coreMeta.creator : undefined,
      subject: typeof coreMeta.subject === 'string' ? coreMeta.subject : undefined,
      creator: typeof coreMeta.creator === 'string' ? coreMeta.creator : undefined,
      createdAt:
        typeof coreMeta.created === 'string'
          ? coreMeta.created
          : parsed.document.metadata.createdAt,
      modifiedAt: new Date().toISOString(),
      filename: file.name,
    },
    originalDocxMetadata: coreMeta,
    unsupportedElements: [
      ...parsed.document.unsupportedElements,
      ...unsupported,
    ],
  };

  const warnings = [
    ...parsed.warnings,
    ...unsupported.map((u) => u.detail).filter(Boolean) as string[],
  ];

  if (unsupported.length > 0) {
    warnings.push(
      'Some advanced Word formatting may not be fully preserved during conversion.',
    );
  }

  return {
    document,
    originalBytes: arrayBuffer,
    warnings: [...new Set(warnings.filter(Boolean))],
  };
}
