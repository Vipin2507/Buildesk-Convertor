import { DOCUMENT_FORMAT, GENERATOR_NAME } from '../document-model/types';

export const EXACT_HTML_FORMAT = 'docx-exact-html-v1';

/** Standard A4 — Word page size 8.27 × 11.69 inches */
export const A4_WIDTH_IN = 8.27;
export const A4_HEIGHT_IN = 11.69;
export const A4_WIDTH_PX = Math.round(A4_WIDTH_IN * 96); // ~794px @ 96dpi
export const A4_HEIGHT_PX = Math.round(A4_HEIGHT_IN * 96); // ~1122px @ 96dpi

export interface ExactHtmlMeta {
  format: typeof EXACT_HTML_FORMAT;
  generator: string;
  view: 'exact';
  exportedAt: string;
  title?: string;
  originalDocxBase64?: string;
  documentFormat?: string;
  pageCount?: number;
}

interface PageSize {
  widthPx: number;
  heightPx: number;
  widthCss: string;
  heightCss: string;
}

const A4_SIZE: PageSize = {
  widthPx: A4_WIDTH_PX,
  heightPx: A4_HEIGHT_PX,
  widthCss: `${A4_WIDTH_IN}in`,
  heightCss: `${A4_HEIGHT_IN}in`,
};

/**
 * docx-preview only splits on lastRenderedPageBreak / explicit breaks.
 * Soft-paginated Word files render as a few very tall sections. Re-split by
 * fixed A4 page height (8.27 × 11.69 in).
 */
export function repaginateByHeight(container: HTMLElement, className = 'docx-exact'): number {
  const wrapper = container.querySelector(`.${className}-wrapper`) as HTMLElement | null;
  if (!wrapper) return 0;

  const sections = Array.from(
    wrapper.querySelectorAll(`:scope > section.${className}`),
  ) as HTMLElement[];
  if (!sections.length) return 0;

  sections.forEach((s) => {
    if (!s.getAttribute('data-buildesk-page-style')) {
      s.setAttribute('data-buildesk-page-style', s.getAttribute('style') || '');
    }
  });

  // Exact Word view uses A4 page box: 8.27 × 11.69 inches
  const size = resolvePageSize(sections[0]);

  // Capture the best footer BEFORE we mutate pages (may contain page-number result)
  const sharedFooter = sections
    .map((s) => s.querySelector(':scope > footer') as HTMLElement | null)
    .find((f) => f && (f.textContent || '').replace(/\s+/g, ' ').trim().length > 0)
    || sections[0]?.querySelector(':scope > footer')
    || null;
  const footerTemplate = sharedFooter
    ? (sharedFooter.cloneNode(true) as HTMLElement)
    : null;

  wrapper.querySelectorAll('[data-buildesk-page-badge="1"]').forEach((n) => n.remove());

  const needsSplit = sections.some((s) => {
    preparePage(s, size);
    return pageContentOverflows(s);
  });

  if (!needsSplit) {
    sections.forEach((s) => {
      if (footerTemplate && !s.querySelector(':scope > footer')) {
        s.appendChild(footerTemplate.cloneNode(true));
      }
      preparePage(s, size);
    });
    return sections.length;
  }

  const fragment = document.createDocumentFragment();
  for (const section of sections) {
    for (const page of splitTallSection(section, size, footerTemplate)) {
      fragment.appendChild(page);
    }
  }

  wrapper.replaceChildren(fragment);

  const finalPages = Array.from(
    wrapper.querySelectorAll(`:scope > section.${className}`),
  ) as HTMLElement[];
  finalPages.forEach((p) => preparePage(p, size));

  return finalPages.length;
}

/** Convert CSS lengths (pt/in/cm/mm/px) to device pixels at 96dpi. */
function lengthToPx(value: string): number {
  const m = value.trim().match(/^(-?[\d.]+)\s*(px|pt|in|cm|mm|pc)?$/i);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return NaN;
  switch ((m[2] || 'px').toLowerCase()) {
    case 'px':
      return n;
    case 'pt':
      return n * (96 / 72);
    case 'pc':
      return n * 16;
    case 'in':
      return n * 96;
    case 'cm':
      return n * (96 / 2.54);
    case 'mm':
      return n * (96 / 25.4);
    default:
      return n;
  }
}

