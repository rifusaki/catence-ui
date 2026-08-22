import { describe, expect, it } from 'vitest';

import { dependentSnapValue, resolveDynamicInput } from './dynamicOptions';

const modelCases = {
  watchId: 'model',
  cases: {
    'openai:gpt-5': {
      items: [
        { label: 'Provider default', value: 'default' },
        { label: 'Low', value: 'low' },
        { label: 'High', value: 'high' }
      ],
      initialValue: 'default'
    },
    'openai:o4-mini': {
      items: [],
      disabled: true,
      initialValue: 'default'
    },
    'openai:mimo': {
      items: [
        { label: 'Provider default', value: 'default' },
        { label: 'Max', value: 'max' }
      ],
      initialValue: 'default',
      resetValue: 'max'
    }
  }
};

const effortInput = {
  id: 'reasoningEffort',
  type: 'select',
  items: [{ label: 'Provider default', value: 'default' }],
  dynamicOptions: modelCases
};

describe('resolveDynamicInput', () => {
  it('overlays the case matching the watched form value', () => {
    const resolved = resolveDynamicInput(effortInput, { model: 'openai:mimo' });
    expect(resolved.items).toEqual([
      { label: 'Provider default', value: 'default' },
      { label: 'Max', value: 'max' }
    ]);
    expect(resolved.resetValue).toBe('max');
  });

  it('keeps static fields when no case matches the watched value', () => {
    const resolved = resolveDynamicInput(effortInput, {
      model: 'unknown:model'
    });
    expect(resolved.items).toEqual(effortInput.items);
    expect(resolved.disabled).toBeUndefined();
  });

  it('returns inputs without dynamicOptions unchanged', () => {
    const plain = { id: 'athleteId', type: 'select' };
    expect(resolveDynamicInput(plain, { model: 'x' })).toEqual(plain);
  });
});

describe('dependentSnapValue', () => {
  it('snaps an invalid effort to the new case initial when the model changes', () => {
    const snap = dependentSnapValue(effortInput, {
      model: 'openai:gpt-5',
      reasoningEffort: 'xhigh'
    });
    expect(snap).toBe('default');
  });

  it('keeps a still-valid effort across models', () => {
    const snap = dependentSnapValue(effortInput, {
      model: 'openai:gpt-5',
      reasoningEffort: 'low'
    });
    expect(snap).toBeUndefined();
  });

  it('clears the value when the active model disables effort entirely', () => {
    const snap = dependentSnapValue(effortInput, {
      model: 'openai:o4-mini',
      reasoningEffort: 'high'
    });
    expect(snap).toBeNull();
  });

  it('ignores empty current values and non-dynamic inputs', () => {
    expect(
      dependentSnapValue(effortInput, {
        model: 'openai:gpt-5',
        reasoningEffort: ''
      })
    ).toBeUndefined();
    expect(
      dependentSnapValue({ id: 'toolRounds' }, { toolRounds: 99 })
    ).toBeUndefined();
  });
});
