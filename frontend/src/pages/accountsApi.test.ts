import { describe, expect, it } from 'vitest';

import {
  type FetchImpl,
  accountsActionUrl,
  accountsFailure,
  accountsUrl,
  addAccount,
  athleteSecretRemovalUrl,
  athleteSecretsUrl,
  athletesUrl,
  buildAddAccountPayload,
  buildAddAthletePayload,
  buildAthleteSecretRemovalPayload,
  buildAthleteSecretUpdatePayload,
  buildUpdateAccountPayload,
  classifyAccountsFailure,
  clearToolServerSecret,
  createAthlete,
  formatAthleteGrant,
  loadAccounts,
  loadAthleteOptions,
  loadAthleteSecrets,
  loadToolServers,
  loadWhoami,
  parseAccount,
  parseAccountsSnapshot,
  parseAthleteGrant,
  parseAthleteOptions,
  parseAthleteSecretsSnapshot,
  parseToolServer,
  parseToolServerSecret,
  parseToolServersSnapshot,
  parseWhoami,
  removeAccount,
  removeAthleteSecret,
  resetAccountPassword,
  saveToolServerSecret,
  setAthleteSecret,
  toolServerSecretUrl,
  toolServersUrl,
  updateAccountGrants,
  whoamiUrl
} from './accountsApi';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

const snapshot = {
  accounts: [
    {
      username: 'ana',
      role: 'admin',
      athletes: 'all',
      createdAt: '2026-09-01T12:00:00Z'
    },
    {
      username: 'bob',
      role: 'member',
      athletes: ['athlete-1'],
      createdAt: '2026-09-02T12:00:00Z'
    }
  ],
  breakGlass: { username: 'root' }
};

describe('URL builders', () => {
  it('targets the whoami endpoint', () => {
    expect(whoamiUrl('https://catence.test')).toBe(
      'https://catence.test/api/v1/whoami'
    );
  });

  it('targets the accounts endpoint', () => {
    expect(accountsUrl('https://catence.test')).toBe(
      'https://catence.test/api/v1/accounts'
    );
  });

  it('appends the action to the accounts endpoint', () => {
    expect(accountsActionUrl('https://catence.test', 'add')).toBe(
      'https://catence.test/api/v1/accounts/add'
    );
    expect(accountsActionUrl('https://catence.test', 'passwd')).toBe(
      'https://catence.test/api/v1/accounts/passwd'
    );
    expect(accountsActionUrl('https://catence.test', 'remove')).toBe(
      'https://catence.test/api/v1/accounts/remove'
    );
    expect(accountsActionUrl('https://catence.test', 'update')).toBe(
      'https://catence.test/api/v1/accounts/update'
    );
  });

  it('targets the athlete roster endpoint', () => {
    expect(athletesUrl('https://catence.test')).toBe(
      'https://catence.test/api/v1/athletes'
    );
  });
});

describe('buildAddAccountPayload', () => {
  it('trims the username and keeps the member grants', () => {
    expect(
      buildAddAccountPayload({
        username: '  carol  ',
        password: 'hunter2',
        role: 'member',
        athletes: ['athlete-1', 'athlete-2']
      })
    ).toEqual({
      username: 'carol',
      password: 'hunter2',
      role: 'member',
      athletes: ['athlete-1', 'athlete-2']
    });
  });

  it('forces admins to all athletes whatever the form collected', () => {
    expect(
      buildAddAccountPayload({
        username: 'dora',
        password: 'hunter2',
        role: 'admin',
        athletes: ['athlete-1']
      }).athletes
    ).toBe('all');
  });

  it('allows members with zero grants', () => {
    expect(
      buildAddAccountPayload({
        username: 'erin',
        password: 'hunter2',
        role: 'member',
        athletes: []
      }).athletes
    ).toEqual([]);
  });
});

describe('buildUpdateAccountPayload', () => {
  it('trims the username and passes the grant through', () => {
    expect(
      buildUpdateAccountPayload({ username: ' bob ', athletes: 'all' })
    ).toEqual({ username: 'bob', athletes: 'all' });
    expect(
      buildUpdateAccountPayload({ username: 'bob', athletes: [] })
    ).toEqual({ username: 'bob', athletes: [] });
  });
});

