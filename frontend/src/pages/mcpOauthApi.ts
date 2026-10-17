/**
 * Pure helpers and API wrappers behind the OAuth 2.1 admin section of the
 * MCP Exposure page. Kept React-free so URL building, payload construction,
 * response parsing, and error classification can be unit-tested directly.
 */

export type McpOauthSettingsSource = 'console' | 'environment' | 'disabled';

export type McpOauthSettings = {
  enabled: boolean;
  publicUrl: string | null;
  source: McpOauthSettingsSource;
  settingsFile: string;
  settingsState: 'ok' | 'missing' | 'invalid';
};

export type McpOauthSettingsInput = {
  enabled: boolean;
  publicUrl?: string;
};

export type McpOauthSettingsFailureCode =
  | 'not_authenticated'
  | 'admin_required'
  | 'mcp_oauth_not_configured'
  | 'mcp_oauth_settings_update_failed'
  | 'invalid_request'
  | 'network'
  | 'server_error'
  | 'invalid_response';

export type McpOauthSettingsFailure = {
  code: McpOauthSettingsFailureCode;
  message: string;
};

export type McpOauthSettingsOutcome =
  | { ok: true; data: McpOauthSettings }
  | { ok: false; failure: McpOauthSettingsFailure };

type ApiErrorBody = { error?: { code?: string; message?: string } };

export type FetchImpl = typeof fetch;

const FAILURE_MESSAGES: Record<McpOauthSettingsFailureCode, string> = {
  not_authenticated: 'Console login is required to manage MCP OAuth settings.',
  admin_required:
    'Your Console account must be an admin to manage MCP OAuth settings.',
  mcp_oauth_not_configured:
    'This server was started without an OAuth settings file; restart it with --oauth-settings-file to manage OAuth from the Console.',
  mcp_oauth_settings_update_failed:
    'The OAuth settings could not be saved — check the public URL and try again.',
  invalid_request: 'The OAuth settings request was not valid.',
  network: 'The server could not be reached.',
  server_error: 'The OAuth settings request failed.',
  invalid_response: 'The server returned an unexpected OAuth settings response.'
};

const SERVER_FAILURE_CODES: readonly McpOauthSettingsFailureCode[] = [
  'not_authenticated',
  'admin_required',
  'mcp_oauth_not_configured',
  'mcp_oauth_settings_update_failed',
  'invalid_request'
];

const SOURCES: readonly McpOauthSettingsSource[] = [
  'console',
  'environment',
  'disabled'
];

const SETTINGS_STATES: readonly McpOauthSettings['settingsState'][] = [
  'ok',
  'missing',
  'invalid'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function mcpOauthSettingsUrl(apiOrigin: string): string {
  return `${apiOrigin}/api/v1/mcp-oauth-settings`;
}

/**
 * The update payload. A blank public URL is omitted rather than sent empty —
 * the runtime keeps the stored URL when disabling, and requires one when
 * enabling.
 */
export function buildMcpOauthSettingsPayload(input: McpOauthSettingsInput): {
  enabled: boolean;
  publicUrl?: string;
} {
  const publicUrl = input.publicUrl?.trim() ?? '';
  return publicUrl
    ? { enabled: input.enabled, publicUrl }
    : { enabled: input.enabled };
}

export function parseMcpOauthSettings(value: unknown): McpOauthSettings | null {
  if (!isRecord(value)) return null;
  const { enabled, publicUrl, source, settingsFile, settingsState } = value;
  if (typeof enabled !== 'boolean') return null;
  if (publicUrl !== null && typeof publicUrl !== 'string') return null;
  if (
    typeof source !== 'string' ||
    !SOURCES.includes(source as McpOauthSettingsSource)
  )
    return null;
  if (typeof settingsFile !== 'string' || !settingsFile) return null;
  if (
    typeof settingsState !== 'string' ||
    !SETTINGS_STATES.includes(
      settingsState as McpOauthSettings['settingsState']
    )
  )
    return null;
  return {
    enabled,
    publicUrl: typeof publicUrl === 'string' ? publicUrl : null,
    source: source as McpOauthSettingsSource,
    settingsFile,
    settingsState: settingsState as McpOauthSettings['settingsState']
  };
}

export function mcpOauthSettingsFailure(
  code: McpOauthSettingsFailureCode,
  message?: string | null
): McpOauthSettingsFailure {
  const trimmed = message?.trim();
  if (trimmed) return { code, message: trimmed };
  return { code, message: FAILURE_MESSAGES[code] };
}

/** Maps an HTTP failure onto a machine code and the copy the UI shows. */
export function classifyMcpOauthSettingsFailure(
  status: number,
  error?: { code?: string; message?: string } | null
): McpOauthSettingsFailure {
  const serverCode = error?.code as McpOauthSettingsFailureCode | undefined;
  if (serverCode && SERVER_FAILURE_CODES.includes(serverCode)) {
    return mcpOauthSettingsFailure(serverCode, error?.message);
  }
  if (status === 401)
    return mcpOauthSettingsFailure('not_authenticated', error?.message);
  if (status === 403)
    return mcpOauthSettingsFailure('admin_required', error?.message);
  if (status === 400)
    return mcpOauthSettingsFailure('invalid_request', error?.message);
  return mcpOauthSettingsFailure('server_error', error?.message);
}

async function requestMcpOauthSettings(
  url: string,
  init: RequestInit | undefined,
  fetchImpl: FetchImpl
): Promise<
  { ok: true; body: unknown } | { ok: false; failure: McpOauthSettingsFailure }
> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    return { ok: false, failure: mcpOauthSettingsFailure('network') };
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = isRecord(body) ? (body.error as ApiErrorBody['error']) : null;
    return {
      ok: false,
      failure: classifyMcpOauthSettingsFailure(response.status, error)
    };
  }
  return { ok: true, body };
}

export async function getMcpOauthSettings(
  apiOrigin: string,
  fetchImpl: FetchImpl = fetch
): Promise<McpOauthSettingsOutcome> {
  const result = await requestMcpOauthSettings(
    mcpOauthSettingsUrl(apiOrigin),
    undefined,
    fetchImpl
  );
  if (!result.ok) return result;
  const settings = parseMcpOauthSettings(result.body);
  if (!settings)
    return { ok: false, failure: mcpOauthSettingsFailure('invalid_response') };
  return { ok: true, data: settings };
}

export async function updateMcpOauthSettings(
  apiOrigin: string,
  input: McpOauthSettingsInput,
  fetchImpl: FetchImpl = fetch
): Promise<McpOauthSettingsOutcome> {
  const result = await requestMcpOauthSettings(
    mcpOauthSettingsUrl(apiOrigin),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildMcpOauthSettingsPayload(input))
    },
    fetchImpl
  );
  if (!result.ok) return result;
  const settings = parseMcpOauthSettings(result.body);
  if (!settings)
    return { ok: false, failure: mcpOauthSettingsFailure('invalid_response') };
  return { ok: true, data: settings };
}
