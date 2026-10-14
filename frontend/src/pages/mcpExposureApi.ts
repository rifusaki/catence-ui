/**
 * Pure helpers and API wrappers behind the MCP Exposure admin page. Kept
 * React-free so URL building, payload construction, response parsing, and
 * error classification can be unit-tested directly.
 */

export type McpExposure = {
  enabled: boolean;
  tokenFile: string;
  endpoint: string;
  healthEndpoint: string;
  token: string | null;
};

export type McpExposureFailureCode =
  | 'not_authenticated'
  | 'admin_required'
  | 'exposure_not_configured'
  | 'exposure_update_failed'
  | 'invalid_request'
  | 'network'
  | 'server_error'
  | 'invalid_response';

export type McpExposureFailure = {
  code: McpExposureFailureCode;
  message: string;
};

export type McpExposureOutcome =
  | { ok: true; data: McpExposure }
  | { ok: false; failure: McpExposureFailure };

type ApiErrorBody = { error?: { code?: string; message?: string } };

export type FetchImpl = typeof fetch;

const FAILURE_MESSAGES: Record<McpExposureFailureCode, string> = {
  not_authenticated: 'Console login is required to manage MCP exposure.',
  admin_required:
    'Your Console account must be an admin to manage MCP exposure.',
  exposure_not_configured:
    'This server was started without a bearer-token file; restart it with --auth-token-file to manage MCP exposure.',
  exposure_update_failed:
    'The MCP exposure change could not be applied — try again.',
  invalid_request: 'The MCP exposure request was not valid.',
  network: 'The server could not be reached.',
  server_error: 'The MCP exposure request failed.',
  invalid_response: 'The server returned an unexpected MCP exposure response.'
};

const SERVER_FAILURE_CODES: readonly McpExposureFailureCode[] = [
  'not_authenticated',
  'admin_required',
  'exposure_not_configured',
  'exposure_update_failed',
  'invalid_request'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function mcpExposureUrl(apiOrigin: string): string {
  return `${apiOrigin}/api/v1/mcp-exposure`;
}

export function parseMcpExposure(value: unknown): McpExposure | null {
  if (!isRecord(value)) return null;
  const { enabled, tokenFile, endpoint, healthEndpoint, token } = value;
  if (typeof enabled !== 'boolean') return null;
  if (typeof tokenFile !== 'string' || typeof endpoint !== 'string')
    return null;
  if (typeof healthEndpoint !== 'string') return null;
  if (token !== undefined && typeof token !== 'string') return null;
  return {
    enabled,
    tokenFile,
    endpoint,
    healthEndpoint,
    token: typeof token === 'string' ? token : null
  };
}

export function mcpExposureFailure(
  code: McpExposureFailureCode,
  message?: string | null
): McpExposureFailure {
  const trimmed = message?.trim();
  if (trimmed) return { code, message: trimmed };
  return { code, message: FAILURE_MESSAGES[code] };
}

/** Maps an HTTP failure onto a machine code and the copy the UI shows. */
export function classifyMcpExposureFailure(
  status: number,
  error?: { code?: string; message?: string } | null
): McpExposureFailure {
  const serverCode = error?.code as McpExposureFailureCode | undefined;
  if (serverCode && SERVER_FAILURE_CODES.includes(serverCode)) {
    return mcpExposureFailure(serverCode, error?.message);
  }
  if (status === 401)
    return mcpExposureFailure('not_authenticated', error?.message);
  if (status === 403)
    return mcpExposureFailure('admin_required', error?.message);
  if (status === 400)
    return mcpExposureFailure('invalid_request', error?.message);
  return mcpExposureFailure('server_error', error?.message);
}

async function requestMcpExposure(
  apiOrigin: string,
  init: RequestInit | undefined,
  fetchImpl: FetchImpl
): Promise<McpExposureOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(mcpExposureUrl(apiOrigin), init);
  } catch {
    return { ok: false, failure: mcpExposureFailure('network') };
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = isRecord(body) ? (body.error as ApiErrorBody['error']) : null;
    return {
      ok: false,
      failure: classifyMcpExposureFailure(response.status, error)
    };
  }
  const exposure = parseMcpExposure(body);
  if (!exposure)
    return { ok: false, failure: mcpExposureFailure('invalid_response') };
  return { ok: true, data: exposure };
}

export async function loadMcpExposure(
  apiOrigin: string,
  fetchImpl: FetchImpl = fetch
): Promise<McpExposureOutcome> {
  return requestMcpExposure(apiOrigin, undefined, fetchImpl);
}

export async function setMcpExposure(
  apiOrigin: string,
  enabled: boolean,
  fetchImpl: FetchImpl = fetch
): Promise<McpExposureOutcome> {
  return requestMcpExposure(
    apiOrigin,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled })
    },
    fetchImpl
  );
}

/**
 * The cloudflared ingress snippet for the hostname the operator chooses.
 * Kept here so the exact shape shown to users is unit-testable.
 */
export function tunnelIngressSnippet(hostname: string): string {
  const trimmed = hostname.trim();
  if (!trimmed) return '';
  return [
    'ingress:',
    `  - hostname: ${trimmed}`,
    '    service: http://127.0.0.1:8787',
    '  - service: http_status:404'
  ].join('\n');
}