describe('parseAthleteGrant', () => {
  it('accepts the all marker', () => {
    expect(parseAthleteGrant('all')).toBe('all');
  });

  it('copies an id list without sharing the input array', () => {
    const input = ['athlete-1', 'athlete-2'];
    const parsed = parseAthleteGrant(input);
    expect(parsed).toEqual(['athlete-1', 'athlete-2']);
    expect(parsed).not.toBe(input);
  });

  it('accepts an empty grant', () => {
    expect(parseAthleteGrant([])).toEqual([]);
  });

  it('rejects malformed grants', () => {
    expect(parseAthleteGrant('some')).toBeNull();
    expect(parseAthleteGrant([1])).toBeNull();
    expect(parseAthleteGrant(null)).toBeNull();
    expect(parseAthleteGrant(undefined)).toBeNull();
  });
});

describe('parseAccount', () => {
  it('parses a valid account', () => {
    expect(parseAccount(snapshot.accounts[0])).toEqual(snapshot.accounts[0]);
  });

  it('normalizes a missing createdAt to an empty string', () => {
    expect(
      parseAccount({
        username: 'bob',
        role: 'member',
        athletes: []
      })?.createdAt
    ).toBe('');
  });

  it('rejects accounts with a bad role, username, or grants', () => {
    expect(
      parseAccount({ username: 'x', role: 'owner', athletes: 'all' })
    ).toBeNull();
    expect(parseAccount({ role: 'member', athletes: 'all' })).toBeNull();
    expect(parseAccount({ username: 'x', role: 'member' })).toBeNull();
    expect(parseAccount(null)).toBeNull();
  });
});

describe('parseAccountsSnapshot', () => {
  it('parses the account list and break-glass row', () => {
    expect(parseAccountsSnapshot(snapshot)).toEqual(snapshot);
  });

  it('accepts a missing or null break-glass account', () => {
    expect(parseAccountsSnapshot({ accounts: [], breakGlass: null })).toEqual({
      accounts: [],
      breakGlass: null
    });
    expect(parseAccountsSnapshot({ accounts: [] })).toEqual({
      accounts: [],
      breakGlass: null
    });
  });

  it('rejects malformed payloads', () => {
    expect(parseAccountsSnapshot(null)).toBeNull();
    expect(parseAccountsSnapshot({ accounts: {} })).toBeNull();
    expect(
      parseAccountsSnapshot({ accounts: [{ username: 'x', role: 'hermit' }] })
    ).toBeNull();
    expect(
      parseAccountsSnapshot({ accounts: [], breakGlass: { id: 'root' } })
    ).toBeNull();
  });
});

describe('parseWhoami', () => {
  it('parses an admin with every athlete', () => {
    expect(
      parseWhoami({ username: 'ana', role: 'admin', athletes: 'all' })
    ).toEqual({ username: 'ana', role: 'admin', athletes: 'all' });
  });

  it('parses a member with a grant list', () => {
    expect(
      parseWhoami({ username: 'bob', role: 'member', athletes: ['a'] })
    ).toEqual({ username: 'bob', role: 'member', athletes: ['a'] });
  });

  it('rejects malformed payloads', () => {
    expect(parseWhoami(null)).toBeNull();
    expect(parseWhoami({ role: 'admin', athletes: 'all' })).toBeNull();
    expect(parseWhoami({ username: 'x', role: 'member' })).toBeNull();
  });
});

describe('parseAthleteOptions', () => {
  it('parses the roster into id/label options', () => {
    expect(
      parseAthleteOptions({
        defaultAthleteId: 'athlete-1',
        athletes: [
          { id: 'athlete-1', label: 'Athlete One' },
          { id: 'athlete-2', label: 'Athlete Two' }
        ]
      })
    ).toEqual([
      { id: 'athlete-1', label: 'Athlete One' },
      { id: 'athlete-2', label: 'Athlete Two' }
    ]);
  });

  it('falls back to the id when a label is missing', () => {
    expect(parseAthleteOptions({ athletes: [{ id: 'athlete-1' }] })).toEqual([
      { id: 'athlete-1', label: 'athlete-1' }
    ]);
  });

  it('accepts an empty roster and rejects malformed entries', () => {
    expect(parseAthleteOptions({ athletes: [] })).toEqual([]);
    expect(parseAthleteOptions({ athletes: [{ label: 'No id' }] })).toBeNull();
    expect(parseAthleteOptions({ athletes: 'athlete-1' })).toBeNull();
  });
});

