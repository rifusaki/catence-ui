import { describe, expect, it } from 'vitest';

import {
  type FetchImpl,
  autoSyncUrl,
  classifyAutoSyncFailure,
  formatScheduleTimestamp,
  intervalBudgetHint,
  loadAutoSyncSchedule,
  parseAutoSyncSchedule,
  updateAutoSyncSchedule
} from './autoSyncApi';

const sampleSchedule = {
  athleteId: 'alex',
  enabled: true,
  intervalMinutes: 120,
  intervalOptions: [
    { minutes: 15, label: '15m' },
    { minutes: 120, label: '2h' }
  ],
  lastTriggeredAt: '2026-10-16T08:00:00.000Z',
  lastLogFile: null,
  nextRunAt: '2026-10-16T10:00:00.000Z'
};

describe('autoSyncUrl', () => {
  it('targets the schedule endpoint with the athlete scope', () => {
    expect(autoSyncUrl('https://catence.test', 'alex')).toBe(
      'https://catence.test/api/v1/sync/schedule?athleteId=alex'
    );
  });
});

describe('parseAutoSyncSchedule', () => {
  it('parses a full schedule', () => {
    expect(parseAutoSyncSchedule(sampleSchedule)).toEqual(sampleSchedule);
  });

  it('rejects a body without interval options', () => {
    expect(
      parseAutoSyncSchedule({ ...sampleSchedule, intervalOptions: null })
    ).toBeNull();
    expect(
      parseAutoSyncSchedule({
        ...sampleSchedule,
        intervalOptions: [{ minutes: '2h' }]
      })
    ).toBeNull();
  });

  it('rejects a non-boolean enabled flag', () => {
    expect(
      parseAutoSyncSchedule({ ...sampleSchedule, enabled: 'yes' })
    ).toBeNull();
  });
});

describe('classifyAutoSyncFailure', () => {
  it('maps HTTP statuses onto stable codes', () => {
    expect(classifyAutoSyncFailure(401, null).code).toBe('not_authenticated');
    expect(classifyAutoSyncFailure(403, null).code).toBe('athlete_forbidden');
    expect(classifyAutoSyncFailure(500, null).code).toBe('server_error');
    expect(
      classifyAutoSyncFailure(400, { code: 'schedule_update_failed' }).code
    ).toBe('schedule_update_failed');
  });
});

function jsonResponse(status: number, body: unknown): FetchImpl {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    })) as FetchImpl;
}

describe('loadAutoSyncSchedule', () => {
  it('returns the parsed schedule on success', async () => {
    const outcome = await loadAutoSyncSchedule(
      'https://catence.test',
      'alex',
      jsonResponse(200, sampleSchedule)
    );
    expect(outcome).toEqual({ ok: true, data: sampleSchedule });
  });

  it('classifies a server rejection', async () => {
    const outcome = await loadAutoSyncSchedule(
      'https://catence.test',
      'alex',
      jsonResponse(400, {
        error: { code: 'schedule_unavailable', message: 'no store' }
      })
    );
    expect(outcome).toEqual({
      ok: false,
      failure: { code: 'schedule_unavailable', message: 'no store' }
    });
  });
});

describe('updateAutoSyncSchedule', () => {
  it('sends the change as a PUT body', async () => {
    const calls: Array<{ url: string; init: RequestInit | null }> = [];
    const fetchImpl = (async (target: unknown, init?: RequestInit) => {
      calls.push({ url: String(target), init: init ?? null });
      return jsonResponse(200, { ...sampleSchedule, intervalMinutes: 360 })(
        target as never,
        init as never
      );
    }) as unknown as FetchImpl;
    const outcome = await updateAutoSyncSchedule(
      'https://catence.test',
      {
        athleteId: 'alex',
        intervalMinutes: 360
      },
      fetchImpl
    );
    expect(calls[0]?.url).toContain('/api/v1/sync/schedule?athleteId=alex');
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      athleteId: 'alex',
      intervalMinutes: 360
    });
    expect(outcome.ok && outcome.data.intervalMinutes).toBe(360);
  });
});

describe('intervalBudgetHint', () => {
  it('warns only for the 15-minute cadence', () => {
    expect(intervalBudgetHint(15)).toContain('Intervals.icu');
    expect(intervalBudgetHint(30)).toBeNull();
    expect(intervalBudgetHint(1440)).toBeNull();
  });
});

describe('formatScheduleTimestamp', () => {
  it('renders absent timestamps as not-yet and parses the rest', () => {
    expect(formatScheduleTimestamp(null)).toBe('Not yet');
    expect(formatScheduleTimestamp('2026-10-16T08:00:00.000Z')).toMatch('2026');
  });
});
