/**
 * Pure helpers and API wrappers behind the Profile page's athlete file
 * editor. Kept React-free so URL building, save-payload construction,
 * conflict transitions, and revision sorting can be unit-tested directly.
 */

export type AthleteRoster = {
  defaultAthleteId: string;
  athletes: Array<{ id: string; label: string }>;
};

export type AthleteFileRevision = {
  revisionId: string;
  hash: string;
  savedAt: string;
};

export type AthleteFileSnapshot = {
  exists: boolean;
  content: string;
  hash: string | null;
  updatedAt: string | null;
  revisions: AthleteFileRevision[];
};

/** PUT responses describe the saved version without the revisions list. */
export type AthleteFileWriteResponse = Omit<AthleteFileSnapshot, 'revisions'>;

export type AthleteFileConflict = {
  message: string;
  currentHash: string;
  currentContent: string;
};

export type AthleteFileRevisionContent = {
  revisionId: string;
  content: string;
};

export type SaveOutcome =
  | { kind: 'saved'; response: AthleteFileWriteResponse }
  | { kind: 'conflict'; conflict: AthleteFileConflict }
  | { kind: 'error'; message: string };

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    currentHash?: string;
    currentContent?: string;
  };
};

const NETWORK_ERROR_MESSAGE =
  'Network error — could not reach the Catence server. Your draft is unchanged.';

const REVISION_NOT_FOUND_MESSAGE =
  'That revision is no longer available — it may have been pruned.';

export function rosterUrl(apiOrigin: string): string {
  return `${apiOrigin}/api/v1/athletes`;
}

export function athleteFileUrl(apiOrigin: string, athleteId: string): string {
  return `${apiOrigin}/api/v1/athlete-file?${new URLSearchParams({
    athleteId
  }).toString()}`;
}

export function athleteFileRevisionUrl(
  apiOrigin: string,
  athleteId: string,
  revisionId: string
): string {
  return `${apiOrigin}/api/v1/athlete-file?${new URLSearchParams({
    athleteId,
    revision: revisionId
  }).toString()}`;
}

export function buildSavePayload(
  content: string,
  expectedHash: string | null
): { content: string; operation: 'replace'; expectedHash: string | null } {
  return { content, operation: 'replace', expectedHash };
}

export function withSignal(
  signal: AbortSignal,
  fetchImpl: FetchImpl = fetch
): FetchImpl {
  return (url, init) => fetchImpl(url, { ...init, signal });
}

export function selectDefaultAthleteId(roster: AthleteRoster): string | null {
  if (roster.athletes.some((athlete) => athlete.id === roster.defaultAthleteId))
    return roster.defaultAthleteId;
  return roster.athletes[0]?.id ?? null;
}

