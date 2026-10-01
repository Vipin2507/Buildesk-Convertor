import { z } from 'zod';
import type { DocumentModel } from './types';

export const documentModelSchema = z.object({
  version: z.literal(1),
  metadata: z.object({
    title: z.string(),
    author: z.string().optional(),
    subject: z.string().optional(),
    creator: z.string().optional(),
    createdAt: z.string().optional(),
    modifiedAt: z.string().optional(),
    source: z.enum(['docx', 'html', 'blank', 'restored']),
    filename: z.string().optional(),
  }),
  blocks: z.array(z.record(z.string(), z.unknown())),
  assets: z.array(z.record(z.string(), z.unknown())),
  styles: z.record(z.string(), z.unknown()),
  relationships: z.array(z.unknown()),
  unsupportedElements: z.array(z.unknown()).optional(),
});

export function isDocumentModel(value: unknown): value is DocumentModel {
  return documentModelSchema.safeParse(value).success;
}
