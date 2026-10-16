/**
 * Pure helpers and API wrappers behind the Auto-Sync admin tab. Kept
 * React-free so URL building, payload construction, response parsing, and
 * error classification can be unit-tested directly.
 */

export type AutoSyncIntervalOption = {
  minutes: number;
  label: string;
};

export type AutoSyncSchedule = {
  athleteId: string;
  enabled: boolean;
  intervalMinutes: number;
  intervalOptions: AutoSyncIntervalOption[];
  lastTriggeredAt: string | null;
  lastLogFile: string | null;
  nextRunAt: string | null;
};

export type AutoSyncUpdate = {
  athleteId: string;
  enabled?: boolean;
  intervalMinutes?: number;
};

export type AutoSyncFailureCode =
  | 'not_authenticated'
  | 'athlete_forbidden'
  | 'invalid_request'
  | 'schedule_unavailable'
  | 'schedule_update_failed'
  | 'network'
  | 'server_error'
  | 'invalid_response';

export type AutoSyncFailure = {
  code: AutoSyncFailureCode;
  message: string;
};

export type AutoSyncOutcome =
  | { ok: true; data: AutoSyncSchedule }
  | { ok: false; failure: AutoSyncFailure };

type ApiErrorBody = { error?: { code?: string; message?: string } };

export type FetchImpl = typeof fetch;

const FAILURE_MESSAGES: Record<AutoSyncFailureCode, string> = {
  not_authenticated: 'Console login is required to manage auto-sync.',
  athlete_forbidden: 'Your account cannot manage this athlete.',
  invalid_request: 'The auto-sync request was not valid.',
  schedule_unavailable: 'The auto-sync schedule could not be read.',
  schedule_update_failed:
    'The auto-sync change could not be applied — try again.',
  network: 'The server could not be reached.',
  server_error: 'The auto-sync request failed.',
  invalid_response: 'The server returned an unexpected auto-sync response.'
};

const SERVER_FAILURE_CODES: readonly AutoSyncFailureCode[] = [
  'not_authenticated',
  'athlete_forbidden',
  'schedule_unavailable',
  'schedule_update_failed',
  'invalid_request'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseIntervalOption(value: unknown): AutoSyncIntervalOption | null {
  if (!isRecord(value)) return null;
  const { minutes, label } = value;
  if (typeof minutes !== 'number' || typeof label !== 'string') return null;
  return { minutes, label };
}

export function parseAutoSyncSchedule(value: unknown): AutoSyncSchedule | null {
  if (!isRecord(value)) return null;
  const {
    athleteId,
    enabled,
    intervalMinutes,
    intervalOptions,
    lastTriggeredAt,
    lastLogFile,
    nextRunAt
  } = value;
  if (typeof athleteId !== 'string') return null;
  if (typeof enabled !== 'boolean') return null;
  if (typeof intervalMinutes !== 'number') return null;
  if (!Array.isArray(intervalOptions)) return null;
  const options: AutoSyncIntervalOption[] = [];
  for (const option of intervalOptions) {
    const parsed = parseIntervalOption(option);
    if (!parsed) return null;
    options.push(parsed);
  }
  const optionalTimestamp = (candidate: unknown): string | null =>
    typeof candidate === 'string' ? candidate : null;
  const optionalPath = (candidate: unknown): string | null =>
    candidate === undefined || candidate === null
      ? null
      : typeof candidate === 'string'
        ? candidate
        : null;
  return {
    athleteId,
    enabled,
    intervalMinutes,
    intervalOptions: options,
    lastTriggeredAt: optionalTimestamp(lastTriggeredAt),
    lastLogFile: optionalPath(lastLogFile),
    nextRunAt: optionalTimestamp(nextRunAt)
  };
}

export function autoSyncUrl(apiOrigin: string, athleteId: string): string {
  return `${apiOrigin}/api/v1/sync/schedule?athleteId=${encodeURIComponent(athleteId)}`;
}

export function autoSyncFailure(
  code: AutoSyncFailureCode,
  message?: string | null
): AutoSyncFailure {
  const trimmed = message?.trim();
  if (trimmed) return { code, message: trimmed };
  return { code, message: FAILURE_MESSAGES[code] };
}

/** Maps an HTTP failure onto a machine code and the copy the UI shows. */
export function classifyAutoSyncFailure(
  status: number,
  error?: { code?: string; message?: string } | null
): AutoSyncFailure {
  const serverCode = error?.code as AutoSyncFailureCode | undefined;
  if (serverCode && SERVER_FAILURE_CODES.includes(serverCode)) {
    return autoSyncFailure(serverCode, error?.message);
  }
  if (status === 401)
    return autoSyncFailure('not_authenticated', error?.message);
  if (status === 403)
    return autoSyncFailure('athlete_forbidden', error?.message);
  if (status === 400) return autoSyncFailure('invalid_request', error?.message);
  return autoSyncFailure('server_error', error?.message);
}

async function requestAutoSync(
  apiOrigin: string,
  athleteId: string,
  init: RequestInit | undefined,
  fetchImpl: FetchImpl
): Promise<AutoSyncOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(autoSyncUrl(apiOrigin, athleteId), init);
  } catch {
    return { ok: false, failure: autoSyncFailure('network') };
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = isRecord(body) ? (body.error as ApiErrorBody['error']) : null;
    return {
      ok: false,
      failure: classifyAutoSyncFailure(response.status, error)
    };
  }
  const schedule = parseAutoSyncSchedule(body);
  if (!schedule) {
    return { ok: false, failure: autoSyncFailure('invalid_response') };
  }
  return { ok: true, data: schedule };
}

export async function loadAutoSyncSchedule(
  apiOrigin: string,
  athleteId: string,
  fetchImpl: FetchImpl = fetch
): Promise<AutoSyncOutcome> {
  return requestAutoSync(apiOrigin, athleteId, undefined, fetchImpl);
}

export async function updateAutoSyncSchedule(
  apiOrigin: string,
  update: AutoSyncUpdate,
  fetchImpl: FetchImpl = fetch
): Promise<AutoSyncOutcome> {
  return requestAutoSync(
    apiOrigin,
    update.athleteId,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update)
    },
    fetchImpl
  );
}

/** Intervals.icu allows 5000 requests/day; the 15m cadence spends most of it. */
export function intervalBudgetHint(intervalMinutes: number): string | null {
  if (intervalMinutes >= 30) return null;
  return 'Caution: 15-minute syncs approach the Intervals.icu daily request budget (~3,800 of 5,000 requests on busy days). Prefer 30m or slower unless you need near-live data.';
}

export function formatScheduleTimestamp(value: string | null): string {
  if (!value) return 'Not yet';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}
