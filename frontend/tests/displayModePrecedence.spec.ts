import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LS_DISPLAY_MODE_KEY,
  resolveDisplayMode
} from '../../libs/copilot/src/resolveDisplayMode';

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key)
};

describe('resolveDisplayMode – config vs localStorage precedence', () => {
  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', storage);
  });

  it('explicit config wins over localStorage', () => {
    localStorage.setItem(LS_DISPLAY_MODE_KEY, 'floating');
    expect(resolveDisplayMode('sidebar')).toBe('sidebar');
  });

  it('falls back to localStorage when config omits displayMode', () => {
    localStorage.setItem(LS_DISPLAY_MODE_KEY, 'sidebar');
    expect(resolveDisplayMode(undefined)).toBe('sidebar');
  });

  it('defaults to floating when neither config nor localStorage is set', () => {
    expect(resolveDisplayMode(undefined)).toBe('floating');
  });
});
