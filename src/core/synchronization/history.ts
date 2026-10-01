import type { DocumentModel } from '../document-model/types';
import { cloneDocument } from '../document-model/create';

const MAX_HISTORY = 50;

export class DocumentHistory {
  private undoStack: DocumentModel[] = [];
  private redoStack: DocumentModel[] = [];
  private current: DocumentModel | null = null;

  reset(doc: DocumentModel): void {
    this.current = cloneDocument(doc);
    this.undoStack = [];
    this.redoStack = [];
  }

  clear(): void {
    this.current = null;
    this.undoStack = [];
    this.redoStack = [];
  }

  getCurrent(): DocumentModel | null {
    return this.current ? cloneDocument(this.current) : null;
  }

  push(doc: DocumentModel): void {
    if (this.current) {
      this.undoStack.push(this.current);
      if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    }
    this.current = cloneDocument(doc);
    this.redoStack = [];
  }

  /** Update current without creating history (for sync from same logical edit). */
  replaceCurrent(doc: DocumentModel): void {
    this.current = cloneDocument(doc);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): DocumentModel | null {
    if (!this.canUndo() || !this.current) return null;
    this.redoStack.push(this.current);
    this.current = this.undoStack.pop()!;
    return cloneDocument(this.current);
  }

  redo(): DocumentModel | null {
    if (!this.canRedo() || !this.current) return null;
    this.undoStack.push(this.current);
    this.current = this.redoStack.pop()!;
    return cloneDocument(this.current);
  }
}
