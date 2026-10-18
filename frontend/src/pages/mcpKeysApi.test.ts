import { describe, expect, it } from 'vitest';

import {
  type FetchImpl,
  accountKeysFor,
  buildCreateMcpKeyPayload,
  buildRollMcpKeyPayload,
  classifyMcpKeyFailure,
  createMcpKey,
  formatKeyTimestamp,
  listMcpKeys,
  mcpKeyFailure,
  mcpKeyRevokeUrl,
  mcpKeyRollUrl,
  mcpKeysUrl,
  parseMcpKey,
  parseMcpKeyCreated,
  parseMcpKeyList,
  parseMcpKeyRevoked,
  revokeMcpKey,
  rollMcpKey
} from './mcpKeysApi';

const ORIGIN = 'https://catence.test';

const activeKey = {
  id: 'key-1',
  label: 'Claude on my laptop',
  account: 'alex',
  createdAt: '2026-10-17T14:03:05.123Z'
};

const revokedKey = {
  ...activeKey,
  id: 'key-2',
  revokedAt: '2026-10-18T09:00:00.000Z'
};

const createdBody = {
  id: 'key-1',
  label: 'Claude on my laptop',
  account: 'alex',
  createdAt: '2026-10-17T14:03:05.123Z',
  token: 'catence_mk_raw-token'
};

describe('mcpKeysUrl', () => {
  it('targets the keys endpoint', () => {
    expect(mcpKeysUrl(ORIGIN)).toBe(`${ORIGIN}/api/v1/mcp-keys`);
  });
});

describe('mcpKeyRevokeUrl', () => {
  it('passes the id as a query parameter, encoded', () => {
    expect(mcpKeyRevokeUrl(ORIGIN, 'key-1')).toBe(
      `${ORIGIN}/api/v1/mcp-keys?id=key-1`
    );
    expect(mcpKeyRevokeUrl(ORIGIN, 'a/b c')).toBe(
      `${ORIGIN}/api/v1/mcp-keys?id=a%2Fb%20c`
    );
  });
});

describe('mcpKeyRollUrl', () => {
  it('targets the roll endpoint', () => {
    expect(mcpKeyRollUrl(ORIGIN)).toBe(`${ORIGIN}/api/v1/mcp-keys/roll`);
  });
});

describe('buildCreateMcpKeyPayload', () => {
  it('trims the account and keeps a label', () => {
    expect(
      buildCreateMcpKeyPayload({ account: '  alex ', label: '  laptop  ' })
    ).toEqual({ account: 'alex', label: 'laptop' });
  });

  it('omits a blank label so the server default applies', () => {
    expect(buildCreateMcpKeyPayload({ account: 'alex' })).toEqual({
      account: 'alex'
    });
    expect(buildCreateMcpKeyPayload({ account: 'alex', label: '   ' })).toEqual(
      { account: 'alex' }
    );
  });
});

describe('accountKeysFor', () => {
  const keys = [
    { ...activeKey, revokedAt: null },
    { ...revokedKey, account: 'sam', revokedAt: '2026-10-18T09:00:00.000Z' },
    { ...activeKey, id: 'key-3', account: 'sam', revokedAt: null }
  ];

  it('narrows the registry to one account, keeping revoked keys', () => {
    expect(accountKeysFor(keys, 'alex')).toEqual([
      { ...activeKey, revokedAt: null }
    ]);
    expect(accountKeysFor(keys, 'sam')).toHaveLength(2);
  });

  it('returns an empty list for an account without keys', () => {
    expect(accountKeysFor(keys, 'nobody')).toEqual([]);
    expect(accountKeysFor([], 'alex')).toEqual([]);
  });
});

describe('parseMcpKey', () => {
  it('parses an active key without revokedAt', () => {
    expect(parseMcpKey(activeKey)).toEqual({ ...activeKey, revokedAt: null });
  });

  it('parses a revoked key', () => {
    expect(parseMcpKey(revokedKey)).toEqual({
      ...revokedKey,
      revokedAt: '2026-10-18T09:00:00.000Z'
    });
  });

  it('rejects non-object, missing, and mistyped shapes', () => {
    expect(parseMcpKey(null)).toBeNull();
    expect(parseMcpKey('key')).toBeNull();
    expect(parseMcpKey({ ...activeKey, id: '' })).toBeNull();
    expect(parseMcpKey({ ...activeKey, account: '' })).toBeNull();
    expect(parseMcpKey({ ...activeKey, label: 7 })).toBeNull();
    expect(parseMcpKey({ ...activeKey, revokedAt: 42 })).toBeNull();
  });
});

