import { describe, expect, it } from 'vitest';

import {
  type AthleteFileSnapshot,
  type FetchImpl,
  athleteFileRevisionUrl,
  athleteFileUrl,
  buildSavePayload,
  formatTimestamp,
  loadAthleteFile,
  loadAthleteFileRevision,
  loadAthleteRoster,
  mergeWriteResponse,
  rosterUrl,
  saveAthleteFile,
  selectDefaultAthleteId,
  shortHash,
  snapshotFromConflict,
  sortRevisionsNewestFirst,
  withSignal
} from './profileFile';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

const snapshot: AthleteFileSnapshot = {
  exists: true,
  content: '# Athlete\n',
  hash: 'abcdef0123456789',
  updatedAt: '2026-09-27T12:00:00Z',
  revisions: [{ revisionId: 'r1', hash: 'h1', savedAt: '2026-09-26T12:00:00Z' }]
};

describe('URL builders', () => {
  it('targets the roster endpoint', () => {
    expect(rosterUrl('https://catence.test')).toBe(
      'https://catence.test/api/v1/athletes'
    );
  });

  it('carries the athlete id, URL-encoded', () => {
    expect(athleteFileUrl('https://catence.test', 'athlete-1')).toBe(
      'https://catence.test/api/v1/athlete-file?athleteId=athlete-1'
    );
    expect(athleteFileUrl('https://catence.test', 'a b&c')).toBe(
      'https://catence.test/api/v1/athlete-file?athleteId=a+b%26c'
    );
  });

  it('carries the revision id, URL-encoded', () => {
    expect(
      athleteFileRevisionUrl('https://catence.test', 'athlete-1', 'rev/1')
    ).toBe(
      'https://catence.test/api/v1/athlete-file?athleteId=athlete-1&revision=rev%2F1'
    );
  });
});

describe('buildSavePayload', () => {
  it('replaces the file with the draft and the last loaded hash', () => {
    expect(buildSavePayload('draft', 'hash-1')).toEqual({
      content: 'draft',
      operation: 'replace',
      expectedHash: 'hash-1'
    });
  });

  it('sends a null expected hash when creating the file', () => {
    expect(buildSavePayload('draft', null)).toEqual({
      content: 'draft',
      operation: 'replace',
      expectedHash: null
    });
  });
});

describe('withSignal', () => {
  it('injects the abort signal without dropping the request init', async () => {
    const controller = new AbortController();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: FetchImpl = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, {});
    };
    await withSignal(controller.signal, fetchImpl)('https://catence.test', {
      method: 'PUT'
    });
    expect(calls[0].url).toBe('https://catence.test');
    expect(calls[0].init?.method).toBe('PUT');
    expect(calls[0].init?.signal).toBe(controller.signal);
  });
});

describe('selectDefaultAthleteId', () => {
  it('prefers the server default when it is in the roster', () => {
    expect(
      selectDefaultAthleteId({
        defaultAthleteId: 'b',
        athletes: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' }
        ]
      })
    ).toBe('b');
  });

  it('falls back to the first athlete when the default is missing', () => {
    expect(
      selectDefaultAthleteId({
        defaultAthleteId: 'gone',
        athletes: [{ id: 'a', label: 'A' }]
      })
    ).toBe('a');
  });

  it('returns null for an empty roster', () => {
    expect(
      selectDefaultAthleteId({ defaultAthleteId: '', athletes: [] })
    ).toBeNull();
  });
});

describe('sortRevisionsNewestFirst', () => {
  it('orders by savedAt without mutating the input', () => {
    const revisions = [
      { revisionId: 'old', hash: 'a', savedAt: '2026-09-01T00:00:00Z' },
      { revisionId: 'new', hash: 'b', savedAt: '2026-09-26T00:00:00Z' },
      { revisionId: 'mid', hash: 'c', savedAt: '2026-09-10T00:00:00Z' }
    ];
    expect(
      sortRevisionsNewestFirst(revisions).map((r) => r.revisionId)
    ).toEqual(['new', 'mid', 'old']);
    expect(revisions.map((r) => r.revisionId)).toEqual(['old', 'new', 'mid']);
  });
});

describe('display helpers', () => {
  it('shortens hashes and labels a missing hash', () => {
    expect(shortHash(null)).toBe('none');
    expect(shortHash('abcd')).toBe('abcd');
    expect(shortHash('abcdef0123456789')).toBe('abcdef012345…');
  });

  it('formats valid timestamps and falls back for missing ones', () => {
    expect(formatTimestamp(null)).toBe('unknown');
    expect(formatTimestamp('not-a-date')).toBe('unknown');
    expect(formatTimestamp('2026-09-27T12:00:00Z')).toBe(
      new Date('2026-09-27T12:00:00Z').toLocaleString()
    );
  });
});

describe('save and conflict transitions', () => {
  it('adopts the write response while keeping the revision list', () => {
    const merged = mergeWriteResponse(snapshot, {
      exists: true,
      content: 'saved',
      hash: 'h3',
      updatedAt: '2026-09-27T13:00:00Z'
    });
    expect(merged).toEqual({
      exists: true,
      content: 'saved',
      hash: 'h3',
      updatedAt: '2026-09-27T13:00:00Z',
      revisions: snapshot.revisions
    });
  });

  it('adopts the conflicting version only when explicitly applied', () => {
    const adopted = snapshotFromConflict(snapshot, {
      message: 'The file changed.',
      currentHash: 'h9',
      currentContent: 'theirs'
    });
    expect(adopted.content).toBe('theirs');
    expect(adopted.hash).toBe('h9');
    expect(adopted.exists).toBe(true);
    expect(adopted.updatedAt).toBeNull();
    expect(adopted.revisions).toBe(snapshot.revisions);
  });
});

