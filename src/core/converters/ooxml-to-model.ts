/**
 * High-fidelity OOXML → DocumentModel converter.
 * Parses word/document.xml + styles.xml so fonts, spacing, and table
 * colors survive import (Mammoth alone strips most of this).
 */

import JSZip from 'jszip';
import type {
  Align,
  BlockNode,
  BlockStyle,
  CellBorder,
  CellBorders,
  DocumentAsset,
  DocumentDefaults,
  DocumentModel,
  InlineNode,
  ListItemNode,
  ParagraphBlock,
  TableBlock,
  TableCellNode,
  TableRowNode,
  TextMarks,
  UnsupportedElement,
} from '../document-model/types';
import { createId, createDocumentFromParts } from '../document-model/create';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

interface StyleDef {
  type?: string;
  basedOn?: string;
  name?: string;
  paragraph?: BlockStyle & { align?: Align };
  run?: TextMarks;
}

interface ParsedStyles {
  defaults: DocumentDefaults;
  byId: Map<string, StyleDef>;
}

interface RelMap {
  [id: string]: { target: string; type: string };
}

function q(el: Element | Document | null | undefined, local: string, ns = W_NS): Element | null {
  if (!el) return null;
  return (el as Element).getElementsByTagNameNS?.(ns, local)[0]
    ?? (el as Document).getElementsByTagNameNS?.(ns, local)[0]
    ?? null;
}

function qa(el: Element | Document | null | undefined, local: string, ns = W_NS): Element[] {
  if (!el) return [];
  return Array.from(
    (el as Element).getElementsByTagNameNS?.(ns, local)
      ?? (el as Document).getElementsByTagNameNS?.(ns, local)
      ?? [],
  );
}

function attr(el: Element | null | undefined, local: string, ns = W_NS): string | undefined {
  if (!el) return undefined;
  return (
    el.getAttributeNS(ns, local)
    ?? el.getAttribute(`w:${local}`)
    ?? el.getAttribute(local)
    ?? undefined
  );
}

/** Twips (1/20 pt) → CSS px (96dpi). */
function twipsToPx(twips: number): string {
  const px = (twips / 20) * (96 / 72);
  return `${Math.round(px * 100) / 100}px`;
}

/** Half-points → CSS pt (Word uses half-points for font size). */
function halfPointsToPt(halfPts: number): string {
  return `${halfPts / 2}pt`;
}