/**
 * Prefer exact A4 (8.27 × 11.69 in). Snap near-A4 DOCX sizes to A4;
 * keep other sizes (e.g. Letter) when clearly different.
 */
function resolvePageSize(section: HTMLElement): PageSize {
  let widthPx = parseFloat(getComputedStyle(section).width);
  let heightPx = parseFloat(getComputedStyle(section).minHeight);

  if (!(widthPx > 100)) {
    widthPx = lengthToPx(section.style.width) || A4_WIDTH_PX;
  }
  if (!(heightPx > 100)) {
    heightPx = lengthToPx(section.style.minHeight || section.style.height) || A4_HEIGHT_PX;
  }

  const widthIn = widthPx / 96;
  const heightIn = heightPx / 96;

  // A4 / near-A4 (common OOXML twip rounding) → exact 8.27 × 11.69 in
  const nearA4 =
    Math.abs(widthIn - A4_WIDTH_IN) / A4_WIDTH_IN < 0.06
    && Math.abs(heightIn - A4_HEIGHT_IN) / A4_HEIGHT_IN < 0.06;

  // User docs in this app are A4; default to A4 when ambiguous portrait size
  const ambiguousPortrait =
    widthIn > 7.5 && widthIn < 9 && heightIn > 10 && heightIn < 12.5;

  if (nearA4 || ambiguousPortrait) {
    return A4_SIZE;
  }

  return {
    widthPx: Math.round(widthPx),
    heightPx: Math.round(heightPx),
    widthCss: `${(widthPx / 96).toFixed(2)}in`,
    heightCss: `${(heightPx / 96).toFixed(2)}in`,
  };
}

function lockPageBox(section: HTMLElement, size: PageSize): void {
  section.style.boxSizing = 'border-box';
  section.style.display = 'flex';
  section.style.flexDirection = 'column';
  section.style.width = size.widthCss;
  section.style.maxWidth = size.widthCss;
  section.style.minWidth = size.widthCss;
  section.style.minHeight = size.heightCss;
  section.style.height = size.heightCss;
  section.style.maxHeight = size.heightCss;
  section.style.overflow = 'hidden';
  section.style.position = 'relative';
}

/**
 * Clear docx-preview negative header/footer margins (they clip outside the
 * page). Pin the footer to the bottom of the fixed page box so page numbers
 * sit at the real footer, not mid-page.
 */
function normalizePageChrome(page: HTMLElement): void {
  const cs = getComputedStyle(page);
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const padLeft = cs.paddingLeft;
  const padRight = cs.paddingRight;

  const pristine = page.getAttribute('data-buildesk-page-style') || '';
  const padTopFallback = lengthToPx(pristine.match(/padding-top:\s*([^;]+)/i)?.[1] || '') || padTop;
  const padBottomFallback =
    lengthToPx(pristine.match(/padding-bottom:\s*([^;]+)/i)?.[1] || '') || padBottom;
  const topBand = padTop > 0 ? padTop : padTopFallback;
  const bottomBand = padBottom > 0 ? padBottom : padBottomFallback || Math.round(0.79 * 96);

  const header = page.querySelector(':scope > header') as HTMLElement | null;
  const footer = page.querySelector(':scope > footer') as HTMLElement | null;
  const article = page.querySelector(':scope > article') as HTMLElement | null;

  if (header) {
    header.style.margin = '0';
    header.style.flexShrink = '0';
    header.style.visibility = 'visible';
    header.style.overflow = 'visible';
    header.style.position = 'relative';
    header.style.zIndex = '5';
    header.style.boxSizing = 'border-box';
    header.style.display = 'flex';
    header.style.flexDirection = 'column';
    header.style.justifyContent = 'flex-end';
    if (topBand > 0) {
      page.style.paddingTop = '0';
      header.style.minHeight = `${topBand}px`;
    }
  }

  if (footer) {
    page.style.paddingBottom = '0';
    footer.style.margin = '0';
    footer.style.position = 'absolute';
    footer.style.left = '0';
    footer.style.right = '0';
    footer.style.bottom = '0';
    footer.style.width = '100%';
    footer.style.boxSizing = 'border-box';
    footer.style.minHeight = `${bottomBand}px`;
    footer.style.height = `${bottomBand}px`;
    footer.style.paddingLeft = padLeft;
    footer.style.paddingRight = padRight;
    footer.style.display = 'flex';
    footer.style.flexDirection = 'column';
    footer.style.justifyContent = 'center';
    footer.style.alignItems = 'stretch';
    footer.style.visibility = 'visible';
    footer.style.opacity = '1';
    footer.style.overflow = 'visible';
    footer.style.zIndex = '10';
    footer.style.flexShrink = '0';
  }

  if (article) {
    article.style.flex = '1 1 auto';
    article.style.minHeight = '0';
    article.style.overflow = 'hidden';
    article.style.position = 'relative';
    article.style.zIndex = '1';
    article.style.paddingBottom = '0';
    // Reserve footer band so body never paints over page numbers
    article.style.marginBottom = footer ? `${bottomBand}px` : '0';
  }
}

