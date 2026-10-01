import type {
  Align,
  BlockNode,
  BlockStyle,
  CellBorder,
  CellBorders,
  DocumentModel,
  InlineNode,
  TextMarks,
} from '../document-model/types';
import { DOCUMENT_FORMAT, GENERATOR_NAME } from '../document-model/types';
import { sanitizeHtml } from '../sanitization/sanitize';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function marksToOpenClose(marks?: TextMarks): { open: string; close: string } {
  if (!marks) return { open: '', close: '' };
  const open: string[] = [];
  const close: string[] = [];
  const styles: string[] = [];

  if (marks.fontFamily) styles.push(`font-family: '${marks.fontFamily.replace(/'/g, "\\'")}', serif`);
  if (marks.fontSize) styles.push(`font-size: ${marks.fontSize}`);
  if (marks.textColor) styles.push(`color: ${marks.textColor}`);
  if (marks.backgroundColor) styles.push(`background-color: ${marks.backgroundColor}`);

  if (styles.length) {
    open.push(`<span style="${styles.join('; ')}">`);
    close.unshift('</span>');
  }
  if (marks.code) {
    open.push('<code>');
    close.unshift('</code>');
  }
  if (marks.bold) {
    open.push('<strong>');
    close.unshift('</strong>');
  }
  if (marks.italic) {
    open.push('<em>');
    close.unshift('</em>');
  }
  if (marks.underline) {
    open.push('<u>');
    close.unshift('</u>');
  }
  if (marks.strike) {
    open.push('<s>');
    close.unshift('</s>');
  }

  return { open: open.join(''), close: close.join('') };
}

function serializeInlines(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'link') {
        const inner = serializeInlines(node.children);
        const title = node.title ? ` title="${escapeHtml(node.title)}"` : '';
        return `<a href="${escapeHtml(node.href)}"${title}>${inner}</a>`;
      }
      const { open, close } = marksToOpenClose(node.marks);
      const text = escapeHtml(node.text).replace(/\n/g, '<br>');
      return `${open}${text}${close}`;
    })
    .join('');
}

export function blockStyleToCss(style?: BlockStyle, align?: Align): string {
  const parts: string[] = [];
  if (align) parts.push(`text-align: ${align}`);
  if (!style) return parts.join('; ');
  if (style.marginTop) parts.push(`margin-top: ${style.marginTop}`);
  if (style.marginBottom) parts.push(`margin-bottom: ${style.marginBottom}`);
  if (style.lineHeight !== undefined) parts.push(`line-height: ${style.lineHeight}`);
  if (style.fontSize) parts.push(`font-size: ${style.fontSize}`);
  if (style.fontFamily) parts.push(`font-family: '${style.fontFamily.replace(/'/g, "\\'")}', serif`);
  if (style.textColor) parts.push(`color: ${style.textColor}`);
  if (style.indentLeft) parts.push(`padding-left: ${style.indentLeft}`);
  if (style.indentRight) parts.push(`padding-right: ${style.indentRight}`);
  if (style.indentFirstLine) parts.push(`text-indent: ${style.indentFirstLine}`);
  return parts.join('; ');
}

function styleAttr(style?: BlockStyle, align?: Align): string {
  const css = blockStyleToCss(style, align);
  return css ? ` style="${css}"` : '';
}

function borderCss(side: string, border?: CellBorder): string | null {
  if (!border) return null;
  if (border.style === 'none' || border.width === '0') {
    return `border-${side}: none`;
  }
  return `border-${side}: ${border.width || '1px'} ${border.style || 'solid'} ${border.color || '#000'}`;
}

function cellStyleAttr(cell: {
  backgroundColor?: string;
  width?: string;
  verticalAlign?: string;
  borders?: CellBorders;
  padding?: string;
}): string {
  const parts: string[] = [];
  if (cell.backgroundColor) parts.push(`background-color: ${cell.backgroundColor}`);
  if (cell.width) parts.push(`width: ${cell.width}`);
  if (cell.verticalAlign) parts.push(`vertical-align: ${cell.verticalAlign}`);
  if (cell.padding) parts.push(`padding: ${cell.padding}`);
  if (cell.borders) {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const css = borderCss(side, cell.borders[side]);
      if (css) parts.push(css);
    }
  }
  return parts.length ? ` style="${parts.join('; ')}"` : '';
}

