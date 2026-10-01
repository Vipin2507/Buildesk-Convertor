import { describe, expect, it, beforeEach } from 'vitest';
import { applyThemeToDocument, readStoredTheme, writeStoredTheme } from '../lib/theme';

describe('theme hydration', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('bc-theme');
    } catch {
      /* ignore */
    }
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to light when storage empty', () => {
    expect(readStoredTheme()).toBe('light');
  });

  it('persists and reads theme', () => {
    writeStoredTheme('dark');
    expect(readStoredTheme()).toBe('dark');
    applyThemeToDocument('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('survives blocked localStorage reads', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(readStoredTheme()).toBe('light');
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