describe('loadAthleteRoster', () => {
  it('returns null when the server has no roster endpoint', async () => {
    const roster = await loadAthleteRoster('https://catence.test', async () =>
      jsonResponse(404, {})
    );
    expect(roster).toBeNull();
  });

  it('parses a valid roster', async () => {
    const roster = await loadAthleteRoster('https://catence.test', async () =>
      jsonResponse(200, {
        defaultAthleteId: 'a',
        athletes: [{ id: 'a', label: 'Athlete A' }]
      })
    );
    expect(roster).toEqual({
      defaultAthleteId: 'a',
      athletes: [{ id: 'a', label: 'Athlete A' }]
    });
  });

  it('rejects a roster whose athletes are malformed', async () => {
    await expect(
      loadAthleteRoster('https://catence.test', async () =>
        jsonResponse(200, { defaultAthleteId: 'a', athletes: [{ label: 'A' }] })
      )
    ).rejects.toThrow('invalid athlete roster');
  });
});

describe('loadAthleteFile', () => {
  it('normalizes a missing revision list', async () => {
    const loaded = await loadAthleteFile(
      'https://catence.test',
      'athlete-1',
      async () =>
        jsonResponse(200, {
          exists: false,
          content: '# Starter',
          hash: null,
          updatedAt: null
        })
    );
    expect(loaded).toEqual({
      exists: false,
      content: '# Starter',
      hash: null,
      updatedAt: null,
      revisions: []
    });
  });

  it('surfaces the server error message', async () => {
    await expect(
      loadAthleteFile('https://catence.test', 'athlete-1', async () =>
        jsonResponse(400, {
          error: { code: 'invalid_request', message: 'athleteId is required' }
        })
      )
    ).rejects.toThrow('athleteId is required');
  });
});

describe('loadAthleteFileRevision', () => {
  it('returns the requested revision content', async () => {
    const revision = await loadAthleteFileRevision(
      'https://catence.test',
      'athlete-1',
      'rev-1',
      async (url) => {
        expect(url).toContain('revision=rev-1');
        return jsonResponse(200, { revisionId: 'rev-1', content: 'old' });
      }
    );
    expect(revision).toEqual({ revisionId: 'rev-1', content: 'old' });
  });

  it('maps an unknown revision to a friendly message', async () => {
    await expect(
      loadAthleteFileRevision('https://catence.test', 'athlete-1', 'gone', () =>
        Promise.resolve(
          jsonResponse(404, {
            error: {
              code: 'athlete_file_revision_not_found',
              message: 'revision not found'
            }
          })
        )
      )
    ).rejects.toThrow('no longer available');
  });
});

describe('saveAthleteFile', () => {
  it('PUTs the draft with the last loaded hash and parses the response', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const outcome = await saveAthleteFile(
      'https://catence.test',
      'athlete-1',
      'next draft',
      'h1',
      async (url, init) => {
        calls.push({ url, init });
        return jsonResponse(200, {
          exists: true,
          content: 'next draft',
          hash: 'h2',
          updatedAt: '2026-09-27T13:00:00Z'
        });
      }
    );
    expect(calls[0].url).toBe(
      'https://catence.test/api/v1/athlete-file?athleteId=athlete-1'
    );
    expect(calls[0].init?.method).toBe('PUT');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      content: 'next draft',
      operation: 'replace',
      expectedHash: 'h1'
    });
    expect(outcome).toEqual({
      kind: 'saved',
      response: {
        exists: true,
        content: 'next draft',
        hash: 'h2',
        updatedAt: '2026-09-27T13:00:00Z'
      }
    });
  });

  it('reports a conflict with the server version', async () => {
    const outcome = await saveAthleteFile(
      'https://catence.test',
      'athlete-1',
      'mine',
      'h1',
      async () =>
        jsonResponse(409, {
          error: {
            code: 'athlete_file_conflict',
            message: 'The file changed on the server.',
            currentHash: 'h2',
            currentContent: 'theirs'
          }
        })
    );
    expect(outcome).toEqual({
      kind: 'conflict',
      conflict: {
        message: 'The file changed on the server.',
        currentHash: 'h2',
        currentContent: 'theirs'
      }
    });
  });

  it('returns the server message for a validation failure', async () => {
    const outcome = await saveAthleteFile(
      'https://catence.test',
      'athlete-1',
      'mine',
      'h1',
      async () =>
        jsonResponse(400, {
          error: { code: 'invalid_request', message: 'content is empty' }
        })
    );
    expect(outcome).toEqual({ kind: 'error', message: 'content is empty' });
  });

  it('returns a generic message when the network fails', async () => {
    const outcome = await saveAthleteFile(
      'https://catence.test',
      'athlete-1',
      'mine',
      'h1',
      async () => {
        throw new TypeError('Failed to fetch');
      }
    );
    expect(outcome.kind).toBe('error');
    expect(outcome).toMatchObject({
      message: expect.stringContaining('Network error')
    });
  });
});