function serializeBlocks(blocks: BlockNode[], doc: DocumentModel): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'paragraph':
          return `<p${styleAttr(block.style, block.align)}>${serializeInlines(block.children)}</p>`;
        case 'heading':
          return `<h${block.level}${styleAttr(block.style, block.align)}>${serializeInlines(block.children)}</h${block.level}>`;
        case 'bulletList':
          return `<ul>${block.items
            .map((item) => `<li>${serializeBlocks(item.children, doc)}</li>`)
            .join('')}</ul>`;
        case 'orderedList': {
          const start = block.start && block.start !== 1 ? ` start="${block.start}"` : '';
          return `<ol${start}>${block.items
            .map((item) => `<li>${serializeBlocks(item.children, doc)}</li>`)
            .join('')}</ol>`;
        }
        case 'blockquote':
          return `<blockquote>${serializeBlocks(block.children, doc)}</blockquote>`;
        case 'horizontalRule':
          return '<hr>';
        case 'pageBreak':
          return '<hr class="page-break" data-type="page-break">';
        case 'image': {
          const asset = doc.assets.find((a) => a.id === block.assetId);
          if (!asset) return '';
          const w = block.width ? ` width="${block.width}"` : '';
          const h = block.height ? ` height="${block.height}"` : '';
          const alt = block.alt ? ` alt="${escapeHtml(block.alt)}"` : ' alt=""';
          return `<img src="${asset.data}"${alt}${w}${h}>`;
        }
        case 'table': {
          const tableStyle = block.width ? ` style="width: ${block.width}"` : '';
          return `<table${tableStyle}>${block.rows
            .map((row) => {
              const rowStyle = row.height ? ` style="height: ${row.height}"` : '';
              return `<tr${rowStyle}>${row.cells
                .map((cell) => {
                  const tag = cell.type === 'tableHeader' ? 'th' : 'td';
                  const colspan =
                    cell.colspan && cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '';
                  const rowspan =
                    cell.rowspan && cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '';
                  return `<${tag}${colspan}${rowspan}${cellStyleAttr(cell)}>${serializeBlocks(cell.children, doc)}</${tag}>`;
                })
                .join('')}</tr>`;
            })
            .join('')}</table>`;
        }
        default:
          return '';
      }
    })
    .join('\n');
}

function defaultsCss(doc: DocumentModel): string {
  const d = doc.defaults;
  const font = d?.fontFamily ? `'${d.fontFamily}', Times, serif` : '"Times New Roman", Times, Georgia, serif';
  const size = d?.fontSize ?? '11pt';
  const line = d?.lineHeight ?? 1.15;
  const color = d?.textColor ?? '#000000';
  return `
  body { font-family: ${font}; font-size: ${size}; line-height: ${line}; color: ${color}; max-width: 794px; margin: 0 auto; padding: 48px 24px; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.3; }
  p { margin: 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; table-layout: fixed; }
  td, th { border: 1px solid #bfbfbf; padding: 4px 8px; vertical-align: top; }
  img { max-width: 100%; height: auto; }
  blockquote { border-left: 3px solid #ccc; margin: 0.75em 0; padding-left: 1em; color: #444; }
  hr.page-break { border: none; border-top: 1px dashed #999; margin: 2em 0; page-break-after: always; }
  a { color: #0563c1; }
`.trim();
}

export function modelToBodyHtml(doc: DocumentModel): string {
  return serializeBlocks(doc.blocks, doc);
}

export function modelToHtml(doc: DocumentModel, options?: { pretty?: boolean }): string {
  const body = modelToBodyHtml(doc);
  const metaPayload = {
    format: DOCUMENT_FORMAT,
    generator: GENERATOR_NAME,
    exportedAt: new Date().toISOString(),
    model: doc,
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="generator" content="${GENERATOR_NAME}">
<meta name="document-format" content="${DOCUMENT_FORMAT}">
<title>${escapeHtml(doc.metadata.title)}</title>
<style>
${defaultsCss(doc)}
</style>
</head>
<body>
${body}
<script type="application/json" id="document-metadata">
${JSON.stringify(metaPayload, null, 2)}
</script>
</body>
</html>`;

  const sanitizedBody = sanitizeHtml(body);
  const safe = html.replace(body, sanitizedBody);

  if (options?.pretty === false) return safe;
  return safe;
}

/** TipTap-friendly body fragment (no document wrapper). */
export function modelToEditorHtml(doc: DocumentModel): string {
  const body = modelToBodyHtml(doc) || '<p></p>';
  // Wrap with a style hint via data attributes on a container TipTap will unwrap —
  // instead inject defaults as CSS variables on first paragraph if needed.
  return sanitizeHtml(body);
}
