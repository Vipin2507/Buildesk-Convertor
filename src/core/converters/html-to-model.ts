import type {
  Align,
  BlockNode,
  BlockStyle,
  CellBorder,
  CellBorders,
  DocumentAsset,
  DocumentModel,
  InlineNode,
  ListItemNode,
  TableCellNode,
  TextInline,
  TextMarks,
} from '../document-model/types';
import { createId, createDocumentFromParts } from '../document-model/create';
import { DOCUMENT_FORMAT, GENERATOR_NAME } from '../document-model/types';
import { isSafeUrl, sanitizeHtml } from '../sanitization/sanitize';

const STYLE_META_ID = 'document-metadata';

export interface HtmlParseResult {
  document: DocumentModel;
  warnings: string[];
  usedRoundTripMeta: boolean;
}

function parseAlign(value: string | null | undefined): Align | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v === 'left' || v === 'center' || v === 'right' || v === 'justify') return v;
  return undefined;
}

function parseStyleAlign(style: string | null): Align | undefined {
  if (!style) return undefined;
  const match = /text-align\s*:\s*(left|center|right|justify)/i.exec(style);
  return match ? parseAlign(match[1]) : undefined;
}

function styleProp(style: string | null | undefined, prop: string): string | undefined {
  if (!style) return undefined;
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
  return re.exec(style)?.[1]?.trim();
}

