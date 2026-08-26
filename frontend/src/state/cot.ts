import { type AtomEffect, atom } from 'recoil';

export type CotMode = 'hidden' | 'tool_call' | 'full';

const STORAGE_KEY = 'catence.cotOverride';

const cotLocalStorageEffect: AtomEffect<CotMode | undefined> = ({
  setSelf,
  onSet
}) => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved != null) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed === 'hidden' || parsed === 'tool_call' || parsed === 'full') {
        setSelf(parsed);
      }
    } catch {
      // Ignore corrupt persisted value; fall back to config default.
    }
  }

  onSet((newValue, _oldValue, isReset) => {
    if (isReset || newValue === undefined) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newValue));
    }
  });
};

/**
 * Runtime override for chain-of-thought display. `undefined` means "use the
 * server `config.ui.cot` default"; otherwise it wins over config. Persisted to
 * localStorage so a page refresh keeps the user's choice.
 */
export const cotOverrideState = atom<CotMode | undefined>({
  key: 'CotOverride',
  default: undefined,
  effects: [cotLocalStorageEffect]
});