describe('parseMcpKeyList', () => {
  it('parses the key list envelope', () => {
    expect(parseMcpKeyList({ keys: [activeKey, revokedKey] })).toEqual([
      { ...activeKey, revokedAt: null },
      { ...revokedKey, revokedAt: '2026-10-18T09:00:00.000Z' }
    ]);
  });

  it('accepts an empty list and rejects malformed envelopes', () => {
    expect(parseMcpKeyList({ keys: [] })).toEqual([]);
    expect(parseMcpKeyList(null)).toBeNull();
    expect(parseMcpKeyList({})).toBeNull();
    expect(parseMcpKeyList({ keys: 'nope' })).toBeNull();
    expect(parseMcpKeyList({ keys: [{ id: 'key-1' }] })).toBeNull();
  });
});

describe('parseMcpKeyCreated', () => {
  it('parses the create/roll response including the raw token', () => {
    expect(parseMcpKeyCreated(createdBody)).toEqual(createdBody);
  });

  it('rejects responses without a token', () => {
    expect(parseMcpKeyCreated(null)).toBeNull();
    expect(parseMcpKeyCreated(activeKey)).toBeNull();
    expect(parseMcpKeyCreated({ ...createdBody, token: '' })).toBeNull();
    expect(parseMcpKeyCreated({ ...createdBody, token: 42 })).toBeNull();
  });
});

describe('parseMcpKeyRevoked', () => {
  it('parses the revoke confirmation', () => {
    expect(parseMcpKeyRevoked({ revoked: 'key-1' })).toEqual({ id: 'key-1' });
  });

  it('rejects malformed confirmations', () => {
    expect(parseMcpKeyRevoked(null)).toBeNull();
    expect(parseMcpKeyRevoked({})).toBeNull();
    expect(parseMcpKeyRevoked({ revoked: '' })).toBeNull();
  });
});

describe('classifyMcpKeyFailure', () => {
  it('prefers the server error code and message', () => {
    expect(
      classifyMcpKeyFailure(400, {
        code: 'mcp_keys_not_configured',
        message: 'restart with --mcp-keys-file'
      })
    ).toEqual({
      code: 'mcp_keys_not_configured',
      message: 'restart with --mcp-keys-file'
    });
  });

  it('maps plain statuses onto stable codes', () => {
    expect(classifyMcpKeyFailure(401, null)).toMatchObject({
      code: 'not_authenticated'
    });
    expect(classifyMcpKeyFailure(403, null)).toMatchObject({
      code: 'admin_required'
    });
    expect(classifyMcpKeyFailure(404, null)).toMatchObject({
      code: 'mcp_key_not_found'
    });
    expect(classifyMcpKeyFailure(400, null)).toMatchObject({
      code: 'invalid_request'
    });
    expect(classifyMcpKeyFailure(500, null)).toMatchObject({
      code: 'server_error'
    });
  });

  it('ignores unknown server codes', () => {
    expect(
      classifyMcpKeyFailure(400, { code: 'something_else', message: 'nope' })
    ).toMatchObject({ code: 'invalid_request', message: 'nope' });
  });

  it('falls back to curated copy when the server message is blank', () => {
    const failure = mcpKeyFailure('admin_required', '   ');
    expect(failure.message).toContain('admin');
  });
});

describe('formatKeyTimestamp', () => {
  it('renders ISO timestamps as stable UTC strings', () => {
    expect(formatKeyTimestamp('2026-10-17T14:03:05.123Z')).toBe(
      '2026-10-17 14:03:05 UTC'
    );
  });

  it('passes unparseable values through', () => {
    expect(formatKeyTimestamp('not-a-date')).toBe('not-a-date');
  });
});