describe('formatAthleteGrant', () => {
  it('labels all, none, and explicit lists', () => {
    expect(formatAthleteGrant('all')).toBe('all');
    expect(formatAthleteGrant([])).toBe('none');
    expect(formatAthleteGrant(['athlete-2', 'athlete-1'])).toBe(
      'athlete-2, athlete-1'
    );
  });
});

describe('classifyAccountsFailure', () => {
  it('maps known server codes to readable messages', () => {
    expect(classifyAccountsFailure(400, { code: 'last_admin' })).toEqual({
      code: 'last_admin',
      message: expect.stringContaining('last admin')
    });
    expect(classifyAccountsFailure(409, { code: 'account_exists' })).toEqual({
      code: 'account_exists',
      message: 'That username already exists.'
    });
  });

  it('prefers a server-provided message', () => {
    expect(
      classifyAccountsFailure(400, {
        code: 'invalid_request',
        message: 'password must be at least 8 characters'
      })
    ).toEqual({
      code: 'invalid_request',
      message: 'password must be at least 8 characters'
    });
  });

  it('falls back to the status when the body carries no code', () => {
    expect(classifyAccountsFailure(401, null).code).toBe('not_authenticated');
    expect(classifyAccountsFailure(403, null)).toEqual({
      code: 'admin_required',
      message: expect.stringContaining('Administrator access')
    });
    expect(classifyAccountsFailure(400, null).code).toBe('invalid_request');
  });

  it('reports unexpected statuses as a server error', () => {
    expect(classifyAccountsFailure(500, null)).toEqual({
      code: 'server_error',
      message: 'Account request failed (500).'
    });
  });

  it('trusts a known code over the status', () => {
    expect(
      classifyAccountsFailure(500, { code: 'account_not_found' }).code
    ).toBe('account_not_found');
  });
});

describe('accountsFailure', () => {
  it('builds a network failure from the shared copy', () => {
    expect(accountsFailure('network')).toEqual({
      code: 'network',
      message: expect.stringContaining('Network error')
    });
  });

  it('prefers an explicit message over the mapped one', () => {
    expect(accountsFailure('invalid_response', '  custom  ')).toEqual({
      code: 'invalid_response',
      message: 'custom'
    });
  });
});