function parseBlockStyle(styleAttr: string | null): BlockStyle | undefined {
  if (!styleAttr) return undefined;
  const style: BlockStyle = {};
  const marginTop = styleProp(styleAttr, 'margin-top');
  const marginBottom = styleProp(styleAttr, 'margin-bottom');
  const lineHeight = styleProp(styleAttr, 'line-height');
  const fontSize = styleProp(styleAttr, 'font-size');
  const fontFamily = styleProp(styleAttr, 'font-family');
  const textColor = styleProp(styleAttr, 'color');
  const indentLeft = styleProp(styleAttr, 'padding-left') || styleProp(styleAttr, 'margin-left');
  const indentRight = styleProp(styleAttr, 'padding-right');
  const indentFirstLine = styleProp(styleAttr, 'text-indent');

  if (marginTop) style.marginTop = marginTop;
  if (marginBottom) style.marginBottom = marginBottom;
  if (lineHeight) {
    const num = Number(lineHeight);
    style.lineHeight = Number.isFinite(num) && !lineHeight.includes('px') && !lineHeight.includes('%')
      ? num
      : lineHeight;
  }
  if (fontSize) style.fontSize = fontSize;
  if (fontFamily) style.fontFamily = fontFamily.replace(/['"]/g, '').split(',')[0]?.trim();
  if (textColor) style.textColor = textColor;
  if (indentLeft) style.indentLeft = indentLeft;
  if (indentRight) style.indentRight = indentRight;
  if (indentFirstLine) style.indentFirstLine = indentFirstLine;

  return Object.keys(style).length ? style : undefined;
}

function parseBorderSide(style: string, side: string): CellBorder | undefined {
  const shorthand = styleProp(style, `border-${side}`);
  if (shorthand === 'none') return { style: 'none', width: '0', color: 'transparent' };
  if (shorthand) {
    const parts = shorthand.trim().split(/\s+/);
    return {
      width: parts.find((p) => /px|pt|em/.test(p)) || parts[0],
      style: parts.find((p) => /solid|dashed|dotted|double|none/.test(p)) || 'solid',
      color: parts.find((p) => p.startsWith('#') || p.startsWith('rgb')) || '#000',
    };
  }
  const width = styleProp(style, `border-${side}-width`);
  const bStyle = styleProp(style, `border-${side}-style`);
  const color = styleProp(style, `border-${side}-color`);
  if (!width && !bStyle && !color) return undefined;
  return { width, style: bStyle, color };
}

function parseCellBorders(style: string | null): CellBorders | undefined {
  if (!style) return undefined;
  const borders: CellBorders = {
    top: parseBorderSide(style, 'top'),
    right: parseBorderSide(style, 'right'),
    bottom: parseBorderSide(style, 'bottom'),
    left: parseBorderSide(style, 'left'),
  };
  if (!borders.top && !borders.right && !borders.bottom && !borders.left) return undefined;
  return borders;
}

function parseMarksFromElement(el: HTMLElement): TextMarks {
  const marks: TextMarks = {};
  const tag = el.tagName.toLowerCase();
  if (tag === 'strong' || tag === 'b') marks.bold = true;
  if (tag === 'em' || tag === 'i') marks.italic = true;
  if (tag === 'u') marks.underline = true;
  if (tag === 's' || tag === 'strike' || tag === 'del') marks.strike = true;
  if (tag === 'code') marks.code = true;

  const style = el.getAttribute('style') ?? '';
  const color = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();
  const bg =
    /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim() ??
    el.getAttribute('data-bg');
  const fontSize = /(?:^|;)\s*font-size\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();
  const fontFamily = /(?:^|;)\s*font-family\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();

  if (color && color !== 'inherit') marks.textColor = color;
  if (bg && bg !== 'transparent') marks.backgroundColor = bg;
  if (fontSize) marks.fontSize = fontSize;
  if (fontFamily) marks.fontFamily = fontFamily.replace(/['"]/g, '');

  if (el.classList.contains('hl') || el.hasAttribute('data-highlight')) {
    marks.backgroundColor = marks.backgroundColor ?? '#ffff00';
  }

  return marks;
}

function mergeMarks(a?: TextMarks, b?: TextMarks): TextMarks | undefined {
  if (!a && !b) return undefined;
  return { ...a, ...b };
}

function parseInlines(node: Node, inherited?: TextMarks): InlineNode[] {
  const result: InlineNode[] = [];

  const pushText = (text: string, marks?: TextMarks) => {
    if (!text) return;
    const last = result[result.length - 1];
    if (last?.type === 'text' && JSON.stringify(last.marks ?? null) === JSON.stringify(marks ?? null)) {
      last.text += text;
      return;
    }
    const inline: TextInline = marks ? { type: 'text', text, marks } : { type: 'text', text };
    result.push(inline);
  };

  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      pushText(child.textContent ?? '', inherited);
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      pushText('\n', inherited);
      return;
    }

    if (tag === 'a') {
      const href = el.getAttribute('href') ?? '';
      if (!isSafeUrl(href)) {
        result.push(...parseInlines(el, inherited));
        return;
      }
      const children = parseInlines(el, inherited).filter((n): n is TextInline => n.type === 'text');
      result.push({
        type: 'link',
        href,
        title: el.getAttribute('title') ?? undefined,
        children: children.length ? children : [{ type: 'text', text: href }],
      });
      return;
    }

    const local = mergeMarks(inherited, parseMarksFromElement(el));
    result.push(...parseInlines(el, local));
  });

  return result;
}

function ensureInlines(nodes: InlineNode[]): InlineNode[] {
  return nodes.length ? nodes : [{ type: 'text', text: '' }];
}

function extractAssetFromImg(
  img: HTMLImageElement,
  assets: DocumentAsset[],
): DocumentAsset | null {
  const src = img.getAttribute('src') ?? '';
  if (!src || (!src.startsWith('data:image/') && !src.startsWith('http'))) return null;

  const existing = assets.find((a) => a.data === src);
  if (existing) return existing;

  const mimeMatch = /^data:(image\/[a-zA-Z0-9.+-]+);/i.exec(src);
  const asset: DocumentAsset = {
    id: createId('asset'),
    type: 'image',
    mimeType: mimeMatch?.[1] ?? 'image/png',
    data: src,
    width: img.naturalWidth || Number(img.getAttribute('width')) || undefined,
    height: img.naturalHeight || Number(img.getAttribute('height')) || undefined,
    originalName: img.getAttribute('alt') ?? undefined,
  };
  assets.push(asset);
  return asset;
}

function parseBlocks(container: ParentNode, assets: DocumentAsset[]): BlockNode[] {
  const blocks: BlockNode[] = [];

  const parseListItems = (list: HTMLElement): ListItemNode[] => {
    return Array.from(list.children)
      .filter((c) => c.tagName.toLowerCase() === 'li')
      .map((li) => {
        const children = parseBlocks(li, assets);
        const normalized =
          children.length > 0
            ? children
            : [
                {
                  type: 'paragraph' as const,
                  id: createId('p'),
                  children: ensureInlines(parseInlines(li)),
                },
              ];
        return { type: 'listItem' as const, id: createId('li'), children: normalized };
      });
  };

  Array.from(container.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text) {
        blocks.push({
          type: 'paragraph',
          id: createId('p'),
          children: [{ type: 'text', text }],
        });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'script' && el.id === STYLE_META_ID) return;
    if (tag === 'style') return;

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]) as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({
        type: 'heading',
        id: createId('h'),
        level,
        align: parseAlign(el.getAttribute('align')) ?? parseStyleAlign(el.getAttribute('style')),
        style: parseBlockStyle(el.getAttribute('style')),
        children: ensureInlines(parseInlines(el)),
      });
      return;
    }

    if (tag === 'p' || tag === 'div') {
      if (el.getAttribute('data-type') === 'page-break' || el.classList.contains('page-break')) {
        blocks.push({ type: 'pageBreak', id: createId('pb') });
        return;
      }
      // Skip empty wrapper divs that only contain block children
      if (tag === 'div') {
        const hasBlockChild = Array.from(el.children).some((c) =>
          /^(p|h[1-6]|ul|ol|table|blockquote|hr|div)$/i.test(c.tagName),
        );
        if (hasBlockChild) {
          blocks.push(...parseBlocks(el, assets));
          return;
        }
      }
      blocks.push({
        type: 'paragraph',
        id: createId('p'),
        align: parseAlign(el.getAttribute('align')) ?? parseStyleAlign(el.getAttribute('style')),
        style: parseBlockStyle(el.getAttribute('style')),
        children: ensureInlines(parseInlines(el)),
      });
      return;
    }

    if (tag === 'ul') {
      blocks.push({
        type: 'bulletList',
        id: createId('ul'),
        items: parseListItems(el),
      });
      return;
    }

    if (tag === 'ol') {
      const start = Number(el.getAttribute('start') ?? '1');
      blocks.push({
        type: 'orderedList',
        id: createId('ol'),
        start: Number.isFinite(start) ? start : 1,
        items: parseListItems(el),
      });
      return;
    }

    if (tag === 'blockquote') {
      blocks.push({
        type: 'blockquote',
        id: createId('bq'),
        children: parseBlocks(el, assets),
      });
      return;
    }

    if (tag === 'hr') {
      if (el.classList.contains('page-break') || el.getAttribute('data-type') === 'page-break') {
        blocks.push({ type: 'pageBreak', id: createId('pb') });
      } else {
        blocks.push({ type: 'horizontalRule', id: createId('hr') });
      }
      return;
    }

    if (tag === 'img') {
      const asset = extractAssetFromImg(el as HTMLImageElement, assets);
      if (asset) {
        blocks.push({
          type: 'image',
          id: createId('img'),
          assetId: asset.id,
          alt: el.getAttribute('alt') ?? undefined,
          title: el.getAttribute('title') ?? undefined,
          width: asset.width,
          height: asset.height,
        });
      }
      return;
    }

    if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr'));
      const tableRows = rows.map((tr) => ({
        type: 'tableRow' as const,
        id: createId('tr'),
        cells: Array.from(tr.children)
          .filter((c) => {
            const t = c.tagName.toLowerCase();
            return t === 'td' || t === 'th';
          })
          .map((cell) => {
            const cellEl = cell as HTMLElement;
            const isHeader = cellEl.tagName.toLowerCase() === 'th';
            const style = cellEl.getAttribute('style') ?? '';
            const bg = styleProp(style, 'background-color') || styleProp(style, 'background');
            const width = styleProp(style, 'width');
            const padding = styleProp(style, 'padding');
            const vAlign = styleProp(style, 'vertical-align');
            const children = parseBlocks(cellEl, assets);
            const node: TableCellNode = {
              type: isHeader ? 'tableHeader' : 'tableCell',
              id: createId('td'),
              colspan: Number(cellEl.getAttribute('colspan') ?? 1) || 1,
              rowspan: Number(cellEl.getAttribute('rowspan') ?? 1) || 1,
              backgroundColor: bg?.trim(),
              width,
              padding,
              verticalAlign:
                vAlign === 'middle' || vAlign === 'top' || vAlign === 'bottom'
                  ? vAlign
                  : undefined,
              borders: parseCellBorders(style),
              children:
                children.length > 0
                  ? children
                  : [
                      {
                        type: 'paragraph',
                        id: createId('p'),
                        children: ensureInlines(parseInlines(cellEl)),
                      },
                    ],
            };
            return node;
          }),
      }));
      blocks.push({ type: 'table', id: createId('table'), rows: tableRows });
      return;
    }

    // Fallback: flatten unknown wrappers
    blocks.push(...parseBlocks(el, assets));
  });

  return blocks;
}