describe('listMcpKeys', () => {
  it('returns the parsed keys on success', async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(JSON.stringify({ keys: [activeKey] }), { status: 200 });
    expect(await listMcpKeys(ORIGIN, fetchImpl)).toEqual({
      ok: true,
      data: [{ ...activeKey, revokedAt: null }]
    });
  });

  it('classifies admin rejections', async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: { code: 'admin_required', message: 'admins only' }
        }),
        { status: 403 }
      );
    expect(await listMcpKeys(ORIGIN, fetchImpl)).toEqual({
      ok: false,
      failure: { code: 'admin_required', message: 'admins only' }
    });
  });

  it('surfaces mcp_keys_not_configured', async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(
        JSON.stringify({ error: { code: 'mcp_keys_not_configured' } }),
        { status: 400 }
      );
    const outcome = await listMcpKeys(ORIGIN, fetchImpl);
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: 'mcp_keys_not_configured' }
    });
    if (!outcome.ok) {
      expect(outcome.failure.message).toContain('--mcp-keys-file');
    }
  });

  it('reports invalid response shapes', async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(JSON.stringify({ nope: true }), { status: 200 });
    expect(await listMcpKeys(ORIGIN, fetchImpl)).toMatchObject({
      ok: false,
      failure: { code: 'invalid_response' }
    });
  });

  it('reports network failures without throwing', async () => {
    const failing: FetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await listMcpKeys(ORIGIN, failing)).toMatchObject({
      ok: false,
      failure: { code: 'network' }
    });
  });
});

describe('createMcpKey', () => {
  it('posts the payload and returns the created key with its token', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl: FetchImpl = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify(createdBody), { status: 201 });
    };
    const outcome = await createMcpKey(
      ORIGIN,
      { account: ' alex ', label: 'laptop' },
      fetchImpl
    );
    expect(capturedUrl).toBe(`${ORIGIN}/api/v1/mcp-keys`);
    expect(capturedInit?.method).toBe('POST');
    expect(capturedInit?.body).toBe(
      JSON.stringify({ account: 'alex', label: 'laptop' })
    );
    expect(outcome).toEqual({ ok: true, data: createdBody });
  });

  it('classifies create failures', async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: { code: 'mcp_key_create_failed', message: 'unknown account' }
        }),
        { status: 400 }
      );
    expect(await createMcpKey(ORIGIN, { account: 'ghost' }, fetchImpl)).toEqual(
      {
        ok: false,
        failure: { code: 'mcp_key_create_failed', message: 'unknown account' }
      }
    );
  });
});

describe('revokeMcpKey', () => {
  it('issues DELETE with the id and parses the confirmation', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl: FetchImpl = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ revoked: 'key-1' }), {
        status: 200
      });
    };
    const outcome = await revokeMcpKey(ORIGIN, 'key-1', fetchImpl);
    expect(capturedUrl).toBe(`${ORIGIN}/api/v1/mcp-keys?id=key-1`);
    expect(capturedInit?.method).toBe('DELETE');
    expect(outcome).toEqual({ ok: true, data: { id: 'key-1' } });
  });

  it('maps unknown keys onto mcp_key_not_found', async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: { code: 'mcp_key_not_found', message: 'Unknown MCP key.' }
        }),
        { status: 404 }
      );
    expect(await revokeMcpKey(ORIGIN, 'gone', fetchImpl)).toEqual({
      ok: false,
      failure: { code: 'mcp_key_not_found', message: 'Unknown MCP key.' }
    });
  });
});

describe('buildRollMcpKeyPayload', () => {
  it('trims the id and account the Console validates before forwarding', () => {
    expect(
      buildRollMcpKeyPayload({ id: ' key-1 ', account: '  alex  ' })
    ).toEqual({ id: 'key-1', account: 'alex' });
  });
});

describe('rollMcpKey', () => {
  it('posts the id and account to the roll endpoint and returns the new token', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl: FetchImpl = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify(createdBody), { status: 200 });
    };
    const outcome = await rollMcpKey(
      ORIGIN,
      { id: ' key-1 ', account: ' alex ' },
      fetchImpl
    );
    expect(capturedUrl).toBe(`${ORIGIN}/api/v1/mcp-keys/roll`);
    expect(capturedInit?.method).toBe('POST');
    expect(capturedInit?.body).toBe(
      JSON.stringify({ id: 'key-1', account: 'alex' })
    );
    expect(outcome).toEqual({ ok: true, data: createdBody });
  });

  it('classifies roll failures', async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: { code: 'mcp_key_roll_failed', message: 'registry locked' }
        }),
        { status: 400 }
      );
    expect(
      await rollMcpKey(ORIGIN, { id: 'key-1', account: 'alex' }, fetchImpl)
    ).toEqual({
      ok: false,
      failure: { code: 'mcp_key_roll_failed', message: 'registry locked' }
    });
  });
});
