import { describe, expect, it } from 'vitest';

import { buildSyncStartBody, trainingpeaksAuthExpired } from './useSync';

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

describe('trainingpeaksAuthExpired', () => {
  it('flags a completed TrainingPeaks run that finished with errors', () => {
    expect(
      trainingpeaksAuthExpired({
        athleteId: 'alex',
        progress: { running: [] },
        lastSync: {
          lastCompletedAt: null,
          providers: {},
          recentRuns: [
            { provider: 'trainingpeaks', status: 'completed', error_count: 2 }
          ]
        }
      })
    ).toBe(true);
  });

  it('does not flag a clean TrainingPeaks run', () => {
    expect(
      trainingpeaksAuthExpired({
        athleteId: 'alex',
        progress: { running: [] },
        lastSync: {
          lastCompletedAt: null,
          providers: {},
          recentRuns: [
            { provider: 'trainingpeaks', status: 'completed', error_count: 0 }
          ]
        }
      })
    ).toBe(false);
  });

  it('ignores other providers and missing summaries', () => {
    expect(
      trainingpeaksAuthExpired({
        athleteId: 'alex',
        progress: { running: [] },
        lastSync: {
          lastCompletedAt: null,
          providers: {},
          recentRuns: [
            { provider: 'garmin', status: 'completed', error_count: 5 }
          ]
        }
      })
    ).toBe(false);
    expect(trainingpeaksAuthExpired(null)).toBe(false);
    expect(
      trainingpeaksAuthExpired({
        athleteId: 'alex',
        progress: { running: [] },
        lastSync: null
      })
    ).toBe(false);
  });

  it('clears once a clean TrainingPeaks run follows a failed one', () => {
    // recentRuns is newest-first: the cookie works again after the re-paste,
    // so the older failed run must not keep the banner up.
    expect(
      trainingpeaksAuthExpired({
        athleteId: 'alex',
        progress: { running: [] },
        lastSync: {
          lastCompletedAt: null,
          providers: {},
          recentRuns: [
            { provider: 'trainingpeaks', status: 'completed', error_count: 0 },
            {
              provider: 'trainingpeaks',
              status: 'completed_with_errors',
              error_count: 3
            }
          ]
        }
      })
    ).toBe(false);
    expect(
      trainingpeaksAuthExpired({
        athleteId: 'alex',
        progress: { running: [] },
        lastSync: {
          lastCompletedAt: null,
          providers: {},
          recentRuns: [
            {
              provider: 'trainingpeaks',
              status: 'completed_with_errors',
              error_count: 3
            },
            { provider: 'garmin', status: 'completed', error_count: 0 },
            { provider: 'trainingpeaks', status: 'completed', error_count: 0 }
          ]
        }
      })
    ).toBe(true);
  });
});
