import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  ExternalHyperlink,
  WidthType,
  type IBorderOptions,
  type FileChild,
} from 'docx';
import type {
  Align,
  BlockNode,
  DocumentModel,
  InlineNode,
  TextInline,
  TextMarks,
} from '../document-model/types';

function mapAlign(align?: Align) {
  switch (align) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    case 'justify':
      return AlignmentType.BOTH;
    default:
      return AlignmentType.LEFT;
  }
}

function parseColor(color?: string): string | undefined {
  if (!color) return undefined;
  const hex = color.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
    const h = hex.slice(1);
    if (h.length === 3) {
      return h
        .split('')
        .map((c) => c + c)
        .join('')
        .toUpperCase();
    }
    return h.toUpperCase();
  }
  const rgb = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i.exec(hex);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map((n) => Number(n).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }
  return undefined;
}

function parseFontSizeHalfPoints(size?: string): number | undefined {
  if (!size) return undefined;
  const px = /^(\d+(?:\.\d+)?)\s*px$/i.exec(size);
  if (px) return Math.round(Number(px[1]) * 1.5); // approx px → half-points
  const pt = /^(\d+(?:\.\d+)?)\s*pt$/i.exec(size);
  if (pt) return Math.round(Number(pt[1]) * 2);
  return undefined;
}

function textRunFromInline(node: TextInline): TextRun {
  const marks: TextMarks = node.marks ?? {};
  return new TextRun({
    text: node.text,
    bold: marks.bold,
    italics: marks.italic,
    underline: marks.underline ? {} : undefined,
    strike: marks.strike,
    color: parseColor(marks.textColor),
    highlight: marks.backgroundColor ? 'yellow' : undefined,
    size: parseFontSizeHalfPoints(marks.fontSize),
    font: marks.fontFamily,
  });
}

function inlinesToRuns(nodes: InlineNode[]): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      runs.push(textRunFromInline(node));
    } else {
      runs.push(
        new ExternalHyperlink({
          children: node.children.map(textRunFromInline),
          link: node.href,
        }),
      );
    }
  }
  return runs.length ? runs : [new TextRun('')];
}

const thinBorder: IBorderOptions = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: 'BFBFBF',
};

const headingMap = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
} as const;

function dataUrlToUint8Array(dataUrl: string): { bytes: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp' } {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error('Unsupported image data');
  }
  const mime = match[1].toLowerCase();
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  let type: 'png' | 'jpg' | 'gif' | 'bmp' = 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) type = 'jpg';
  else if (mime.includes('gif')) type = 'gif';
  else if (mime.includes('bmp')) type = 'bmp';
  return { bytes, type };
}

function blocksToChildren(blocks: BlockNode[], doc: DocumentModel): FileChild[] {
  const children: FileChild[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
        children.push(
          new Paragraph({
            alignment: mapAlign(block.align),
            children: inlinesToRuns(block.children),
            spacing: { after: 120 },
          }),
        );
        break;
      case 'heading':
        children.push(
          new Paragraph({
            heading: headingMap[block.level],
            alignment: mapAlign(block.align),
            children: inlinesToRuns(block.children),
            spacing: { before: 200, after: 120 },
          }),
        );
        break;
      case 'bulletList':
        for (const item of block.items) {
          for (const child of item.children) {
            if (child.type === 'paragraph') {
              children.push(
                new Paragraph({
                  children: inlinesToRuns(child.children),
                  bullet: { level: 0 },
                }),
              );
            } else {
              children.push(...blocksToChildren([child], doc));
            }
          }
        }
        break;
      case 'orderedList':
        for (const item of block.items) {
          for (const child of item.children) {
            if (child.type === 'paragraph') {
              children.push(
                new Paragraph({
                  children: inlinesToRuns(child.children),
                  numbering: { reference: 'numbered-list', level: 0 },
                }),
              );
            } else {
              children.push(...blocksToChildren([child], doc));
            }
          }
        }
        break;
      case 'blockquote':
        for (const child of block.children) {
          if (child.type === 'paragraph') {
            children.push(
              new Paragraph({
                children: inlinesToRuns(child.children),
                indent: { left: 420 },
                border: {
                  left: { style: BorderStyle.SINGLE, size: 12, color: 'AAAAAA', space: 8 },
                },
              }),
            );
          } else {
            children.push(...blocksToChildren([child], doc));
          }
        }
        break;
      case 'horizontalRule':
        children.push(
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 },
            },
            children: [],
          }),
        );
        break;
      case 'pageBreak':
        children.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case 'image': {
        const asset = doc.assets.find((a) => a.id === block.assetId);
        if (!asset?.data.startsWith('data:')) break;
        try {
          const { bytes, type } = dataUrlToUint8Array(asset.data);
          const width = Math.min(block.width ?? asset.width ?? 400, 550);
          const height = block.height ?? asset.height ?? Math.round(width * 0.75);
          children.push(
            new Paragraph({
              alignment: mapAlign(block.align),
              children: [
                new ImageRun({
                  type,
                  data: bytes,
                  transformation: { width, height },
                }),
              ],
            }),
          );
        } catch {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: block.alt || '[image]', italics: true })],
            }),
          );
        }
        break;
      }
      case 'table': {
        const rows = block.rows.map(
          (row) =>
            new TableRow({
              children: row.cells.map((cell) => {
                const cellParas = blocksToChildren(cell.children, doc).filter(
                  (c): c is Paragraph => c instanceof Paragraph,
                );
                return new TableCell({
                  borders: {
                    top: thinBorder,
                    bottom: thinBorder,
                    left: thinBorder,
                    right: thinBorder,
                  },
                  width: { size: Math.floor(9000 / Math.max(row.cells.length, 1)), type: WidthType.DXA },
                  shading: cell.backgroundColor
                    ? { fill: parseColor(cell.backgroundColor) ?? 'FFFFFF' }
                    : undefined,
                  columnSpan: cell.colspan && cell.colspan > 1 ? cell.colspan : undefined,
                  rowSpan: cell.rowspan && cell.rowspan > 1 ? cell.rowspan : undefined,
                  children:
                    cellParas.length > 0
                      ? cellParas
                      : [new Paragraph({ children: [new TextRun('')] })],
                });
              }),
            }),
        );
        children.push(
          new Table({
            rows,
            width: { size: 9000, type: WidthType.DXA },
          }),
        );
        break;
      }
      default:
        break;
    }
  }

  return children.length ? children : [new Paragraph({ children: [new TextRun('')] })];
}

export async function modelToDocx(doc: DocumentModel): Promise<Blob> {
  const children = blocksToChildren(doc.blocks, doc);

  const document = new Document({
    creator: doc.metadata.creator || doc.metadata.author || 'Buildesk Convertor',
    title: doc.metadata.title,
    subject: doc.metadata.subject,
    description: 'Generated by Buildesk Convertor',
    numbering: {
      config: [
        {
          reference: 'numbered-list',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Packer.toBlob(document);
}