function preparePage(page: HTMLElement, size: PageSize): void {
  lockPageBox(page, size);
  normalizePageChrome(page);
}

function pageContentOverflows(page: HTMLElement): boolean {
  const article = page.querySelector(':scope > article') as HTMLElement | null;
  if (!article) {
    return page.scrollHeight > page.clientHeight + 0.5;
  }
  return article.scrollHeight > article.clientHeight + 0.5;
}

function splitTallSection(
  section: HTMLElement,
  size: PageSize,
  footerTemplate: HTMLElement | null = null,
): HTMLElement[] {
  const articles = Array.from(
    section.querySelectorAll(':scope > article'),
  ) as HTMLElement[];
  if (!articles.length) {
    preparePage(section, size);
    return [section];
  }

  const header = section.querySelector(':scope > header') as HTMLElement | null;
  const footer =
    section.querySelector(':scope > footer') as HTMLElement | null
    || footerTemplate;
  const templateArticle = articles[0];

  const probeArticle = articles[0];
  for (const a of articles.slice(1)) {
    while (a.firstChild) probeArticle.appendChild(a.firstChild);
    a.remove();
  }

  const extras = Array.from(section.children).filter((el) => {
    const tag = el.tagName;
    return tag !== 'HEADER' && tag !== 'FOOTER' && tag !== 'ARTICLE';
  }) as HTMLElement[];

  if (!probeArticle.childNodes.length) {
    preparePage(section, size);
    return [section];
  }

  preparePage(section, size);
  if (!pageContentOverflows(section)) {
    return [section];
  }

  const parent = section.parentElement;
  if (!parent) {
    preparePage(section, size);
    return [section];
  }

  const queue: Node[] = Array.from(probeArticle.childNodes);
  const pages: HTMLElement[] = [];
  let current = createEmptyPage(section, header, footer, templateArticle);
  let currentArticle = current.querySelector(':scope > article') as HTMLElement;
  parent.insertBefore(current, section);
  preparePage(current, size);

  while (queue.length) {
    const child = queue.shift()!;
    currentArticle.appendChild(child);

    if (!pageContentOverflows(current)) continue;

    currentArticle.removeChild(child);

    if (currentArticle.childNodes.length > 0) {
      pages.push(current);
      current = createEmptyPage(section, header, footer, templateArticle);
      currentArticle = current.querySelector(':scope > article') as HTMLElement;
      parent.insertBefore(current, section);
      preparePage(current, size);
      queue.unshift(child);
      continue;
    }

    const pieces = explodeOversizedNode(child, current, currentArticle);
    if (pieces.length > 1) {
      queue.unshift(...pieces);
      continue;
    }

    currentArticle.appendChild(child);
  }

  for (const extra of extras) {
    current.appendChild(extra);
  }

  preparePage(current, size);
  pages.push(current);
  section.remove();
  return pages;
}