describe('loadWhoami', () => {
  it('parses a signed-in identity', async () => {
    const outcome = await loadWhoami('https://catence.test', async () =>
      jsonResponse(200, { username: 'ana', role: 'admin', athletes: 'all' })
    );
    expect(outcome).toEqual({
      ok: true,
      data: { username: 'ana', role: 'admin', athletes: 'all' }
    });
  });

  it('treats a missing endpoint as signed out without an identity', async () => {
    const outcome = await loadWhoami('https://catence.test', async () =>
      jsonResponse(404, {})
    );
    expect(outcome).toEqual({ ok: true, data: null });
  });

  it('classifies unauthenticated and member responses', async () => {
    expect(
      await loadWhoami('https://catence.test', async () =>
        jsonResponse(401, { error: { code: 'not_authenticated' } })
      )
    ).toEqual({
      ok: false,
      failure: {
        code: 'not_authenticated',
        message: expect.stringContaining('session has expired')
      }
    });
    expect(
      await loadWhoami('https://catence.test', async () =>
        jsonResponse(403, { error: { code: 'admin_required' } })
      )
    ).toMatchObject({ ok: false, failure: { code: 'admin_required' } });
  });

  it('rejects malformed identities', async () => {
    expect(
      await loadWhoami('https://catence.test', async () =>
        jsonResponse(200, { username: 'ana', role: 'admin' })
      )
    ).toEqual({
      ok: false,
      failure: { code: 'invalid_response', message: expect.any(String) }
    });
  });

  it('reports a network failure', async () => {
    const outcome = await loadWhoami('https://catence.test', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(outcome).toEqual({
      ok: false,
      failure: {
        code: 'network',
        message: expect.stringContaining('Network error')
      }
    });
  });
});

describe('loadAccounts', () => {
  it('parses the snapshot with its break-glass row', async () => {
    const outcome = await loadAccounts('https://catence.test', async (url) => {
      expect(url).toBe('https://catence.test/api/v1/accounts');
      return jsonResponse(200, snapshot);
    });
    expect(outcome).toEqual({ ok: true, data: snapshot });
  });

  it('classifies the admin-only rejection for members', async () => {
    const outcome = await loadAccounts('https://catence.test', async () =>
      jsonResponse(403, { error: { code: 'admin_required' } })
    );
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: 'admin_required' }
    });
  });

  it('rejects malformed account lists', async () => {
    const outcome = await loadAccounts('https://catence.test', async () =>
      jsonResponse(200, { accounts: [{ username: 'x', role: 'member' }] })
    );
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: 'invalid_response' }
    });
  });

  it('reports a network failure', async () => {
    const outcome = await loadAccounts('https://catence.test', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(outcome).toMatchObject({ ok: false, failure: { code: 'network' } });
  });
});

describe('loadAthleteOptions', () => {
  it('parses the roster for the multiselect', async () => {
    const outcome = await loadAthleteOptions(
      'https://catence.test',
      async (url) => {
        expect(url).toBe('https://catence.test/api/v1/athletes');
        return jsonResponse(200, {
          defaultAthleteId: 'athlete-1',
          athletes: [{ id: 'athlete-1', label: 'Athlete One' }]
        });
      }
    );
    expect(outcome).toEqual({
      ok: true,
      data: [{ id: 'athlete-1', label: 'Athlete One' }]
    });
  });

  it('treats an empty roster as an empty option list', async () => {
    const outcome = await loadAthleteOptions('https://catence.test', async () =>
      jsonResponse(200, { defaultAthleteId: '', athletes: [] })
    );
    expect(outcome).toEqual({ ok: true, data: [] });
  });

  it('treats a missing roster endpoint as an empty option list', async () => {
    const outcome = await loadAthleteOptions('https://catence.test', async () =>
      jsonResponse(404, {})
    );
    expect(outcome).toEqual({ ok: true, data: [] });
  });

  it('rejects a malformed roster', async () => {
    const outcome = await loadAthleteOptions('https://catence.test', async () =>
      jsonResponse(200, { athletes: [{ label: 'No id' }] })
    );
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: 'invalid_response' }
    });
  });
});

describe('createAthlete', () => {
  it('trims the payload fields', () => {
    expect(
      buildAddAthletePayload({
        id: ' sam ',
        label: '  Sam Smith  ',
        setDefault: true
      })
    ).toEqual({ id: 'sam', label: 'Sam Smith', setDefault: true });
  });

  it('POSTs to the athletes endpoint and reports success', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const outcome = await createAthlete(
      'https://catence.test',
      { id: 'sam', label: 'Sam Smith', setDefault: true },
      async (url, init) => {
        calls.push({ url, init });
        return jsonResponse(201, {
          defaultAthleteId: 'sam',
          athletes: [{ id: 'sam', label: 'Sam Smith' }]
        });
      }
    );
    expect(calls[0].url).toBe('https://catence.test/api/v1/athletes');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      id: 'sam',
      label: 'Sam Smith',
      setDefault: true
    });
    expect(outcome).toEqual({ ok: true, data: null });
  });

  it('maps a duplicate athlete to a readable message', async () => {
    const outcome = await createAthlete(
      'https://catence.test',
      { id: 'sam', label: 'Sam', setDefault: false },
      async () => jsonResponse(409, { error: { code: 'athlete_exists' } })
    );
    expect(outcome).toMatchObject({
      ok: false,
      failure: {
        code: 'athlete_exists',
        message: 'That athlete id already exists.'
      }
    });
  });

  it('surfaces the catalog requirement', async () => {
    const outcome = await createAthlete(
      'https://catence.test',
      { id: 'sam', label: 'Sam', setDefault: false },
      async () => jsonResponse(400, { error: { code: 'catalog_required' } })
    );
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: 'catalog_required' }
    });
  });

  it('reports network failures', async () => {
    const outcome = await createAthlete(
      'https://catence.test',
      { id: 'sam', label: 'Sam', setDefault: false },
      async () => {
        throw new Error('offline');
      }
    );
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: 'network' }
    });
  });
});

