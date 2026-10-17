/**
 * Pure helpers and API wrappers behind the MCP API-keys admin section of the
 * MCP Exposure page. Kept React-free so URL building, payload construction,
 * response parsing, and error classification can be unit-tested directly.
 */

export type McpKey = {
  id: string;
  label: string;
  account: string;
  createdAt: string;
  revokedAt: string | null;
};

/** Create/roll response — the raw token is present exactly once, here. */
export type McpKeyCreated = {
  id: string;
  label: string;
  account: string;
  createdAt: string;
  token: string;
};

export type McpKeyRevoked = {
  id: string;
};

export type NewMcpKey = {
  account: string;
  label?: string;
};

export type McpKeyFailureCode =
  | 'not_authenticated'
  | 'admin_required'
  | 'mcp_keys_not_configured'
  | 'mcp_keys_unavailable'
  | 'mcp_key_create_failed'
  | 'mcp_key_revoke_failed'
  | 'mcp_key_roll_failed'
  | 'mcp_key_not_found'
  | 'invalid_request'
  | 'network'
  | 'server_error'
  | 'invalid_response';

export type McpKeyFailure = {
  code: McpKeyFailureCode;
  message: string;
};

export type McpKeyOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; failure: McpKeyFailure };

export type FetchImpl = typeof fetch;

type ApiErrorBody = { error?: { code?: string; message?: string } };

const FAILURE_MESSAGES: Record<McpKeyFailureCode, string> = {
  not_authenticated: 'Console login is required to manage MCP API keys.',
  admin_required:
    'Your Console account must be an admin to manage MCP API keys.',
  mcp_keys_not_configured:
    'This server was started without an MCP keys file; restart it with --mcp-keys-file to manage per-account API keys.',
  mcp_keys_unavailable: 'The MCP key registry could not be read — try again.',
  mcp_key_create_failed:
    'The API key could not be created — check the account and try again.',
  mcp_key_revoke_failed: 'The API key could not be revoked — try again.',
  mcp_key_roll_failed: 'The API key could not be rolled — try again.',
  mcp_key_not_found:
    'That API key could not be found — refresh the list and try again.',
  invalid_request: 'The API key request was not valid.',
  network: 'The server could not be reached.',
  server_error: 'The API key request failed.',
  invalid_response: 'The server returned an unexpected MCP API key response.'
};

const SERVER_FAILURE_CODES: readonly McpKeyFailureCode[] = [
  'not_authenticated',
  'admin_required',
  'mcp_keys_not_configured',
  'mcp_keys_unavailable',
  'mcp_key_create_failed',
  'mcp_key_revoke_failed',
  'mcp_key_roll_failed',
  'mcp_key_not_found',
  'invalid_request'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function mcpKeysUrl(apiOrigin: string): string {
  return `${apiOrigin}/api/v1/mcp-keys`;
}

export function mcpKeyRevokeUrl(apiOrigin: string, id: string): string {
  return `${mcpKeysUrl(apiOrigin)}?id=${encodeURIComponent(id)}`;
}

export function mcpKeyRollUrl(apiOrigin: string): string {
  return `${mcpKeysUrl(apiOrigin)}/roll`;
}

/**
 * The create payload. The label is optional server-side (it defaults to
 * "<account> key"), so a blank label is omitted rather than sent empty —
 * the server rejects an empty-string label.
 */
export function buildCreateMcpKeyPayload(input: NewMcpKey): {
  account: string;
  label?: string;
} {
  const account = input.account.trim();
  const label = input.label?.trim();
  return label ? { account, label } : { account };
}

/**
 * The roll payload. The Console requires the account alongside the id so a
 * key whose account was deleted is refused before a token that could never
 * authenticate is minted; the Console forwards only the id to the runtime.
 */
export function buildRollMcpKeyPayload(input: {
  id: string;
  account: string;
}): { id: string; account: string } {
  return { id: input.id.trim(), account: input.account.trim() };
}

export function parseMcpKey(value: unknown): McpKey | null {
  if (!isRecord(value)) return null;
  const { id, label, account, createdAt, revokedAt } = value;
  if (typeof id !== 'string' || !id) return null;
  if (typeof label !== 'string') return null;
  if (typeof account !== 'string' || !account) return null;
  if (typeof createdAt !== 'string') return null;
  if (revokedAt !== undefined && typeof revokedAt !== 'string') return null;
  return {
    id,
    label,
    account,
    createdAt,
    revokedAt: typeof revokedAt === 'string' ? revokedAt : null
  };
}

export function parseMcpKeyList(value: unknown): McpKey[] | null {
  if (!isRecord(value) || !Array.isArray(value.keys)) return null;
  const keys: McpKey[] = [];
  for (const entry of value.keys) {
    const key = parseMcpKey(entry);
    if (!key) return null;
    keys.push(key);
  }
  return keys;
}

export function parseMcpKeyCreated(value: unknown): McpKeyCreated | null {
  if (!isRecord(value)) return null;
  const { id, label, account, createdAt, token } = value;
  if (typeof id !== 'string' || !id) return null;
  if (typeof label !== 'string') return null;
  if (typeof account !== 'string' || !account) return null;
  if (typeof createdAt !== 'string') return null;
  if (typeof token !== 'string' || !token) return null;
  return { id, label, account, createdAt, token };
}

export function parseMcpKeyRevoked(value: unknown): McpKeyRevoked | null {
  if (!isRecord(value)) return null;
  const { revoked } = value;
  if (typeof revoked !== 'string' || !revoked) return null;
  return { id: revoked };
}

export function mcpKeyFailure(
  code: McpKeyFailureCode,
  message?: string | null
): McpKeyFailure {
  const trimmed = message?.trim();
  if (trimmed) return { code, message: trimmed };
  return { code, message: FAILURE_MESSAGES[code] };
}

/** Maps an HTTP failure onto a machine code and the copy the UI shows. */
export function classifyMcpKeyFailure(
  status: number,
  error?: { code?: string; message?: string } | null
): McpKeyFailure {
  const serverCode = error?.code as McpKeyFailureCode | undefined;
  if (serverCode && SERVER_FAILURE_CODES.includes(serverCode)) {
    return mcpKeyFailure(serverCode, error?.message);
  }
  if (status === 401) return mcpKeyFailure('not_authenticated', error?.message);
  if (status === 403) return mcpKeyFailure('admin_required', error?.message);
  if (status === 404) return mcpKeyFailure('mcp_key_not_found', error?.message);
  if (status === 400) return mcpKeyFailure('invalid_request', error?.message);
  return mcpKeyFailure('server_error', error?.message);
}

/**
 * Renders an ISO timestamp as a stable UTC string ("2026-10-17 14:03:05
 * UTC") so
 * the list reads the same in every timezone. Unparseable values pass through.
 */
export function formatKeyTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' UTC');
}