function createEmptyPage(
  template: HTMLElement,
  header: HTMLElement | null,
  footer: HTMLElement | null,
  templateArticle?: HTMLElement | null,
): HTMLElement {
  const page = template.cloneNode(false) as HTMLElement;
  page.className = template.className;
  const style =
    template.getAttribute('data-buildesk-page-style')
    || template.getAttribute('style');
  if (style) {
    page.setAttribute('style', style);
    page.setAttribute('data-buildesk-page-style', style);
  }

  if (header) page.appendChild(header.cloneNode(true));

  const article = document.createElement('article');
  const sourceArticle =
    templateArticle
    || (template.querySelector(':scope > article') as HTMLElement | null);
  const articleStyle = sourceArticle?.getAttribute('style');
  if (articleStyle) article.setAttribute('style', articleStyle);
  page.appendChild(article);

  if (footer) page.appendChild(footer.cloneNode(true));
  return page;
}

function explodeOversizedNode(
  node: Node,
  page: HTMLElement,
  article: HTMLElement,
): Node[] {
  if (!(node instanceof HTMLElement)) return [node];

  if (node.tagName === 'TABLE') {
    const byRows = splitTableByRows(node, page, article);
    if (byRows.length > 1) return byRows;

    const nested = node.querySelector(':scope td table, :scope th table') as HTMLElement | null;
    if (nested) {
      nested.remove();
      const nestedParts = explodeOversizedNode(nested, page, article);
      if (nestedParts.length > 1) {
        const shellHasContent = (node.textContent || '').trim().length > 0
          || node.querySelector('img, svg, canvas');
        return shellHasContent ? [node, ...nestedParts] : nestedParts;
      }
      const cell = node.querySelector(':scope td, :scope th');
      cell?.appendChild(nested);
    }
    return [node];
  }

  const kids = Array.from(node.children) as HTMLElement[];
  if (kids.length > 1) {
    return kids.map((kid) => {
      const wrap = node.cloneNode(false) as HTMLElement;
      wrap.appendChild(kid);
      return wrap;
    });
  }

  return [node];
}

function splitTableByRows(
  table: HTMLElement,
  page: HTMLElement,
  article: HTMLElement,
): Node[] {
  const colgroup = table.querySelector(':scope > colgroup')?.cloneNode(true) as HTMLElement | null;
  const thead = table.querySelector(':scope > thead')?.cloneNode(true) as HTMLElement | null;

  const rowParents = Array.from(table.querySelectorAll(':scope > tbody'));
  const rows: HTMLElement[] = [];
  if (rowParents.length) {
    for (const body of rowParents) {
      rows.push(...Array.from(body.children).filter((c): c is HTMLElement => c.tagName === 'TR'));
    }
  } else {
    rows.push(...Array.from(table.children).filter((c): c is HTMLElement => c.tagName === 'TR'));
  }

  if (rows.length <= 1) return [table];

  const parts: HTMLElement[] = [];
  let currentTable = emptyTableLike(table, colgroup, thead);
  let currentBody = ensureTbody(currentTable);
  article.appendChild(currentTable);

  const sealAndStartNew = () => {
    article.removeChild(currentTable);
    parts.push(currentTable);
    currentTable = emptyTableLike(table, colgroup, thead);
    currentBody = ensureTbody(currentTable);
    article.appendChild(currentTable);
  };

  for (const row of rows) {
    currentBody.appendChild(row);
    if (!pageContentOverflows(page)) continue;

    if (currentBody.children.length > 1) {
      currentBody.removeChild(row);
      sealAndStartNew();
      currentBody.appendChild(row);
      if (pageContentOverflows(page)) {
        sealAndStartNew();
      }
    } else {
      sealAndStartNew();
    }
  }

  if (currentBody.children.length > 0) {
    article.removeChild(currentTable);
    parts.push(currentTable);
  } else if (currentTable.parentElement === article) {
    article.removeChild(currentTable);
  }

  return parts.length ? parts : [table];
}