describe('account mutations', () => {
  it('POSTs the add payload and reports success', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const outcome = await addAccount(
      'https://catence.test',
      {
        username: ' carol ',
        password: 'hunter2',
        role: 'member',
        athletes: ['athlete-1']
      },
      async (url, init) => {
        calls.push({ url, init });
        return jsonResponse(200, {});
      }
    );
    expect(calls[0].url).toBe('https://catence.test/api/v1/accounts/add');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      username: 'carol',
      password: 'hunter2',
      role: 'member',
      athletes: ['athlete-1']
    });
    expect(outcome).toEqual({ ok: true, data: null });
  });

  it('forces admins to all athletes in the add request', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    await addAccount(
      'https://catence.test',
      { username: 'dora', password: 'pw', role: 'admin', athletes: [] },
      async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return jsonResponse(200, {});
      }
    );
    expect(bodies[0].athletes).toBe('all');
  });

  it('maps account_exists to a readable message', async () => {
    const outcome = await addAccount(
      'https://catence.test',
      { username: 'ana', password: 'pw', role: 'admin', athletes: 'all' },
      async () => jsonResponse(409, { error: { code: 'account_exists' } })
    );
    expect(outcome).toMatchObject({
      ok: false,
      failure: {
        code: 'account_exists',
        message: 'That username already exists.'
      }
    });
  });

  it('POSTs grant updates', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await updateAccountGrants(
      'https://catence.test',
      { username: ' bob ', athletes: [] },
      async (url, init) => {
        calls.push({ url, init });
        return jsonResponse(200, {});
      }
    );
    expect(calls[0].url).toBe('https://catence.test/api/v1/accounts/update');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      username: 'bob',
      athletes: []
    });
  });

  it('surfaces the last-admin rejection on remove', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const outcome = await removeAccount(
      'https://catence.test',
      'ana',
      async (url, init) => {
        calls.push({ url, init });
        return jsonResponse(400, { error: { code: 'last_admin' } });
      }
    );
    expect(calls[0].url).toBe('https://catence.test/api/v1/accounts/remove');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      username: 'ana'
    });
    expect(outcome).toMatchObject({
      ok: false,
      failure: {
        code: 'last_admin',
        message: expect.stringContaining('last admin')
      }
    });
  });

  it('POSTs password resets and maps a missing account', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const outcome = await resetAccountPassword(
      'https://catence.test',
      'ghost',
      'new secret',
      async (url, init) => {
        expect(url).toBe('https://catence.test/api/v1/accounts/passwd');
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return jsonResponse(404, { error: { code: 'account_not_found' } });
      }
    );
    expect(bodies[0]).toEqual({ username: 'ghost', password: 'new secret' });
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: 'account_not_found' }
    });
  });

  it('reports network failures without throwing', async () => {
    const failing: FetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await removeAccount('https://catence.test', 'ana', failing)).toEqual(
      {
        ok: false,
        failure: {
          code: 'network',
          message: expect.stringContaining('Network error')
        }
      }
    );
    expect(
      await resetAccountPassword('https://catence.test', 'ana', 'pw', failing)
    ).toMatchObject({ ok: false, failure: { code: 'network' } });
  });

  it('accepts a success response with no JSON body', async () => {
    const outcome = await removeAccount(
      'https://catence.test',
      'bob',
      async () =>
        ({
          ok: true,
          status: 200,
          json: async (): Promise<unknown> => {
            throw new SyntaxError('Unexpected end of JSON input');
          }
        }) as Response
    );
    expect(outcome).toEqual({ ok: true, data: null });
  });
});