async function requestMcpKeys(
  url: string,
  init: RequestInit | undefined,
  fetchImpl: FetchImpl
): Promise<
  { ok: true; body: unknown } | { ok: false; failure: McpKeyFailure }
> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    return { ok: false, failure: mcpKeyFailure('network') };
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = isRecord(body) ? (body.error as ApiErrorBody['error']) : null;
    return {
      ok: false,
      failure: classifyMcpKeyFailure(response.status, error)
    };
  }
  return { ok: true, body };
}

export async function listMcpKeys(
  apiOrigin: string,
  fetchImpl: FetchImpl = fetch
): Promise<McpKeyOutcome<McpKey[]>> {
  const result = await requestMcpKeys(
    mcpKeysUrl(apiOrigin),
    undefined,
    fetchImpl
  );
  if (!result.ok) return result;
  const keys = parseMcpKeyList(result.body);
  if (!keys) return { ok: false, failure: mcpKeyFailure('invalid_response') };
  return { ok: true, data: keys };
}

export async function createMcpKey(
  apiOrigin: string,
  input: NewMcpKey,
  fetchImpl: FetchImpl = fetch
): Promise<McpKeyOutcome<McpKeyCreated>> {
  const result = await requestMcpKeys(
    mcpKeysUrl(apiOrigin),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildCreateMcpKeyPayload(input))
    },
    fetchImpl
  );
  if (!result.ok) return result;
  const created = parseMcpKeyCreated(result.body);
  if (!created)
    return { ok: false, failure: mcpKeyFailure('invalid_response') };
  return { ok: true, data: created };
}

export async function revokeMcpKey(
  apiOrigin: string,
  id: string,
  fetchImpl: FetchImpl = fetch
): Promise<McpKeyOutcome<McpKeyRevoked>> {
  const result = await requestMcpKeys(
    mcpKeyRevokeUrl(apiOrigin, id),
    { method: 'DELETE' },
    fetchImpl
  );
  if (!result.ok) return result;
  const revoked = parseMcpKeyRevoked(result.body);
  if (!revoked)
    return { ok: false, failure: mcpKeyFailure('invalid_response') };
  return { ok: true, data: revoked };
}

export async function rollMcpKey(
  apiOrigin: string,
  key: { id: string; account: string },
  fetchImpl: FetchImpl = fetch
): Promise<McpKeyOutcome<McpKeyCreated>> {
  const result = await requestMcpKeys(
    mcpKeyRollUrl(apiOrigin),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildRollMcpKeyPayload(key))
    },
    fetchImpl
  );
  if (!result.ok) return result;
  const rolled = parseMcpKeyCreated(result.body);
  if (!rolled) return { ok: false, failure: mcpKeyFailure('invalid_response') };
  return { ok: true, data: rolled };
}
