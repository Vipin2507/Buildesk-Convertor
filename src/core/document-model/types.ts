/**
 * Canonical internal document model.
 * DOCX, HTML, and the visual editor all serialize to/from this structure.
 */

export type Align = 'left' | 'center' | 'right' | 'justify';

export interface TextMarks {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  textColor?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontFamily?: string;
}

/** Block-level spacing / typography preserved from Word. */
export interface BlockStyle {
  marginTop?: string;
  marginBottom?: string;
  lineHeight?: string | number;
  fontSize?: string;
  fontFamily?: string;
  textColor?: string;
  indentLeft?: string;
  indentRight?: string;
  indentFirstLine?: string;
}

export interface CellBorder {
  width?: string;
  color?: string;
  style?: string;
}

export interface CellBorders {
  top?: CellBorder;
  right?: CellBorder;
  bottom?: CellBorder;
  left?: CellBorder;
}

export interface TextInline {
  type: 'text';
  text: string;
  marks?: TextMarks;
}

export interface LinkInline {
  type: 'link';
  href: string;
  title?: string;
  children: TextInline[];
}

export type InlineNode = TextInline | LinkInline;

export interface ParagraphBlock {
  type: 'paragraph';
  id: string;
  align?: Align;
  style?: BlockStyle;
  children: InlineNode[];
}

export interface HeadingBlock {
  type: 'heading';
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  align?: Align;
  style?: BlockStyle;
  children: InlineNode[];
}

export interface ListItemNode {
  type: 'listItem';
  id: string;
  children: BlockNode[];
}

export interface BulletListBlock {
  type: 'bulletList';
  id: string;
  items: ListItemNode[];
}

export interface OrderedListBlock {
  type: 'orderedList';
  id: string;
  start?: number;
  items: ListItemNode[];
}

export interface TableCellNode {
  type: 'tableCell' | 'tableHeader';
  id: string;
  colspan?: number;
  rowspan?: number;
  backgroundColor?: string;
  width?: string;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  borders?: CellBorders;
  padding?: string;
  children: BlockNode[];
}

export interface TableRowNode {
  type: 'tableRow';
  id: string;
  cells: TableCellNode[];
  height?: string;
}

export interface TableBlock {
  type: 'table';
  id: string;
  rows: TableRowNode[];
  width?: string;
}

export interface ImageBlock {
  type: 'image';
  id: string;
  assetId: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
  align?: Align;
}

export interface BlockquoteBlock {
  type: 'blockquote';
  id: string;
  children: BlockNode[];
}

export interface HorizontalRuleBlock {
  type: 'horizontalRule';
  id: string;
}

export interface PageBreakBlock {
  type: 'pageBreak';
  id: string;
}

export type BlockNode =
  | ParagraphBlock
  | HeadingBlock
  | BulletListBlock
  | OrderedListBlock
  | TableBlock
  | ImageBlock
  | BlockquoteBlock
  | HorizontalRuleBlock
  | PageBreakBlock;

export interface DocumentAsset {
  id: string;
  type: 'image';
  mimeType: string;
  data: string;
  width?: number;
  height?: number;
  originalName?: string;
}

export interface DocumentMetadata {
  title: string;
  author?: string;
  subject?: string;
  creator?: string;
  createdAt?: string;
  modifiedAt?: string;
  source: 'docx' | 'html' | 'blank' | 'restored';
  filename?: string;
}

export interface UnsupportedElement {
  kind: string;
  detail?: string;
  preserved?: unknown;
}

export interface DocumentDefaults {
  fontFamily?: string;
  fontSize?: string;
  lineHeight?: string | number;
  textColor?: string;
}

export interface DocumentModel {
  version: 1;
  metadata: DocumentMetadata;
  blocks: BlockNode[];
  assets: DocumentAsset[];
  styles: Record<string, unknown>;
  defaults?: DocumentDefaults;
  relationships: unknown[];
  originalDocxMetadata?: Record<string, unknown>;
  unsupportedElements: UnsupportedElement[];
  roundTripMeta?: Record<string, unknown>;
}

export const DOCUMENT_FORMAT = 'docx-roundtrip-v1';
export const GENERATOR_NAME = 'Buildesk Convertor';