describe('tool server URL builders', () => {
  it('targets the tool-servers collection', () => {
    expect(toolServersUrl('https://catence.test')).toBe(
      'https://catence.test/api/v1/tool-servers'
    );
  });

  it('encodes the server name in the secret endpoint', () => {
    expect(toolServerSecretUrl('https://catence.test', 'exa web')).toBe(
      'https://catence.test/api/v1/tool-servers/exa%20web/secrets'
    );
  });
});

describe('parseToolServerSecret', () => {
  it('accepts console and environment sources', () => {
    expect(
      parseToolServerSecret({
        name: 'EXA_API_KEY',
        configured: true,
        source: 'console'
      })
    ).toEqual({ name: 'EXA_API_KEY', configured: true, source: 'console' });
    expect(
      parseToolServerSecret({
        name: 'EXA_API_KEY',
        configured: true,
        source: 'environment'
      })
    ).toMatchObject({ source: 'environment' });
  });

  it('accepts an unconfigured secret', () => {
    expect(
      parseToolServerSecret({
        name: 'EXA_API_KEY',
        configured: false,
        source: null
      })
    ).toEqual({ name: 'EXA_API_KEY', configured: false, source: null });
  });

  it('rejects malformed entries', () => {
    expect(parseToolServerSecret(null)).toBeNull();
    expect(
      parseToolServerSecret({ name: '', configured: true, source: null })
    ).toBeNull();
    expect(
      parseToolServerSecret({ name: 'X', configured: 'yes', source: null })
    ).toBeNull();
    expect(
      parseToolServerSecret({ name: 'X', configured: true, source: 'stored' })
    ).toBeNull();
  });
});

describe('parseToolServer', () => {
  it('falls back to the name when the label is missing', () => {
    expect(
      parseToolServer({
        name: 'exa',
        url: 'https://mcp.exa.ai/mcp',
        secrets: []
      })
    ).toEqual({
      name: 'exa',
      label: 'exa',
      url: 'https://mcp.exa.ai/mcp',
      secrets: []
    });
  });

  it('rejects malformed servers and secrets', () => {
    expect(parseToolServer({ name: 'exa', url: '', secrets: [] })).toBeNull();
    expect(
      parseToolServer({ name: 'exa', url: 'https://x', secrets: [{}] })
    ).toBeNull();
  });
});

describe('parseToolServersSnapshot', () => {
  it('requires a servers array', () => {
    expect(parseToolServersSnapshot({ servers: [] })).toEqual({ servers: [] });
    expect(parseToolServersSnapshot({})).toBeNull();
    expect(parseToolServersSnapshot({ servers: [{}] })).toBeNull();
  });
});

describe('loadToolServers', () => {
  const toolServersPayload = {
    servers: [
      {
        name: 'exa',
        label: 'Exa Web Search',
        url: 'https://mcp.exa.ai/mcp',
        secrets: [{ name: 'EXA_API_KEY', configured: false, source: null }]
      }
    ]
  };

  it('loads the configured tool servers', async () => {
    const outcome = await loadToolServers(
      'https://catence.test',
      async (url) => {
        expect(url).toBe('https://catence.test/api/v1/tool-servers');
        return jsonResponse(200, toolServersPayload);
      }
    );
    expect(outcome).toEqual({ ok: true, data: toolServersPayload });
  });

  it('treats a 404 as an empty list', async () => {
    const outcome = await loadToolServers('https://catence.test', async () =>
      jsonResponse(404, {})
    );
    expect(outcome).toEqual({ ok: true, data: { servers: [] } });
  });

  it('maps a member rejection to admin_required', async () => {
    const outcome = await loadToolServers('https://catence.test', async () =>
      jsonResponse(403, { error: { code: 'admin_required' } })
    );
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: 'admin_required' }
    });
  });

  it('reports network and malformed responses', async () => {
    const failing: FetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(
      await loadToolServers('https://catence.test', failing)
    ).toMatchObject({ ok: false, failure: { code: 'network' } });
    expect(
      await loadToolServers('https://catence.test', async () =>
        jsonResponse(200, { servers: 'nope' })
      )
    ).toMatchObject({ ok: false, failure: { code: 'invalid_response' } });
  });
});

