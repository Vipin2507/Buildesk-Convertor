export type ChangeSource =
  | 'USER_VISUAL_EDITOR'
  | 'USER_HTML_EDITOR'
  | 'IMPORT'
  | 'PROGRAMMATIC'
  | 'RESTORE'
  | 'HISTORY';

export interface SyncTransaction {
  id: number;
  source: ChangeSource;
  timestamp: number;
}

export class SyncEngine {
  private lastAppliedSource: ChangeSource | null = null;
  private transactionId = 0;
  private applying = false;

  begin(source: ChangeSource): SyncTransaction {
    this.transactionId += 1;
    this.lastAppliedSource = source;
    return {
      id: this.transactionId,
      source,
      timestamp: Date.now(),
    };
  }

  /** Returns false if this update should be ignored to prevent loops. */
  shouldPropagate(source: ChangeSource, target: 'visual' | 'html' | 'model'): boolean {
    if (this.applying) return false;
    if (source === 'PROGRAMMATIC') return false;

    if (target === 'html' && source === 'USER_HTML_EDITOR') return false;
    if (target === 'visual' && source === 'USER_VISUAL_EDITOR') return false;

    return true;
  }

  getLastSource(): ChangeSource | null {
    return this.lastAppliedSource;
  }

  runProtected<T>(fn: () => T): T {
    this.applying = true;
    try {
      return fn();
    } finally {
      this.applying = false;
    }
  }

  async runProtectedAsync<T>(fn: () => Promise<T>): Promise<T> {
    this.applying = true;
    try {
      return await fn();
    } finally {
      this.applying = false;
    }
  }

  isApplying(): boolean {
    return this.applying;
  }
}

export const syncEngine = new SyncEngine();
