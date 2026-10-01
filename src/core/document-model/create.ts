import type {
  BlockNode,
  DocumentAsset,
  DocumentMetadata,
  DocumentModel,
  InlineNode,
  ParagraphBlock,
  TextInline,
} from './types';

let idCounter = 0;

export function createId(prefix = 'n'): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function resetIdCounter(): void {
  idCounter = 0;
}

export function createText(text: string, marks?: TextInline['marks']): TextInline {
  return marks ? { type: 'text', text, marks } : { type: 'text', text };
}

export function createParagraph(
  children: InlineNode[] = [createText('')],
  align?: ParagraphBlock['align'],
): ParagraphBlock {
  return {
    type: 'paragraph',
    id: createId('p'),
    ...(align ? { align } : {}),
    children,
  };
}

export function createBlankDocument(title = 'Untitled Document'): DocumentModel {
  const now = new Date().toISOString();
  return {
    version: 1,
    metadata: {
      title,
      source: 'blank',
      createdAt: now,
      modifiedAt: now,
      filename: `${title}.docx`,
    },
    blocks: [createParagraph()],
    assets: [],
    styles: {},
    relationships: [],
    unsupportedElements: [],
  };
}

export function createDocumentFromParts(options: {
  metadata: Partial<DocumentMetadata> & Pick<DocumentMetadata, 'title' | 'source'>;
  blocks: BlockNode[];
  assets?: DocumentAsset[];
  unsupportedElements?: DocumentModel['unsupportedElements'];
  originalDocxMetadata?: Record<string, unknown>;
}): DocumentModel {
  const now = new Date().toISOString();
  return {
    version: 1,
    metadata: {
      createdAt: now,
      modifiedAt: now,
      ...options.metadata,
    },
    blocks: options.blocks.length > 0 ? options.blocks : [createParagraph()],
    assets: options.assets ?? [],
    styles: {},
    relationships: [],
    unsupportedElements: options.unsupportedElements ?? [],
    originalDocxMetadata: options.originalDocxMetadata,
  };
}

export function cloneDocument(doc: DocumentModel): DocumentModel {
  return structuredClone(doc);
}

export function touchDocument(doc: DocumentModel): DocumentModel {
  return {
    ...doc,
    metadata: {
      ...doc.metadata,
      modifiedAt: new Date().toISOString(),
    },
  };
}

export function countWords(doc: DocumentModel): number {
  const text = extractPlainText(doc);
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

export function extractPlainText(doc: DocumentModel): string {
  const parts: string[] = [];

  const walkInline = (nodes: InlineNode[]) => {
    for (const node of nodes) {
      if (node.type === 'text') parts.push(node.text);
      else walkInline(node.children);
    }
  };

  const walkBlocks = (blocks: BlockNode[]) => {
    for (const block of blocks) {
      switch (block.type) {
        case 'paragraph':
        case 'heading':
          walkInline(block.children);
          parts.push('\n');
          break;
        case 'bulletList':
        case 'orderedList':
          for (const item of block.items) walkBlocks(item.children);
          break;
        case 'table':
          for (const row of block.rows) {
            for (const cell of row.cells) walkBlocks(cell.children);
          }
          break;
        case 'blockquote':
          walkBlocks(block.children);
          break;
        case 'image':
          parts.push(block.alt ?? '[image]');
          parts.push('\n');
          break;
        default:
          break;
      }
    }
  };

  walkBlocks(doc.blocks);
  return parts.join('');
}