function emptyTableLike(
  template: HTMLElement,
  colgroup: HTMLElement | null,
  thead: HTMLElement | null,
): HTMLElement {
  const t = template.cloneNode(false) as HTMLElement;
  const style = template.getAttribute('style');
  if (style) t.setAttribute('style', style);
  const cls = template.getAttribute('class');
  if (cls) t.setAttribute('class', cls);
  if (colgroup) t.appendChild(colgroup.cloneNode(true));
  if (thead) t.appendChild(thead.cloneNode(true));
  return t;
}

function ensureTbody(table: HTMLElement): HTMLElement {
  let body = table.querySelector(':scope > tbody') as HTMLElement | null;
  if (!body) {
    body = document.createElement('tbody');
    table.appendChild(body);
  }
  return body;
}

/**
 * Resolve the document's own PAGE / NUMPAGES fields in headers & footers,
 * and guarantee a visible footer on every page (docx-preview skips field runs,
 * so many Word footers render empty).
 */
export function resolveNativePageNumbers(container: HTMLElement, className = 'docx-exact'): number {
  let pages = Array.from(container.querySelectorAll(`section.${className}`));
  if (!pages.length) {
    pages = Array.from(container.querySelectorAll(`.${className}-wrapper > section`));
  }
  const total = pages.length;
  if (!total) return 0;

  container.querySelectorAll('[data-buildesk-page-badge="1"]').forEach((n) => n.remove());

  // Prefer a real footer template from the DOCX render when one has content
  const templateFooter = pages
    .map((p) => p.querySelector(':scope > footer') as HTMLElement | null)
    .find((f) => f && footerHasMeaningfulContent(f))
    || null;

  pages.forEach((page, index) => {
    const pageNum = index + 1;
    const section = page as HTMLElement;
    section.style.position = 'relative';
    section.style.overflow = 'hidden';

    ensureVisibleFooter(section, pageNum, total, templateFooter);

    section.querySelectorAll(':scope > header').forEach((region) => {
      resolvePageFieldsInElement(region, pageNum, total);
      const hf = region as HTMLElement;
      hf.style.visibility = 'visible';
      hf.style.opacity = '1';
      forceReadableText(hf);
    });
  });

  return total;
}