describe('tool server credentials', () => {
  const storedSnapshot = {
    servers: [
      {
        name: 'exa',
        label: 'Exa Web Search',
        url: 'https://mcp.exa.ai/mcp',
        secrets: [{ name: 'EXA_API_KEY', configured: true, source: 'console' }]
      }
    ]
  };

  it('posts a stored credential and returns the refreshed snapshot', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const outcome = await saveToolServerSecret(
      'https://catence.test',
      'exa',
      'EXA_API_KEY',
      'secret-value',
      async (url, init) => {
        calls.push({ url, init });
        return jsonResponse(200, storedSnapshot);
      }
    );
    expect(calls[0].url).toBe(
      'https://catence.test/api/v1/tool-servers/exa/secrets'
    );
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      name: 'EXA_API_KEY',
      value: 'secret-value'
    });
    expect(outcome).toEqual({ ok: true, data: storedSnapshot });
  });

  it('clears a credential with a null value', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const outcome = await clearToolServerSecret(
      'https://catence.test',
      'exa',
      'EXA_API_KEY',
      async (url, init) => {
        expect(url).toBe(
          'https://catence.test/api/v1/tool-servers/exa/secrets'
        );
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return jsonResponse(200, { servers: [] });
      }
    );
    expect(bodies[0]).toEqual({ name: 'EXA_API_KEY', value: null });
    expect(outcome).toEqual({ ok: true, data: { servers: [] } });
  });

  it('maps store failures and network errors', async () => {
    const outcome = await saveToolServerSecret(
      'https://catence.test',
      'exa',
      'EXA_API_KEY',
      'v',
      async () =>
        jsonResponse(500, { error: { code: 'tool_server_secrets_error' } })
    );
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: 'tool_server_secrets_error' }
    });

    const failing: FetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(
      await clearToolServerSecret(
        'https://catence.test',
        'exa',
        'EXA_API_KEY',
        failing
      )
    ).toMatchObject({ ok: false, failure: { code: 'network' } });
  });

  it('maps a missing server to tool_server_not_found', async () => {
    const outcome = await saveToolServerSecret(
      'https://catence.test',
      'ghost',
      'EXA_API_KEY',
      'v',
      async () =>
        jsonResponse(404, { error: { code: 'tool_server_not_found' } })
    );
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: 'tool_server_not_found' }
    });
  });
});