function hexColor(val?: string): string | undefined {
  if (!val) return undefined;
  const v = val.trim();
  if (!v || v.toLowerCase() === 'auto') return undefined;
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toUpperCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase()}`;
  }
  return undefined;
}

/** Office theme accent fallbacks when theme1.xml is missing/unreadable. */
const THEME_FALLBACKS: Record<string, string> = {
  dark1: '#000000',
  light1: '#FFFFFF',
  dark2: '#1F497D',
  light2: '#EEECE1',
  accent1: '#4F81BD',
  accent2: '#C0504D',
  accent3: '#9BBB59',
  accent4: '#8064A2',
  accent5: '#4BACC6',
  accent6: '#F79646',
  hyperlink: '#0000FF',
  followedHyperlink: '#800080',
};

function applyShadeTint(hex: string, shade?: string, tint?: string): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return hex;
  let r = parseInt(raw.slice(0, 2), 16);
  let g = parseInt(raw.slice(2, 4), 16);
  let b = parseInt(raw.slice(4, 6), 16);
  const factor = (val?: string) => {
    if (!val) return null;
    // themeFillShade/Tint are hex 00-FF meaning 0-100%
    return parseInt(val, 16) / 255;
  };
  const s = factor(shade);
  const t = factor(tint);
  if (s !== null && Number.isFinite(s)) {
    r = Math.round(r * s);
    g = Math.round(g * s);
    b = Math.round(b * s);
  } else if (t !== null && Number.isFinite(t)) {
    r = Math.round(r + (255 - r) * t);
    g = Math.round(g + (255 - g) * t);
    b = Math.round(b + (255 - b) * t);
  }
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function resolveShdColor(shd: Element | null, themeColors: Record<string, string>): string | undefined {
  if (!shd) return undefined;
  const fill = hexColor(attr(shd, 'fill'));
  if (fill) return fill;
  const themeFill = attr(shd, 'themeFill');
  if (themeFill) {
    const base =
      themeColors[themeFill.toLowerCase()]
      || THEME_FALLBACKS[themeFill.toLowerCase()];
    if (base) {
      return applyShadeTint(base, attr(shd, 'themeFillShade'), attr(shd, 'themeFillTint'));
    }
  }
  return undefined;
}

function parseThemeColors(themeXml: string): Record<string, string> {
  const map: Record<string, string> = { ...THEME_FALLBACKS };
  try {
    const doc = new DOMParser().parseFromString(themeXml, 'application/xml');
    const clrScheme = doc.getElementsByTagNameNS(
      'http://schemas.openxmlformats.org/drawingml/2006/main',
      'clrScheme',
    )[0];
    if (!clrScheme) return map;
    for (const child of Array.from(clrScheme.children)) {
      const name = child.localName?.toLowerCase();
      if (!name) continue;
      const srgb =
        child.getElementsByTagNameNS(
          'http://schemas.openxmlformats.org/drawingml/2006/main',
          'srgbClr',
        )[0]?.getAttribute('val')
        || child.getElementsByTagName('a:srgbClr')[0]?.getAttribute('val');
      const sys =
        child.getElementsByTagNameNS(
          'http://schemas.openxmlformats.org/drawingml/2006/main',
          'sysClr',
        )[0]?.getAttribute('lastClr');
      const hex = hexColor(srgb || sys || undefined);
      if (hex) map[name] = hex;
    }
  } catch {
    // keep fallbacks
  }
  return map;
}

function borderWidthFromSz(sz?: string): string | undefined {
  if (!sz) return undefined;
  // Word border sz is in eighths of a point
  const eighths = Number(sz);
  if (!Number.isFinite(eighths) || eighths <= 0) return '0';
  const px = (eighths / 8) * (96 / 72);
  return `${Math.max(0.5, Math.round(px * 100) / 100)}px`;
}

function mapBorderStyle(val?: string): string {
  switch ((val || '').toLowerCase()) {
    case 'nil':
    case 'none':
      return 'none';
    case 'dashed':
    case 'dashSmallGap':
      return 'dashed';
    case 'dotted':
      return 'dotted';
    case 'double':
      return 'double';
    default:
      return 'solid';
  }
}

function parseCellBorder(el: Element | null): CellBorder | undefined {
  if (!el) return undefined;
  const val = attr(el, 'val');
  if (val === 'nil' || val === 'none') {
    return { style: 'none', width: '0', color: 'transparent' };
  }
  return {
    style: mapBorderStyle(val),
    width: borderWidthFromSz(attr(el, 'sz')) ?? '1px',
    color: hexColor(attr(el, 'color')) ?? '#000000',
  };
}

function parseRunMarks(rPr: Element | null, inherited?: TextMarks): TextMarks {
  const themeColors = currentThemeColors;
  const marks: TextMarks = { ...inherited };
  if (!rPr) return marks;

  if (q(rPr, 'b') || q(rPr, 'bCs')) marks.bold = true;
  if (q(rPr, 'i') || q(rPr, 'iCs')) marks.italic = true;
  const u = q(rPr, 'u');
  if (u && attr(u, 'val') !== 'none') marks.underline = true;
  if (q(rPr, 'strike') || q(rPr, 'dstrike')) marks.strike = true;

  const color = q(rPr, 'color');
  const themeColorName = attr(color, 'themeColor');
  const colorVal =
    hexColor(attr(color, 'val'))
    || (themeColorName
      ? themeColors[themeColorName.toLowerCase()]
        || THEME_FALLBACKS[themeColorName.toLowerCase()]
      : undefined);
  if (colorVal) marks.textColor = colorVal;

  const highlight = q(rPr, 'highlight');
  const hl = attr(highlight, 'val');
  if (hl && hl !== 'none') {
    const map: Record<string, string> = {
      yellow: '#FFFF00',
      green: '#00FF00',
      cyan: '#00FFFF',
      magenta: '#FF00FF',
      blue: '#0000FF',
      red: '#FF0000',
      darkBlue: '#00008B',
      darkCyan: '#008B8B',
      darkGreen: '#006400',
      darkMagenta: '#8B008B',
      darkRed: '#8B0000',
      darkYellow: '#808000',
      darkGray: '#A9A9A9',
      lightGray: '#D3D3D3',
      black: '#000000',
      white: '#FFFFFF',
    };
    marks.backgroundColor = map[hl] ?? `#${hl}`;
  }

  const shd = q(rPr, 'shd');
  const fill = resolveShdColor(shd, themeColors);
  if (fill) marks.backgroundColor = fill;

  const sz = q(rPr, 'sz') || q(rPr, 'szCs');
  const szVal = attr(sz, 'val');
  if (szVal) marks.fontSize = halfPointsToPt(Number(szVal));

  const fonts = q(rPr, 'rFonts');
  const font =
    attr(fonts, 'ascii')
    || attr(fonts, 'hAnsi')
    || attr(fonts, 'cs')
    || attr(fonts, 'eastAsia');
  if (font) marks.fontFamily = font;

  return marks;
}