function revisionTime(revision: AthleteFileRevision): number {
  const parsed = Date.parse(revision.savedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function sortRevisionsNewestFirst(
  revisions: AthleteFileRevision[]
): AthleteFileRevision[] {
  return [...revisions].sort((a, b) => revisionTime(b) - revisionTime(a));
}

export function shortHash(hash: string | null): string {
  if (!hash) return 'none';
  return hash.length > 12 ? `${hash.slice(0, 12)}…` : hash;
}

export function formatTimestamp(value: string | null): string {
  if (!value) return 'unknown';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'unknown';
  return new Date(parsed).toLocaleString();
}

export function mergeWriteResponse(
  previous: AthleteFileSnapshot,
  response: AthleteFileWriteResponse
): AthleteFileSnapshot {
  return { ...response, revisions: previous.revisions };
}

export function snapshotFromConflict(
  previous: AthleteFileSnapshot,
  conflict: AthleteFileConflict
): AthleteFileSnapshot {
  return {
    ...previous,
    exists: true,
    content: conflict.currentContent,
    hash: conflict.currentHash,
    updatedAt: null
  };
}

/**
 * Returns the roster, or null when the server has no roster endpoint
 * (older standalone Catence servers return 404 there).
 */
export async function loadAthleteRoster(
  apiOrigin: string,
  fetchImpl: FetchImpl = fetch
): Promise<AthleteRoster | null> {
  const response = await fetchImpl(rosterUrl(apiOrigin));
  if (response.status === 404) return null;
  const body = (await response.json().catch(() => null)) as
    | (AthleteRoster & ApiErrorBody)
    | null;
  if (!response.ok)
    throw new Error(
      body?.error?.message ??
        `Athlete roster request failed (${response.status}).`
    );
  if (
    !body ||
    !Array.isArray(body.athletes) ||
    typeof body.defaultAthleteId !== 'string' ||
    body.athletes.some((athlete) => typeof athlete?.id !== 'string')
  )
    throw new Error('The Catence server returned an invalid athlete roster.');
  return body;
}

export async function loadAthleteFile(
  apiOrigin: string,
  athleteId: string,
  fetchImpl: FetchImpl = fetch
): Promise<AthleteFileSnapshot> {
  const response = await fetchImpl(athleteFileUrl(apiOrigin, athleteId));
  const body = (await response.json().catch(() => null)) as
    | (AthleteFileSnapshot & ApiErrorBody)
    | null;
  if (!response.ok)
    throw new Error(
      body?.error?.message ??
        `Athlete file request failed (${response.status}).`
    );
  if (
    !body ||
    typeof body.content !== 'string' ||
    typeof body.exists !== 'boolean'
  )
    throw new Error('The Catence server returned an invalid athlete file.');
  return {
    exists: body.exists,
    content: body.content,
    hash: typeof body.hash === 'string' ? body.hash : null,
    updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : null,
    revisions: Array.isArray(body.revisions) ? body.revisions : []
  };
}

export async function loadAthleteFileRevision(
  apiOrigin: string,
  athleteId: string,
  revisionId: string,
  fetchImpl: FetchImpl = fetch
): Promise<AthleteFileRevisionContent> {
  const response = await fetchImpl(
    athleteFileRevisionUrl(apiOrigin, athleteId, revisionId)
  );
  const body = (await response.json().catch(() => null)) as
    | (AthleteFileRevisionContent & ApiErrorBody)
    | null;
  if (
    body?.error?.code === 'athlete_file_revision_not_found' ||
    response.status === 404
  )
    throw new Error(REVISION_NOT_FOUND_MESSAGE);
  if (!response.ok)
    throw new Error(
      body?.error?.message ?? `Revision request failed (${response.status}).`
    );
  if (!body || typeof body.content !== 'string')
    throw new Error('The Catence server returned an invalid revision.');
  return {
    revisionId:
      typeof body.revisionId === 'string' ? body.revisionId : revisionId,
    content: body.content
  };
}

export async function saveAthleteFile(
  apiOrigin: string,
  athleteId: string,
  content: string,
  expectedHash: string | null,
  fetchImpl: FetchImpl = fetch
): Promise<SaveOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(athleteFileUrl(apiOrigin, athleteId), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildSavePayload(content, expectedHash))
    });
  } catch {
    return { kind: 'error', message: NETWORK_ERROR_MESSAGE };
  }
  const body = (await response.json().catch(() => null)) as
    | (AthleteFileWriteResponse & ApiErrorBody)
    | null;
  if (response.status === 409 && body?.error) {
    const { message, currentHash, currentContent } = body.error;
    if (typeof currentHash === 'string' && typeof currentContent === 'string') {
      return {
        kind: 'conflict',
        conflict: {
          message: message ?? 'The athlete file changed on the server.',
          currentHash,
          currentContent
        }
      };
    }
  }
  if (!response.ok) {
    return {
      kind: 'error',
      message:
        body?.error?.message ??
        `Saving the athlete file failed (${response.status}).`
    };
  }
  if (
    !body ||
    typeof body.content !== 'string' ||
    typeof body.exists !== 'boolean'
  ) {
    return {
      kind: 'error',
      message: 'The Catence server returned an invalid save response.'
    };
  }
  return {
    kind: 'saved',
    response: {
      exists: body.exists,
      content: body.content,
      hash: typeof body.hash === 'string' ? body.hash : null,
      updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : null
    }
  };
}