describe('athlete secrets API', () => {
  const metadata = {
    athleteId: 'athlete-1',
    providers: [
      {
        id: 'garmin',
        label: 'Garmin',
        fields: [
          { name: 'email', configured: true },
          { name: 'password', configured: false }
        ]
      }
    ]
  };

  it('builds the metadata, write, and removal URLs', () => {
    expect(athleteSecretsUrl('https://catence.test')).toBe(
      'https://catence.test/api/v1/athlete-secrets'
    );
    expect(athleteSecretsUrl('https://catence.test', 'athlete-1')).toBe(
      'https://catence.test/api/v1/athlete-secrets?athleteId=athlete-1'
    );
    expect(athleteSecretsUrl('https://catence.test', 'a b')).toBe(
      'https://catence.test/api/v1/athlete-secrets?athleteId=a%20b'
    );
    expect(athleteSecretRemovalUrl('https://catence.test')).toBe(
      'https://catence.test/api/v1/athlete-secrets/remove'
    );
  });

  it('trims payload identifiers but never touches the value', () => {
    expect(
      buildAthleteSecretUpdatePayload({
        athleteId: ' athlete-1 ',
        provider: ' garmin ',
        field: ' email ',
        value: ' secret '
      })
    ).toEqual({
      athleteId: 'athlete-1',
      provider: 'garmin',
      field: 'email',
      value: ' secret '
    });
    expect(
      buildAthleteSecretRemovalPayload({
        athleteId: ' athlete-1 ',
        provider: ' garmin ',
        field: ' email '
      })
    ).toEqual({ athleteId: 'athlete-1', provider: 'garmin', field: 'email' });
  });

  it('parses the metadata snapshot and falls back to the provider id', () => {
    const parsed = parseAthleteSecretsSnapshot(metadata);
    expect(parsed?.athleteId).toBe('athlete-1');
    expect(parsed?.providers[0]).toEqual({
      id: 'garmin',
      label: 'Garmin',
      fields: [
        { name: 'email', configured: true },
        { name: 'password', configured: false }
      ]
    });
    expect(
      parseAthleteSecretsSnapshot({
        athleteId: 'athlete-1',
        providers: [{ id: 'strava', fields: [] }]
      })
    ).toMatchObject({ providers: [{ id: 'strava', label: 'strava' }] });
    expect(parseAthleteSecretsSnapshot({ providers: [] })).toBeNull();
    expect(
      parseAthleteSecretsSnapshot({
        athleteId: 'athlete-1',
        providers: [{ id: 'garmin', fields: 'nope' }]
      })
    ).toBeNull();
  });

  it('loads metadata through the athlete-scoped endpoint', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchImpl = async (input) => {
      calls.push(String(input));
      return jsonResponse(200, metadata);
    };
    const outcome = await loadAthleteSecrets(
      'https://catence.test',
      'athlete-1',
      fetchImpl
    );
    expect(calls).toEqual([
      'https://catence.test/api/v1/athlete-secrets?athleteId=athlete-1'
    ]);
    expect(outcome).toMatchObject({
      ok: true,
      data: { athleteId: 'athlete-1' }
    });
  });

  it('saves a credential with PUT and a JSON body', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: FetchImpl = async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse(200, metadata);
    };
    const outcome = await setAthleteSecret(
      'https://catence.test',
      {
        athleteId: 'athlete-1',
        provider: 'garmin',
        field: 'email',
        value: 'new@example.test'
      },
      fetchImpl
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://catence.test/api/v1/athlete-secrets');
    expect(calls[0].init?.method).toBe('PUT');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      athleteId: 'athlete-1',
      provider: 'garmin',
      field: 'email',
      value: 'new@example.test'
    });
    expect(outcome).toMatchObject({ ok: true });
  });

  it('removes a credential through the removal endpoint', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: FetchImpl = async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse(200, metadata);
    };
    const outcome = await removeAthleteSecret(
      'https://catence.test',
      { athleteId: 'athlete-1', provider: 'garmin', field: 'password' },
      fetchImpl
    );
    expect(calls[0].url).toBe(
      'https://catence.test/api/v1/athlete-secrets/remove'
    );
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      athleteId: 'athlete-1',
      provider: 'garmin',
      field: 'password'
    });
    expect(outcome).toMatchObject({ ok: true });
  });

  it('maps runtime failures and malformed replies', async () => {
    expect(
      await loadAthleteSecrets('https://catence.test', 'missing', async () =>
        jsonResponse(400, { error: { code: 'athlete_secrets_unavailable' } })
      )
    ).toMatchObject({
      ok: false,
      failure: { code: 'athlete_secrets_unavailable' }
    });
    expect(
      await setAthleteSecret(
        'https://catence.test',
        {
          athleteId: 'athlete-1',
          provider: 'garmin',
          field: 'nope',
          value: 'v'
        },
        async () =>
          jsonResponse(400, {
            error: { code: 'athlete_secret_write_failed' }
          })
      )
    ).toMatchObject({
      ok: false,
      failure: { code: 'athlete_secret_write_failed' }
    });
    expect(
      await loadAthleteSecrets('https://catence.test', 'athlete-1', async () =>
        jsonResponse(200, { athleteId: 'athlete-1' })
      )
    ).toMatchObject({ ok: false, failure: { code: 'invalid_response' } });
    const failing: FetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(
      await removeAthleteSecret(
        'https://catence.test',
        { athleteId: 'athlete-1', provider: 'garmin', field: 'password' },
        failing
      )
    ).toMatchObject({ ok: false, failure: { code: 'network' } });
  });
});