function footerHasMeaningfulContent(footer: HTMLElement): boolean {
  const text = (footer.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  // Ignore leftover field instruction scraps
  if (/^(PAGE|NUMPAGES|PAGEREF)$/i.test(text)) return false;
  return true;
}

function forceReadableText(root: HTMLElement): void {
  root.style.color = '#000';
  root.querySelectorAll('*').forEach((el) => {
    const h = el as HTMLElement;
    h.style.visibility = 'visible';
    h.style.opacity = '1';
    if (!h.style.color || h.style.color === 'transparent' || h.style.color === 'rgba(0, 0, 0, 0)') {
      h.style.color = '#000';
    }
  });
}

function ensureVisibleFooter(
  section: HTMLElement,
  pageNum: number,
  total: number,
  templateFooter: HTMLElement | null,
): void {
  let footer = section.querySelector(':scope > footer') as HTMLElement | null;

  if (!footer) {
    footer = templateFooter
      ? (templateFooter.cloneNode(true) as HTMLElement)
      : document.createElement('footer');
    section.appendChild(footer);
  } else if (!footerHasMeaningfulContent(footer) && templateFooter) {
    footer.replaceChildren(
      ...Array.from(templateFooter.cloneNode(true).childNodes),
    );
  }

  // Pin to bottom of A4 page
  const pristine = section.getAttribute('data-buildesk-page-style') || '';
  const padBottom =
    lengthToPx(pristine.match(/padding-bottom:\s*([^;]+)/i)?.[1] || '')
    || parseFloat(getComputedStyle(section).paddingBottom)
    || Math.round(0.79 * 96);
  const band = Math.max(padBottom, Math.round(0.6 * 96));
  const padLeft = getComputedStyle(section).paddingLeft || '72pt';
  const padRight = getComputedStyle(section).paddingRight || '72pt';

  section.style.paddingBottom = '0';
  footer.style.position = 'absolute';
  footer.style.left = '0';
  footer.style.right = '0';
  footer.style.bottom = '0';
  footer.style.width = '100%';
  footer.style.boxSizing = 'border-box';
  footer.style.minHeight = `${band}px`;
  footer.style.height = `${band}px`;
  footer.style.paddingLeft = padLeft;
  footer.style.paddingRight = padRight;
  footer.style.margin = '0';
  footer.style.display = 'flex';
  footer.style.flexDirection = 'column';
  footer.style.justifyContent = 'center';
  footer.style.alignItems = 'stretch';
  footer.style.visibility = 'visible';
  footer.style.opacity = '1';
  footer.style.overflow = 'visible';
  footer.style.zIndex = '20';
  footer.style.pointerEvents = 'none';
  footer.style.background = 'transparent';

  const article = section.querySelector(':scope > article') as HTMLElement | null;
  if (article) {
    article.style.marginBottom = `${band}px`;
  }

  resolvePageFieldsInElement(footer, pageNum, total);
  forceReadableText(footer);

  if (!footerHasMeaningfulContent(footer)) {
    footer.replaceChildren();
    const p = document.createElement('p');
    p.setAttribute('data-buildesk-page-num', '1');
    p.style.margin = '0';
    p.style.padding = '0';
    p.style.textAlign = 'center';
    p.style.fontFamily = 'Times New Roman, Times, serif';
    p.style.fontSize = '12pt';
    p.style.lineHeight = '1';
    p.style.color = '#000';
    p.textContent = String(pageNum);
    footer.appendChild(p);
  } else {
    // Keep Word layout; make sure digits / centered paras are updated & readable
    footer.querySelectorAll('p').forEach((p) => {
      const el = p as HTMLElement;
      el.style.visibility = 'visible';
      el.style.opacity = '1';
      el.style.color = '#000';
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^\d{1,4}$/.test(text)) {
        el.textContent = String(pageNum);
        if (!el.style.textAlign) el.style.textAlign = 'center';
      }
    });
  }
}

/** @deprecated Use resolveNativePageNumbers — alias for older call sites */
export function injectPageNumbers(container: HTMLElement, className = 'docx-exact'): number {
  return resolveNativePageNumbers(container, className);
}

function resolvePageFieldsInElement(root: Element, pageNum: number, total: number): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }

  for (const textNode of nodes) {
    const raw = textNode.nodeValue ?? '';
    if (!raw.trim()) continue;

    let next = raw
      .replace(/\bPAGE\b/gi, String(pageNum))
      .replace(/\bNUMPAGES\b/gi, String(total))
      .replace(/\bPAGEREF\b/gi, String(pageNum));

    const parent = textNode.parentElement;
    if (parent?.closest('header, footer')) {
      const parentText = (parent.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^\d{1,4}$/.test(parentText)) {
        next = String(pageNum);
      } else if (/^\d{1,4}$/.test(raw.trim())) {
        const siblingText = Array.from(parent.childNodes)
          .filter((n) => n !== textNode)
          .map((n) => n.textContent || '')
          .join('')
          .replace(/\s+/g, ' ')
          .trim();
        if (!siblingText || /page|of|\/|-|#/i.test(siblingText) || siblingText.length <= 8) {
          next = raw.replace(/\d{1,4}/, String(pageNum));
        }
      }

      next = next
        .replace(/\bPage\s+\d{1,4}\s+of\s+\d{1,4}\b/gi, `Page ${pageNum} of ${total}`)
        .replace(/\b\d{1,4}\s+of\s+\d{1,4}\b/gi, `${pageNum} of ${total}`)
        .replace(/\b\d{1,4}\s*\/\s*\d{1,4}\b/g, `${pageNum} / ${total}`);
    }

    if (next !== raw) textNode.nodeValue = next;
  }
}