function tryParseRoundTripMeta(doc: Document): Record<string, unknown> | null {
  const el = doc.getElementById(STYLE_META_ID);
  if (!el?.textContent) return null;
  try {
    const parsed = JSON.parse(el.textContent) as Record<string, unknown>;
    if (parsed && parsed.format === DOCUMENT_FORMAT) return parsed;
  } catch {
    return null;
  }
  return null;
}

export function htmlToModel(
  html: string,
  options?: { filename?: string; title?: string },
): HtmlParseResult {
  const warnings: string[] = [];

  // Read round-trip metadata before sanitization (scripts are stripped for safety).
  const preParser = new DOMParser();
  const preWrapped = html.includes('<html')
    ? html
    : `<!DOCTYPE html><html><body>${html}</body></html>`;
  const preDom = preParser.parseFromString(preWrapped, 'text/html');
  const roundTrip = tryParseRoundTripMeta(preDom);

  if (roundTrip?.model && typeof roundTrip.model === 'object') {
    const model = roundTrip.model as DocumentModel;
    if (model.version === 1 && Array.isArray(model.blocks)) {
      return {
        document: {
          ...model,
          metadata: {
            ...model.metadata,
            source: 'restored',
            filename: options?.filename ?? model.metadata.filename,
            modifiedAt: new Date().toISOString(),
          },
        },
        warnings: ['Document restored from Buildesk Convertor round-trip metadata.'],
        usedRoundTripMeta: true,
      };
    }
  }

  const sanitized = sanitizeHtml(html);
  const parser = new DOMParser();
  const wrapped = sanitized.includes('<html')
    ? sanitized
    : `<!DOCTYPE html><html><body>${sanitized}</body></html>`;
  const dom = parser.parseFromString(wrapped, 'text/html');

  const parseError = dom.querySelector('parsererror');
  if (parseError) {
    throw new Error('HTML_PARSE_ERROR');
  }

  const assets: DocumentAsset[] = [];

  const title =
    options?.title ??
    dom.querySelector('title')?.textContent?.trim() ??
    options?.filename?.replace(/\.(html?|htm)$/i, '') ??
    'Imported Document';

  const body = dom.body;
  const blocks = parseBlocks(body, assets);

  // Detect unsupported constructs
  if (dom.querySelectorAll('iframe, video, audio, canvas, svg').length > 0) {
    warnings.push('Some advanced HTML features cannot be represented exactly in DOCX.');
  }

  const document = createDocumentFromParts({
    metadata: {
      title,
      source: 'html',
      filename: options?.filename ?? `${title}.html`,
      creator: GENERATOR_NAME,
    },
    blocks,
    assets,
    unsupportedElements: warnings.map((w) => ({ kind: 'html-warning', detail: w })),
  });

  return { document, warnings, usedRoundTripMeta: false };
}

export function isHtmlValidEnough(html: string): { valid: boolean; message?: string } {
  try {
    const sanitized = sanitizeHtml(html);
    const parser = new DOMParser();
    const wrapped = sanitized.includes('<html')
      ? sanitized
      : `<!DOCTYPE html><html><body>${sanitized}</body></html>`;
    const dom = parser.parseFromString(wrapped, 'text/html');
    if (dom.querySelector('parsererror')) {
      return { valid: false, message: 'The HTML contains syntax errors.' };
    }
    // Basic tag balance heuristic for fragments being typed
    const open = (html.match(/<(?!\/|!|br|hr|img|meta|link|input|col)([a-zA-Z][\w:-]*)/g) ?? []).length;
    const close = (html.match(/<\/[a-zA-Z]/g) ?? []).length;
    if (open - close > 8) {
      return { valid: false, message: 'The HTML appears incomplete.' };
    }
    return { valid: true };
  } catch {
    return { valid: false, message: 'Unable to parse HTML.' };
  }
}