function parseParagraphStyle(pPr: Element | null, inherited?: BlockStyle & { align?: Align }): BlockStyle & { align?: Align } {
  const style: BlockStyle & { align?: Align } = { ...inherited };
  if (!pPr) return style;

  const jc = q(pPr, 'jc');
  const alignVal = attr(jc, 'val');
  if (alignVal === 'left' || alignVal === 'start') style.align = 'left';
  else if (alignVal === 'center') style.align = 'center';
  else if (alignVal === 'right' || alignVal === 'end') style.align = 'right';
  else if (alignVal === 'both' || alignVal === 'distribute') style.align = 'justify';

  const spacing = q(pPr, 'spacing');
  if (spacing) {
    const before = attr(spacing, 'before');
    const after = attr(spacing, 'after');
    const line = attr(spacing, 'line');
    const lineRule = attr(spacing, 'lineRule');
    if (before) style.marginTop = twipsToPx(Number(before));
    if (after) style.marginBottom = twipsToPx(Number(after));
    if (line) {
      const lineNum = Number(line);
      if (lineRule === 'auto') {
        // 240 = single spacing
        style.lineHeight = Math.round((lineNum / 240) * 100) / 100;
      } else {
        style.lineHeight = twipsToPx(lineNum);
      }
    }
  }

  const ind = q(pPr, 'ind');
  if (ind) {
    const left = attr(ind, 'left') || attr(ind, 'start');
    const right = attr(ind, 'right') || attr(ind, 'end');
    const first = attr(ind, 'firstLine');
    const hanging = attr(ind, 'hanging');
    if (left) style.indentLeft = twipsToPx(Number(left));
    if (right) style.indentRight = twipsToPx(Number(right));
    if (first) style.indentFirstLine = twipsToPx(Number(first));
    if (hanging) style.indentFirstLine = `-${twipsToPx(Number(hanging))}`;
  }

  const rPr = q(pPr, 'rPr');
  if (rPr) {
    const run = parseRunMarks(rPr);
    if (run.fontSize) style.fontSize = run.fontSize;
    if (run.fontFamily) style.fontFamily = run.fontFamily;
    if (run.textColor) style.textColor = run.textColor;
  }

  return style;
}

function resolveStyle(
  styles: ParsedStyles,
  styleId: string | undefined,
): { paragraph?: BlockStyle & { align?: Align }; run?: TextMarks } {
  if (!styleId) return {};
  const seen = new Set<string>();
  const stack: StyleDef[] = [];
  let current: string | undefined = styleId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const def = styles.byId.get(current);
    if (!def) break;
    stack.unshift(def);
    current = def.basedOn;
  }

  let paragraph: BlockStyle & { align?: Align } = {};
  let run: TextMarks = {};
  for (const def of stack) {
    paragraph = { ...paragraph, ...def.paragraph };
    run = { ...run, ...def.run };
  }
  return { paragraph, run };
}

function parseStylesXml(xml: string): ParsedStyles {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const byId = new Map<string, StyleDef>();
  const defaults: DocumentDefaults = {
    fontFamily: 'Times New Roman',
    fontSize: '11pt',
    lineHeight: 1.15,
    textColor: '#000000',
  };

  const docDefaults = q(doc, 'docDefaults');
  if (docDefaults) {
    const rPrDefault = q(q(docDefaults, 'rPrDefault') ?? docDefaults, 'rPr');
    const run = parseRunMarks(rPrDefault);
    if (run.fontFamily) defaults.fontFamily = run.fontFamily;
    if (run.fontSize) defaults.fontSize = run.fontSize;
    if (run.textColor) defaults.textColor = run.textColor;

    const pPrDefault = q(q(docDefaults, 'pPrDefault') ?? docDefaults, 'pPr');
    const pStyle = parseParagraphStyle(pPrDefault);
    if (pStyle.lineHeight !== undefined) defaults.lineHeight = pStyle.lineHeight;
  }

  for (const styleEl of qa(doc, 'style')) {
    const id = attr(styleEl, 'styleId');
    if (!id) continue;
    const type = attr(styleEl, 'type');
    const basedOn = attr(q(styleEl, 'basedOn'), 'val');
    const name = attr(q(styleEl, 'name'), 'val');
    const paragraph = parseParagraphStyle(q(styleEl, 'pPr'));
    const run = parseRunMarks(q(styleEl, 'rPr'));
    byId.set(id, { type, basedOn, name, paragraph, run });
  }

  return { defaults, byId };
}