/** Build a self-contained HTML document from the Exact Word view DOM. */
export function buildExactHtmlDocument(options: {
  styleHtml: string;
  bodyHtml: string;
  title: string;
  originalDocxBase64?: string;
  pageCount?: number;
}): string {
  const meta: ExactHtmlMeta = {
    format: EXACT_HTML_FORMAT,
    generator: GENERATOR_NAME,
    view: 'exact',
    exportedAt: new Date().toISOString(),
    title: options.title,
    documentFormat: DOCUMENT_FORMAT,
    originalDocxBase64: options.originalDocxBase64,
    pageCount: options.pageCount,
  };

  const extraCss = `
  html, body { margin: 0; padding: 0; background: #e8eaee; }
  body { padding: 32px 24px; font-family: Calibri, Arial, sans-serif; }
  .docx-exact-wrapper { background: transparent !important; padding: 0 !important; display: flex; flex-direction: column; align-items: center; gap: 24px; }
  section.docx-exact {
    background: #fff !important;
    box-shadow: 0 1px 3px rgba(0,0,0,.08);
    margin: 0 auto !important;
    position: relative !important;
    overflow: hidden !important;
    box-sizing: border-box;
    max-width: none !important;
    width: ${A4_WIDTH_IN}in !important;
    min-height: ${A4_HEIGHT_IN}in !important;
    height: ${A4_HEIGHT_IN}in !important;
  }
  section.docx-exact > header {
    display: flex !important;
    flex-direction: column !important;
    visibility: visible !important;
    opacity: 1 !important;
    flex-shrink: 0 !important;
    margin: 0 !important;
    justify-content: flex-end !important;
  }
  section.docx-exact > footer {
    position: absolute !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    visibility: visible !important;
    opacity: 1 !important;
    margin: 0 !important;
    z-index: 20 !important;
    color: #000 !important;
    min-height: 0.6in !important;
  }
  section.docx-exact > footer p,
  section.docx-exact > footer span {
    color: #000 !important;
    visibility: visible !important;
  }
  section.docx-exact > article {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    overflow: hidden !important;
  }
  @media print {
    body { background: #fff; padding: 0; }
    section.docx-exact { box-shadow: none; page-break-after: always; overflow: hidden !important; }
  }
`.trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="generator" content="${GENERATOR_NAME}">
<meta name="document-format" content="${EXACT_HTML_FORMAT}">
<meta name="view" content="exact">
<title>${escapeHtml(options.title)}</title>
<style id="buildesk-exact-chrome">
${extraCss}
</style>
${options.styleHtml}
</head>
<body>
${options.bodyHtml}
<script type="application/json" id="document-metadata">
${JSON.stringify(
  {
    ...meta,
    originalDocxBase64: undefined,
  },
  null,
  2,
)}
</script>
</body>
</html>`;
}

export function detectExactHtml(html: string): {
  isExact: boolean;
  meta: ExactHtmlMeta | null;
  styleHtml: string;
  bodyHtml: string;
} {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const metaEl = doc.getElementById('document-metadata');
    let meta: ExactHtmlMeta | null = null;
    if (metaEl?.textContent) {
      const parsed = JSON.parse(metaEl.textContent) as ExactHtmlMeta;
      if (parsed?.format === EXACT_HTML_FORMAT || parsed?.view === 'exact') {
        meta = parsed;
      }
    }
    const formatMeta = doc.querySelector('meta[name="document-format"]')?.getAttribute('content');
    const isExact =
      !!meta
      || formatMeta === EXACT_HTML_FORMAT
      || doc.querySelector('meta[name="view"][content="exact"]') !== null
      || !!doc.querySelector('section.docx-exact, .docx-exact-wrapper');

    if (!isExact) {
      return { isExact: false, meta: null, styleHtml: '', bodyHtml: '' };
    }

    const styles = Array.from(doc.querySelectorAll('style'))
      .map((s) => s.outerHTML)
      .join('\n');
    const bodyClone = doc.body.cloneNode(true) as HTMLElement;
    bodyClone.querySelector('#document-metadata')?.remove();
    return {
      isExact: true,
      meta,
      styleHtml: styles,
      bodyHtml: bodyClone.innerHTML,
    };
  } catch {
    return { isExact: false, meta: null, styleHtml: '', bodyHtml: '' };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
