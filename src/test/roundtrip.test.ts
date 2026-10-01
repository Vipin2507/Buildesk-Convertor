import { describe, it, expect } from 'vitest';
import { createBlankDocument, createId, createParagraph, createText } from '../core/document-model/create';
import type { DocumentModel } from '../core/document-model/types';
import { modelToHtml, modelToEditorHtml } from '../core/converters/model-to-html';
import { htmlToModel } from '../core/converters/html-to-model';
import { modelToDocx } from '../core/converters/model-to-docx';
import { SyncEngine } from '../core/synchronization/sync-engine';
import { sanitizeHtml } from '../core/sanitization/sanitize';
import JSZip from 'jszip';

function sampleDocument(): DocumentModel {
  return {
    version: 1,
    metadata: {
      title: 'Round Trip Sample',
      source: 'blank',
      filename: 'sample.docx',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    },
    assets: [
      {
        id: 'asset-1',
        type: 'image',
        mimeType: 'image/png',
        // 1x1 PNG
        data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        width: 1,
        height: 1,
      },
    ],
    styles: {},
    relationships: [],
    unsupportedElements: [],
    blocks: [
      {
        type: 'heading',
        id: createId('h'),
        level: 1,
        children: [createText('Project Report')],
      },
      {
        type: 'heading',
        id: createId('h'),
        level: 2,
        children: [createText('Introduction')],
      },
      createParagraph([
        createText('This is a report with '),
        createText('bold', { bold: true }),
        createText(', '),
        createText('italic', { italic: true }),
        createText(', '),
        createText('underline', { underline: true }),
        createText(', and '),
        createText('colored', { textColor: '#00a0ff' }),
        createText(' text.'),
      ]),
      {
        type: 'bulletList',
        id: createId('ul'),
        items: [
          {
            type: 'listItem',
            id: createId('li'),
            children: [createParagraph([createText('Bullet one')])],
          },
          {
            type: 'listItem',
            id: createId('li'),
            children: [createParagraph([createText('Bullet two')])],
          },
        ],
      },
      {
        type: 'orderedList',
        id: createId('ol'),
        items: [
          {
            type: 'listItem',
            id: createId('li'),
            children: [createParagraph([createText('First')])],
          },
          {
            type: 'listItem',
            id: createId('li'),
            children: [createParagraph([createText('Second')])],
          },
        ],
      },
      {
        type: 'table',
        id: createId('table'),
        rows: [
          {
            type: 'tableRow',
            id: createId('tr'),
            cells: [
              {
                type: 'tableHeader',
                id: createId('th'),
                children: [createParagraph([createText('Name')])],
              },
              {
                type: 'tableHeader',
                id: createId('th'),
                children: [createParagraph([createText('Value')])],
              },
            ],
          },
          {
            type: 'tableRow',
            id: createId('tr'),
            cells: [
              {
                type: 'tableCell',
                id: createId('td'),
                children: [createParagraph([createText('Alpha')])],
              },
              {
                type: 'tableCell',
                id: createId('td'),
                children: [createParagraph([createText('100')])],
              },
            ],
          },
        ],
      },
      {
        type: 'paragraph',
        id: createId('p'),
        children: [
          {
            type: 'link',
            href: 'https://buildesk.in',
            children: [createText('Buildesk')],
          },
        ],
      },
      {
        type: 'image',
        id: createId('img'),
        assetId: 'asset-1',
        alt: 'pixel',
        width: 1,
        height: 1,
      },
      { type: 'pageBreak', id: createId('pb') },
      createParagraph([createText('After page break')]),
    ],
  };
}

describe('document model basics', () => {
  it('creates a blank document', () => {
    const doc = createBlankDocument('Test');
    expect(doc.version).toBe(1);
    expect(doc.blocks.length).toBe(1);
    expect(doc.metadata.title).toBe('Test');
  });
});

describe('HTML round trip', () => {
  it('model → HTML → model preserves text and structure', () => {
    const original = sampleDocument();
    const html = modelToHtml(original);
    expect(html).toContain('document-format');
    expect(html).toContain('Project Report');

    const parsed = htmlToModel(html);
    expect(parsed.usedRoundTripMeta).toBe(true);
    expect(parsed.document.metadata.title).toBe('Round Trip Sample');
    expect(parsed.document.blocks.some((b) => b.type === 'heading')).toBe(true);
    expect(parsed.document.blocks.some((b) => b.type === 'table')).toBe(true);
    expect(parsed.document.blocks.some((b) => b.type === 'pageBreak')).toBe(true);
  });

  it('parses semantic HTML without round-trip metadata', () => {
    const html = `
      <h1>Title</h1>
      <p>Hello <strong>world</strong></p>
      <ul><li>One</li><li>Two</li></ul>
    `;
    const parsed = htmlToModel(html, { title: 'External' });
    expect(parsed.usedRoundTripMeta).toBe(false);
    expect(parsed.document.blocks[0]).toMatchObject({ type: 'heading', level: 1 });
    const textBlocks = parsed.document.blocks.filter((b) => b.type === 'paragraph');
    expect(textBlocks.length).toBeGreaterThan(0);
  });

  it('editor body HTML round-trips basics', () => {
    const original = sampleDocument();
    const body = modelToEditorHtml(original);
    const parsed = htmlToModel(body, { title: original.metadata.title });
    expect(parsed.document.blocks.length).toBeGreaterThan(3);
  });
});

describe('DOCX export', () => {
  it('produces a valid OOXML zip with document.xml', async () => {
    const blob = await modelToDocx(sampleDocument());
    expect(blob.size).toBeGreaterThan(1000);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file('word/document.xml')).toBeTruthy();
    expect(zip.file('[Content_Types].xml')).toBeTruthy();
    const xml = await zip.file('word/document.xml')!.async('text');
    expect(xml).toContain('Project Report');
    expect(xml).toContain('After page break');
  });
});

describe('sanitization', () => {
  it('strips script tags', () => {
    const dirty = `<p>Hi</p><script>alert(1)</script><img src=x onerror=alert(1)>`;
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onerror');
  });
});

describe('sync engine', () => {
  it('prevents feedback loops', () => {
    const sync = new SyncEngine();
    sync.begin('USER_VISUAL_EDITOR');
    expect(sync.shouldPropagate('USER_VISUAL_EDITOR', 'visual')).toBe(false);
    expect(sync.shouldPropagate('USER_VISUAL_EDITOR', 'html')).toBe(true);

    sync.begin('USER_HTML_EDITOR');
    expect(sync.shouldPropagate('USER_HTML_EDITOR', 'html')).toBe(false);
    expect(sync.shouldPropagate('USER_HTML_EDITOR', 'visual')).toBe(true);
  });
});

describe('full round trip HTML → DOCX → structure', () => {
  it('exports DOCX from HTML-imported model', async () => {
    const html = modelToHtml(sampleDocument());
    const { document } = htmlToModel(html);
    const blob = await modelToDocx(document);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('text');
    expect(xml).toContain('Introduction');
    expect(xml.toLowerCase()).toContain('w:tbl');
  });
});
