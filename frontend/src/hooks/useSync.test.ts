import { describe, expect, it } from 'vitest';

import { buildSyncStartBody } from './useSync';

describe('buildSyncStartBody', () => {
  it('builds the incremental sync body by default', () => {
    expect(buildSyncStartBody('alex')).toEqual({
      body: {
        athleteId: 'alex',
        provider: 'all',
        refresh: false,
        refreshModels: true
      }
    });
    expect(buildSyncStartBody('alex', {})).toEqual({
      body: {
        athleteId: 'alex',
        provider: 'all',
        refresh: false,
        refreshModels: true
      }
    });
    expect(buildSyncStartBody('alex', { backfill: false })).toEqual({
      body: {
        athleteId: 'alex',
        provider: 'all',
        refresh: false,
        refreshModels: true
      }
    });
  });

  it('builds the backfill body with the trimmed from date', () => {
    expect(
      buildSyncStartBody('alex', { backfill: true, from: ' 2026-07-01 ' })
    ).toEqual({
      body: {
        athleteId: 'alex',
        provider: 'all',
        backfill: true,
        from: '2026-07-01'
      }
    });
  });

  it('refuses a backfill without a valid from date', () => {
    for (const options of [
      { backfill: true },
      { backfill: true, from: '' },
      { backfill: true, from: '   ' },
      { backfill: true, from: '01-07-2026' },
      { backfill: true, from: '2026-7-1' },
      { backfill: true, from: 'not-a-date' }
    ]) {
      expect(buildSyncStartBody('alex', options)).toEqual({
        error: 'Backfill needs a start date in YYYY-MM-DD format.'
      });
    }
  });
});