function parseRelationships(xml: string): RelMap {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const map: RelMap = {};
  const rels = Array.from(doc.getElementsByTagName('Relationship'));
  for (const rel of rels) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    const type = rel.getAttribute('Type') || '';
    if (id && target) map[id] = { target, type };
  }
  return map;
}

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.emf') || lower.endsWith('.wmf')) return 'image/x-emf';
  return 'application/octet-stream';
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadImageAsset(
  zip: JSZip,
  relTarget: string,
  assets: DocumentAsset[],
): Promise<DocumentAsset | null> {
  const path = relTarget.startsWith('/')
    ? relTarget.slice(1)
    : `word/${relTarget.replace(/^\.\.\//, '')}`;
  const normalized = path.replace(/\\/g, '/');
  const file =
    zip.file(normalized)
    || zip.file(normalized.replace(/^word\//, ''))
    || zip.file(`word/${relTarget.split('/').pop()}`);
  if (!file) return null;

  const bytes = await file.async('uint8array');
  const mime = mimeFromPath(normalized);
  if (!mime.startsWith('image/') || mime.includes('emf') || mime.includes('wmf')) {
    return null;
  }
  const data = `data:${mime};base64,${uint8ToBase64(bytes)}`;
  const existing = assets.find((a) => a.data === data);
  if (existing) return existing;
  const asset: DocumentAsset = {
    id: createId('asset'),
    type: 'image',
    mimeType: mime,
    data,
    originalName: normalized.split('/').pop(),
  };
  assets.push(asset);
  return asset;
}

function headingLevelFromStyle(styleId?: string, styleName?: string): 1 | 2 | 3 | 4 | 5 | 6 | null {
  const raw = `${styleId || ''} ${styleName || ''}`.toLowerCase();
  if (/heading\s*1|heading1|^title$/.test(raw)) return 1;
  if (/heading\s*2|heading2|subtitle/.test(raw)) return 2;
  if (/heading\s*3|heading3/.test(raw)) return 3;
  if (/heading\s*4|heading4/.test(raw)) return 4;
  if (/heading\s*5|heading5/.test(raw)) return 5;
  if (/heading\s*6|heading6/.test(raw)) return 6;
  return null;
}

function compactMarks(marks: TextMarks): TextMarks | undefined {
  const cleaned: TextMarks = {};
  if (marks.bold) cleaned.bold = true;
  if (marks.italic) cleaned.italic = true;
  if (marks.underline) cleaned.underline = true;
  if (marks.strike) cleaned.strike = true;
  if (marks.code) cleaned.code = true;
  if (marks.textColor) cleaned.textColor = marks.textColor;
  if (marks.backgroundColor) cleaned.backgroundColor = marks.backgroundColor;
  if (marks.fontSize) cleaned.fontSize = marks.fontSize;
  if (marks.fontFamily) cleaned.fontFamily = marks.fontFamily;
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function compactStyle(style: BlockStyle): BlockStyle | undefined {
  const cleaned: BlockStyle = {};
  if (style.marginTop) cleaned.marginTop = style.marginTop;
  if (style.marginBottom) cleaned.marginBottom = style.marginBottom;
  if (style.lineHeight !== undefined) cleaned.lineHeight = style.lineHeight;
  if (style.fontSize) cleaned.fontSize = style.fontSize;
  if (style.fontFamily) cleaned.fontFamily = style.fontFamily;
  if (style.textColor) cleaned.textColor = style.textColor;
  if (style.indentLeft) cleaned.indentLeft = style.indentLeft;
  if (style.indentRight) cleaned.indentRight = style.indentRight;
  if (style.indentFirstLine) cleaned.indentFirstLine = style.indentFirstLine;
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function parseHyperlink(
  el: Element,
  rels: RelMap,
  inheritedRun: TextMarks,
): InlineNode[] {
  const rId = el.getAttributeNS(R_NS, 'id') || el.getAttribute('r:id') || '';
  const anchor = attr(el, 'anchor');
  const href = rId && rels[rId] ? rels[rId].target : anchor ? `#${anchor}` : '';
  const children: InlineNode[] = [];
  for (const child of Array.from(el.children)) {
    if (child.localName === 'r') {
      children.push(...parseRun(child, inheritedRun));
    }
  }
  const textChildren = children.filter((c): c is Extract<InlineNode, { type: 'text' }> => c.type === 'text');
  if (!href || !textChildren.length) return children;
  return [
    {
      type: 'link',
      href,
      children: textChildren,
    },
  ];
}

function parseRun(r: Element, inheritedRun: TextMarks): InlineNode[] {
  const rPr = q(r, 'rPr');
  const marks = compactMarks(parseRunMarks(rPr, inheritedRun));
  const nodes: InlineNode[] = [];

  for (const child of Array.from(r.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    const name = el.localName;

    if (name === 't') {
      const text = el.textContent ?? '';
      if (text) nodes.push(marks ? { type: 'text', text, marks } : { type: 'text', text });
    } else if (name === 'tab') {
      nodes.push(marks ? { type: 'text', text: '\t', marks } : { type: 'text', text: '\t' });
    } else if (name === 'br') {
      const brType = attr(el, 'type');
      if (brType === 'page') {
        // page break inside run — handled at paragraph level usually
        nodes.push({ type: 'text', text: '\n' });
      } else {
        nodes.push(marks ? { type: 'text', text: '\n', marks } : { type: 'text', text: '\n' });
      }
    }
  }
  return nodes;
}

function hasPageBreak(p: Element): boolean {
  for (const br of qa(p, 'br')) {
    if (attr(br, 'type') === 'page') return true;
  }
  return !!q(p, 'lastRenderedPageBreak');
}

function parseParagraph(
  p: Element,
  styles: ParsedStyles,
  rels: RelMap,
  assets: DocumentAsset[],
  zip: JSZip,
  pendingImages: Promise<void>[],
): BlockNode[] {
  const blocks: BlockNode[] = [];
  if (hasPageBreak(p)) {
    blocks.push({ type: 'pageBreak', id: createId('pb') });
  }

  const pPr = q(p, 'pPr');
  const styleId = attr(q(pPr, 'pStyle'), 'val');
  const resolved = resolveStyle(styles, styleId);
  const styleName = styleId ? styles.byId.get(styleId)?.name : undefined;
  const mergedPara = parseParagraphStyle(pPr, {
    fontFamily: styles.defaults.fontFamily,
    fontSize: styles.defaults.fontSize,
    textColor: styles.defaults.textColor,
    lineHeight: styles.defaults.lineHeight,
    ...resolved.paragraph,
  });
  const inheritedRun: TextMarks = {
    fontFamily: styles.defaults.fontFamily,
    fontSize: styles.defaults.fontSize,
    textColor: styles.defaults.textColor,
    ...resolved.run,
  };

  // Images in drawings
  for (const blip of qa(p, 'blip', A_NS)) {
    const embed =
      blip.getAttributeNS(R_NS, 'embed')
      || blip.getAttribute('r:embed')
      || blip.getAttribute('embed');
    if (!embed || !rels[embed]) continue;
    pendingImages.push(
      (async () => {
        const asset = await loadImageAsset(zip, rels[embed].target, assets);
        if (asset) {
          // Images are inserted as sibling blocks after paragraph parse —
          // store on a temporary queue via assets only; we'll add below if found in runs.
        }
      })(),
    );
  }

  const inlines: InlineNode[] = [];
  const imageBlocks: BlockNode[] = [];

  for (const child of Array.from(p.children)) {
    const name = child.localName;
    if (name === 'r') {
      // Check for drawing in run
      const drawings = qa(child, 'drawing');
      if (drawings.length) {
        for (const drawing of drawings) {
          for (const blip of qa(drawing, 'blip', A_NS)) {
            const embed =
              blip.getAttributeNS(R_NS, 'embed')
              || blip.getAttribute('r:embed')
              || blip.getAttribute('embed');
            if (!embed || !rels[embed]) continue;
            const extent = q(drawing, 'extent', 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing')
              || q(drawing, 'ext', A_NS);
            let width: number | undefined;
            let height: number | undefined;
            if (extent) {
              const cx = extent.getAttribute('cx');
              const cy = extent.getAttribute('cy');
              // EMUs: 914400 per inch
              if (cx) width = Math.round((Number(cx) / 914400) * 96);
              if (cy) height = Math.round((Number(cy) / 914400) * 96);
            }
            pendingImages.push(
              (async () => {
                const asset = await loadImageAsset(zip, rels[embed].target, assets);
                if (asset) {
                  imageBlocks.push({
                    type: 'image',
                    id: createId('img'),
                    assetId: asset.id,
                    width,
                    height,
                  });
                }
              })(),
            );
          }
        }
      }
      inlines.push(...parseRun(child, inheritedRun));
    } else if (name === 'hyperlink') {
      inlines.push(...parseHyperlink(child, rels, inheritedRun));
    }
  }

  const level = headingLevelFromStyle(styleId, styleName);
  const blockStyle = compactStyle({
    marginTop: mergedPara.marginTop,
    marginBottom: mergedPara.marginBottom,
    lineHeight: mergedPara.lineHeight,
    fontSize: mergedPara.fontSize,
    fontFamily: mergedPara.fontFamily,
    textColor: mergedPara.textColor,
    indentLeft: mergedPara.indentLeft,
    indentRight: mergedPara.indentRight,
    indentFirstLine: mergedPara.indentFirstLine,
  });

  if (level) {
    blocks.push({
      type: 'heading',
      id: createId('h'),
      level,
      align: mergedPara.align,
      style: blockStyle,
      children: inlines.length ? inlines : [{ type: 'text', text: '' }],
    });
  } else {
    blocks.push({
      type: 'paragraph',
      id: createId('p'),
      align: mergedPara.align,
      style: blockStyle,
      children: inlines.length ? inlines : [{ type: 'text', text: '' }],
    });
  }

  // Attach images after awaiting — caller flushes pendingImages then we need sync path.
  // For simplicity, push placeholder promises that mutate imageBlocks; after await, append.
  (blocks as BlockNode[] & { __images?: BlockNode[] }).__images = imageBlocks;

  return blocks;
}

function parseTableCell(
  tc: Element,
  styles: ParsedStyles,
  rels: RelMap,
  assets: DocumentAsset[],
  zip: JSZip,
  pendingImages: Promise<void>[],
  isHeader: boolean,
): TableCellNode {
  const tcPr = q(tc, 'tcPr');
  const shd = q(tcPr, 'shd');
  const backgroundColor = resolveShdColor(shd, currentThemeColors);

  const gridSpan = Number(attr(q(tcPr, 'gridSpan'), 'val') || '1');
  const vMerge = attr(q(tcPr, 'vMerge'), 'val');
  // restart or undefined with vMerge element = start; continue = skip (simplified: still emit)

  const tcW = q(tcPr, 'tcW');
  const widthTwips = attr(tcW, 'w');
  const width = widthTwips ? twipsToPx(Number(widthTwips)) : undefined;

  const vAlignEl = q(tcPr, 'vAlign');
  const vAlignVal = attr(vAlignEl, 'val');
  let verticalAlign: TableCellNode['verticalAlign'];
  if (vAlignVal === 'center') verticalAlign = 'middle';
  else if (vAlignVal === 'bottom') verticalAlign = 'bottom';
  else if (vAlignVal === 'top') verticalAlign = 'top';

  const tcBorders = q(tcPr, 'tcBorders');
  const borders: CellBorders | undefined = tcBorders
    ? {
        top: parseCellBorder(q(tcBorders, 'top')),
        left: parseCellBorder(q(tcBorders, 'left')),
        bottom: parseCellBorder(q(tcBorders, 'bottom')),
        right: parseCellBorder(q(tcBorders, 'right')),
      }
    : undefined;

  const mar = q(tcPr, 'tcMar');
  let padding: string | undefined;
  if (mar) {
    const top = attr(q(mar, 'top'), 'w');
    const right = attr(q(mar, 'right'), 'w');
    const bottom = attr(q(mar, 'bottom'), 'w');
    const left = attr(q(mar, 'left'), 'w');
    if (top || right || bottom || left) {
      padding = [
        top ? twipsToPx(Number(top)) : '0',
        right ? twipsToPx(Number(right)) : '0',
        bottom ? twipsToPx(Number(bottom)) : '0',
        left ? twipsToPx(Number(left)) : '0',
      ].join(' ');
    }
  }

  const children: BlockNode[] = [];
  for (const child of Array.from(tc.children)) {
    if (child.localName === 'p') {
      const parsed = parseParagraph(child, styles, rels, assets, zip, pendingImages);
      children.push(...parsed.filter((b) => b.type !== 'pageBreak' || children.length > 0));
    } else if (child.localName === 'tbl') {
      children.push(parseTable(child, styles, rels, assets, zip, pendingImages));
    }
  }

  if (!children.length) {
    children.push({
      type: 'paragraph',
      id: createId('p'),
      children: [{ type: 'text', text: '' }],
    });
  }

  return {
    type: isHeader ? 'tableHeader' : 'tableCell',
    id: createId('td'),
    colspan: gridSpan > 1 ? gridSpan : undefined,
    rowspan: vMerge === 'restart' ? undefined : undefined,
    backgroundColor,
    width,
    verticalAlign,
    borders,
    padding,
    children,
  };
}

function parseTable(
  tbl: Element,
  styles: ParsedStyles,
  rels: RelMap,
  assets: DocumentAsset[],
  zip: JSZip,
  pendingImages: Promise<void>[],
): TableBlock {
  const rows: TableRowNode[] = [];
  let rowIndex = 0;

  // Table-level borders as defaults for cells missing borders
  const tblPr = q(tbl, 'tblPr');
  const tblBorders = q(tblPr, 'tblBorders');
  const defaultBorders: CellBorders | undefined = tblBorders
    ? {
        top: parseCellBorder(q(tblBorders, 'top')),
        left: parseCellBorder(q(tblBorders, 'left')),
        bottom: parseCellBorder(q(tblBorders, 'bottom')),
        right: parseCellBorder(q(tblBorders, 'right')),
      }
    : undefined;

  const tblW = q(tblPr, 'tblW');
  const tableWidthTwips = attr(tblW, 'w');
  const tableWidthType = attr(tblW, 'type');
  let tableWidth: string | undefined;
  if (tableWidthTwips && tableWidthType === 'dxa') {
    tableWidth = twipsToPx(Number(tableWidthTwips));
  } else if (tableWidthType === 'pct' && tableWidthTwips) {
    tableWidth = `${Number(tableWidthTwips) / 50}%`;
  }

  for (const tr of qa(tbl, 'tr')) {
    const cells: TableCellNode[] = [];
    const isHeader = rowIndex === 0 && !!q(q(tr, 'trPr'), 'tblHeader');
    // Also treat first row as header-ish if it has shading commonly — keep as tableCell unless tblHeader

    for (const tc of Array.from(tr.children).filter((c) => c.localName === 'tc')) {
      const cell = parseTableCell(
        tc,
        styles,
        rels,
        assets,
        zip,
        pendingImages,
        isHeader || (rowIndex === 0 && !!q(q(tc, 'tcPr'), 'shd') && false),
      );
      if (!cell.borders && defaultBorders) {
        cell.borders = defaultBorders;
      } else if (cell.borders && defaultBorders) {
        cell.borders = {
          top: cell.borders.top ?? defaultBorders.top,
          right: cell.borders.right ?? defaultBorders.right,
          bottom: cell.borders.bottom ?? defaultBorders.bottom,
          left: cell.borders.left ?? defaultBorders.left,
        };
      }
      cells.push(cell);
    }

    const trHeight = attr(q(q(tr, 'trPr'), 'trHeight'), 'val');
    rows.push({
      type: 'tableRow',
      id: createId('tr'),
      cells,
      height: trHeight ? twipsToPx(Number(trHeight)) : undefined,
    });
    rowIndex += 1;
  }

  return {
    type: 'table',
    id: createId('table'),
    rows,
    width: tableWidth,
  };
}

function isListParagraph(p: Element): boolean {
  const pPr = q(p, 'pPr');
  return !!q(pPr, 'numPr');
}

function flushList(
  items: ListItemNode[],
  ordered: boolean,
): BlockNode | null {
  if (!items.length) return null;
  if (ordered) {
    return { type: 'orderedList', id: createId('ol'), items };
  }
  return { type: 'bulletList', id: createId('ul'), items };
}

export interface OoxmlParseResult {
  document: DocumentModel;
  warnings: string[];
}

export async function ooxmlToModel(
  arrayBuffer: ArrayBuffer,
  options?: { filename?: string; title?: string },
): Promise<OoxmlParseResult> {
  numberingCache.clear();
  currentThemeColors = { ...THEME_FALLBACKS };
  const warnings: string[] = [];
  const unsupported: UnsupportedElement[] = [];
  const zip = await JSZip.loadAsync(arrayBuffer);

  const documentXml = await zip.file('word/document.xml')?.async('text');
  if (!documentXml) {
    throw new Error(
      "We couldn't read this document. The file may be corrupted or incomplete.",
    );
  }

  const stylesXml = (await zip.file('word/styles.xml')?.async('text')) || '';
  const relsXml =
    (await zip.file('word/_rels/document.xml.rels')?.async('text')) || '';
  const themeXml =
    (await zip.file('word/theme/theme1.xml')?.async('text')) || '';
  if (themeXml) {
    currentThemeColors = parseThemeColors(themeXml);
  }

  const styles = stylesXml
    ? parseStylesXml(stylesXml)
    : {
        defaults: {
          fontFamily: 'Times New Roman',
          fontSize: '11pt',
          lineHeight: 1.15,
          textColor: '#000000',
        } satisfies DocumentDefaults,
        byId: new Map<string, StyleDef>(),
      };
  const rels = relsXml ? parseRelationships(relsXml) : {};

  const xmlDoc = new DOMParser().parseFromString(documentXml, 'application/xml');
  const body = q(xmlDoc, 'body');
  if (!body) {
    throw new Error(
      "We couldn't read this document. The file may be corrupted or incomplete.",
    );
  }

  const assets: DocumentAsset[] = [];
  const pendingImages: Promise<void>[] = [];
  const blocks: BlockNode[] = [];

  let listItems: ListItemNode[] = [];
  let listOrdered = false;

  const flushCurrentList = () => {
    const list = flushList(listItems, listOrdered);
    if (list) blocks.push(list);
    listItems = [];
  };

  for (const child of Array.from(body.children)) {
    const name = child.localName;
    if (name === 'p') {
      const asList = isListParagraph(child);
      const numPr = q(q(child, 'pPr'), 'numPr');

      if (asList) {
        const numId = attr(q(numPr, 'numId'), 'val');
        const orderedNow = await detectOrdered(zip, numId);
        if (listItems.length && listOrdered !== orderedNow) {
          flushCurrentList();
        }
        listOrdered = orderedNow;

        const paras = parseParagraph(child, styles, rels, assets, zip, pendingImages);
        const content = paras.filter((b) => b.type === 'paragraph' || b.type === 'heading');
        listItems.push({
          type: 'listItem',
          id: createId('li'),
          children: content.length
            ? content
            : [
                {
                  type: 'paragraph',
                  id: createId('p'),
                  children: [{ type: 'text', text: '' }],
                } satisfies ParagraphBlock,
              ],
        });
      } else {
        flushCurrentList();
        const parsed = parseParagraph(child, styles, rels, assets, zip, pendingImages);
        // Flush async images into stream after await — stash markers
        blocks.push(...parsed);
      }
    } else if (name === 'tbl') {
      flushCurrentList();
      blocks.push(parseTable(child, styles, rels, assets, zip, pendingImages));
    } else if (name === 'sectPr') {
      // section properties — ignore for body content
    }
  }
  flushCurrentList();

  await Promise.all(pendingImages);

  // Attach deferred images that were collected on paragraph parse markers
  const finalBlocks: BlockNode[] = [];
  for (const block of blocks) {
    finalBlocks.push(block);
    const extra = (block as BlockNode & { __images?: BlockNode[] }).__images;
    if (extra?.length) {
      finalBlocks.push(...extra);
      delete (block as BlockNode & { __images?: BlockNode[] }).__images;
    }
  }

  if (!finalBlocks.length) {
    finalBlocks.push({
      type: 'paragraph',
      id: createId('p'),
      children: [{ type: 'text', text: '' }],
    });
  }

  const document = createDocumentFromParts({
    metadata: {
      title: options?.title || options?.filename?.replace(/\.docx$/i, '') || 'Imported Document',
      source: 'docx',
      filename: options?.filename,
      creator: 'Buildesk Convertor',
    },
    blocks: finalBlocks,
    assets,
    unsupportedElements: unsupported,
  });

  document.defaults = styles.defaults;
  document.styles = {
    docDefaults: styles.defaults,
  };

  warnings.push(
    'Imported with enhanced Word formatting (fonts, spacing, table colors). Some advanced Word features may still differ.',
  );

  return { document, warnings };
}

const numberingCache = new Map<string, boolean>();
let currentThemeColors: Record<string, string> = { ...THEME_FALLBACKS };

async function detectOrdered(zip: JSZip, numId?: string): Promise<boolean> {
  if (!numId) return false;
  const cacheKey = numId;
  if (numberingCache.has(cacheKey)) return numberingCache.get(cacheKey)!;

  try {
    const numberingXml = await zip.file('word/numbering.xml')?.async('text');
    if (!numberingXml) {
      numberingCache.set(cacheKey, false);
      return false;
    }
    const doc = new DOMParser().parseFromString(numberingXml, 'application/xml');
    const nums = qa(doc, 'num');
    let abstractId: string | undefined;
    for (const num of nums) {
      if (attr(num, 'numId') === numId) {
        abstractId = attr(q(num, 'abstractNumId'), 'val');
        break;
      }
    }
    if (!abstractId) {
      numberingCache.set(cacheKey, false);
      return false;
    }
    for (const abs of qa(doc, 'abstractNum')) {
      if (attr(abs, 'abstractNumId') === abstractId) {
        const lvl = q(abs, 'lvl');
        const fmt = attr(q(lvl, 'numFmt'), 'val');
        const ordered = !!fmt && fmt !== 'bullet';
        numberingCache.set(cacheKey, ordered);
        return ordered;
      }
    }
  } catch {
    // ignore
  }
  numberingCache.set(cacheKey, false);
  return false;
}
