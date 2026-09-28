/**
 * Pure helpers and API wrappers behind the Accounts admin page. Kept
 * React-free so URL building, payload construction, response parsing, and
 * error classification can be unit-tested directly.
 */

export type AccountRole = 'admin' | 'member';

/**
 * `'all'` grants every athlete — including ones added later. An id list
 * grants exactly those athletes; an empty list grants none.
 */
export type AthleteGrant = 'all' | string[];

export type Account = {
  username: string;
  role: AccountRole;
  athletes: AthleteGrant;
  createdAt: string;
};

export type AccountsSnapshot = {
  accounts: Account[];
  breakGlass: { username: string } | null;
};

export type Whoami = {
  username: string;
  role: AccountRole;
  athletes: AthleteGrant;
};

export type AthleteOption = { id: string; label: string };

export type AccountsAction = 'add' | 'update' | 'remove' | 'passwd';

export type AccountsFailureCode =
  | 'not_authenticated'
  | 'admin_required'
  | 'invalid_request'
  | 'account_exists'
  | 'account_not_found'
  | 'last_admin'
  | 'tool_server_not_found'
  | 'tool_server_secrets_error'
  | 'network'
  | 'server_error'
  | 'invalid_response';

export type AccountsFailure = {
  code: AccountsFailureCode;
  message: string;
};

export type AccountsOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; failure: AccountsFailure };

export type NewAccount = {
  username: string;
  password: string;
  role: AccountRole;
  athletes: AthleteGrant;
};

export type AccountGrantsUpdate = {
  username: string;
  athletes: AthleteGrant;
};

export type ToolServerSecretSource = 'console' | 'environment';

export type ToolServerSecret = {
  name: string;
  configured: boolean;
  source: ToolServerSecretSource | null;
};

export type ToolServer = {
  name: string;
  label: string;
  url: string;
  secrets: ToolServerSecret[];
};

export type ToolServersSnapshot = {
  servers: ToolServer[];
};

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

type ApiErrorBody = {
  error?: { code?: string; message?: string };
};

const FAILURE_MESSAGES: Record<
  Exclude<AccountsFailureCode, 'server_error'>,
  string
> = {
  not_authenticated: 'The Console session has expired — sign in again.',
  admin_required: 'Administrator access is required to manage accounts.',
  invalid_request: 'The request was rejected — check the values and try again.',
  account_exists: 'That username already exists.',
  account_not_found:
    'That account no longer exists — it may have been removed.',
  last_admin:
    'That is the last admin — promote another admin before removing it.',
  network: 'Network error — could not reach the Catence server.',
  invalid_response: 'The Catence server returned an invalid accounts response.',
  tool_server_not_found: 'That tool server is not configured.',
  tool_server_secrets_error:
    'The Console tool-server credential store is unusable.'
};

const SERVER_FAILURE_CODES: readonly AccountsFailureCode[] = [
  'not_authenticated',
  'admin_required',
  'invalid_request',
  'account_exists',
  'account_not_found',
  'last_admin',
  'tool_server_not_found',
  'tool_server_secrets_error'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function whoamiUrl(apiOrigin: string): string {
  return `${apiOrigin}/api/v1/whoami`;
}

export function accountsUrl(apiOrigin: string): string {
  return `${apiOrigin}/api/v1/accounts`;
}

export function accountsActionUrl(
  apiOrigin: string,
  action: AccountsAction
): string {
  return `${apiOrigin}/api/v1/accounts/${action}`;
}

export function athletesUrl(apiOrigin: string): string {
  return `${apiOrigin}/api/v1/athletes`;
}

export function toolServersUrl(apiOrigin: string): string {
  return `${apiOrigin}/api/v1/tool-servers`;
}

export function toolServerSecretUrl(
  apiOrigin: string,
  serverName: string
): string {
  return `${apiOrigin}/api/v1/tool-servers/${encodeURIComponent(serverName)}/secrets`;
}

/** Admins always have `'all'`, whatever the form collected. */
function athletesForRole(
  role: AccountRole,
  athletes: AthleteGrant
): AthleteGrant {
  return role === 'admin' ? 'all' : athletes;
}

export function buildAddAccountPayload(account: NewAccount): NewAccount {
  return {
    username: account.username.trim(),
    password: account.password,
    role: account.role,
    athletes: athletesForRole(account.role, account.athletes)
  };
}

export function buildUpdateAccountPayload(
  update: AccountGrantsUpdate
): AccountGrantsUpdate {
  return { username: update.username.trim(), athletes: update.athletes };
}

export function parseAthleteGrant(value: unknown): AthleteGrant | null {
  if (value === 'all') return 'all';
  if (Array.isArray(value) && value.every((id) => typeof id === 'string'))
    return [...value];
  return null;
}

export function parseAccount(value: unknown): Account | null {
  if (!isRecord(value)) return null;
  const { username, role, createdAt } = value;
  const athletes = parseAthleteGrant(value.athletes);
  if (typeof username !== 'string') return null;
  if (role !== 'admin' && role !== 'member') return null;
  if (athletes === null) return null;
  return {
    username,
    role,
    athletes,
    createdAt: typeof createdAt === 'string' ? createdAt : ''
  };
}

export function parseWhoami(value: unknown): Whoami | null {
  if (!isRecord(value)) return null;
  const { username, role } = value;
  const athletes = parseAthleteGrant(value.athletes);
  if (typeof username !== 'string') return null;
  if (role !== 'admin' && role !== 'member') return null;
  if (athletes === null) return null;
  return { username, role, athletes };
}

export function parseAccountsSnapshot(value: unknown): AccountsSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.accounts)) return null;
  const accounts: Account[] = [];
  for (const entry of value.accounts) {
    const account = parseAccount(entry);
    if (!account) return null;
    accounts.push(account);
  }
  let breakGlass: { username: string } | null = null;
  if (value.breakGlass != null) {
    if (
      !isRecord(value.breakGlass) ||
      typeof value.breakGlass.username !== 'string'
    )
      return null;
    breakGlass = { username: value.breakGlass.username };
  }
  return { accounts, breakGlass };
}

export function parseAthleteOptions(value: unknown): AthleteOption[] | null {
  if (!isRecord(value) || !Array.isArray(value.athletes)) return null;
  const options: AthleteOption[] = [];
  for (const entry of value.athletes) {
    if (!isRecord(entry) || typeof entry.id !== 'string') return null;
    options.push({
      id: entry.id,
      label: typeof entry.label === 'string' ? entry.label : entry.id
    });
  }
  return options;
}

export function formatAthleteGrant(grant: AthleteGrant): string {
  if (grant === 'all') return 'all';
  return grant.length ? grant.join(', ') : 'none';
}

export function accountsFailure(
  code: AccountsFailureCode,
  message?: string | null
): AccountsFailure {
  const trimmed = message?.trim();
  if (trimmed) return { code, message: trimmed };
  if (code === 'server_error')
    return { code, message: 'The account request failed.' };
  return { code, message: FAILURE_MESSAGES[code] };
}

function failureCodeFor(
  status: number,
  serverCode?: string
): AccountsFailureCode {
  if (
    serverCode &&
    SERVER_FAILURE_CODES.includes(serverCode as AccountsFailureCode)
  )
    return serverCode as AccountsFailureCode;
  if (status === 401) return 'not_authenticated';
  if (status === 403) return 'admin_required';
  if (status === 400) return 'invalid_request';
  if (status === 404) return 'account_not_found';
  if (status === 409) return 'account_exists';
  return 'server_error';
}

/** Maps an HTTP failure onto a machine code and the copy the UI shows. */
export function classifyAccountsFailure(
  status: number,
  error?: { code?: string; message?: string } | null
): AccountsFailure {
  const code = failureCodeFor(status, error?.code);
  const message =
    error?.message?.trim() ||
    (code === 'server_error' ? `Account request failed (${status}).` : '');
  return accountsFailure(code, message);
}

export async function loadWhoami(
  apiOrigin: string,
  fetchImpl: FetchImpl = fetch
): Promise<AccountsOutcome<Whoami | null>> {
  let response: Response;
  try {
    response = await fetchImpl(whoamiUrl(apiOrigin));
  } catch {
    return { ok: false, failure: accountsFailure('network') };
  }
  // Standalone Catence servers have no Console accounts API.
  if (response.status === 404) return { ok: true, data: null };
  const body = (await response.json().catch(() => null)) as
    | (Whoami & ApiErrorBody)
    | null;
  if (!response.ok)
    return {
      ok: false,
      failure: classifyAccountsFailure(response.status, body?.error)
    };
  const whoami = parseWhoami(body);
  if (!whoami)
    return { ok: false, failure: accountsFailure('invalid_response') };
  return { ok: true, data: whoami };
}

export async function loadAccounts(
  apiOrigin: string,
  fetchImpl: FetchImpl = fetch
): Promise<AccountsOutcome<AccountsSnapshot>> {
  let response: Response;
  try {
    response = await fetchImpl(accountsUrl(apiOrigin));
  } catch {
    return { ok: false, failure: accountsFailure('network') };
  }
  const body = (await response.json().catch(() => null)) as
    | (AccountsSnapshot & ApiErrorBody)
    | null;
  if (!response.ok)
    return {
      ok: false,
      failure: classifyAccountsFailure(response.status, body?.error)
    };
  const snapshot = parseAccountsSnapshot(body);
  if (!snapshot)
    return { ok: false, failure: accountsFailure('invalid_response') };
  return { ok: true, data: snapshot };
}

export async function loadAthleteOptions(
  apiOrigin: string,
  fetchImpl: FetchImpl = fetch
): Promise<AccountsOutcome<AthleteOption[]>> {
  let response: Response;
  try {
    response = await fetchImpl(athletesUrl(apiOrigin));
  } catch {
    return { ok: false, failure: accountsFailure('network') };
  }
  // An empty or absent roster is a valid state — there is simply nothing to
  // grant yet — so callers render a friendly message instead of an error.
  if (response.status === 404) return { ok: true, data: [] };
  const body = (await response.json().catch(() => null)) as
    | ({ athletes?: unknown } & ApiErrorBody)
    | null;
  if (!response.ok)
    return {
      ok: false,
      failure: classifyAccountsFailure(response.status, body?.error)
    };
  const options = parseAthleteOptions(body);
  if (!options)
    return { ok: false, failure: accountsFailure('invalid_response') };
  return { ok: true, data: options };
}

async function postAccountsAction(
  apiOrigin: string,
  action: AccountsAction,
  payload: Record<string, unknown>,
  fetchImpl: FetchImpl
): Promise<AccountsOutcome<null>> {
  let response: Response;
  try {
    response = await fetchImpl(accountsActionUrl(apiOrigin, action), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {
    return { ok: false, failure: accountsFailure('network') };
  }
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  if (!response.ok)
    return {
      ok: false,
      failure: classifyAccountsFailure(response.status, body?.error)
    };
  // Success responses carry nothing the page needs — the list is refetched.
  return { ok: true, data: null };
}

export function addAccount(
  apiOrigin: string,
  account: NewAccount,
  fetchImpl: FetchImpl = fetch
): Promise<AccountsOutcome<null>> {
  return postAccountsAction(
    apiOrigin,
    'add',
    buildAddAccountPayload(account),
    fetchImpl
  );
}

export function updateAccountGrants(
  apiOrigin: string,
  update: AccountGrantsUpdate,
  fetchImpl: FetchImpl = fetch
): Promise<AccountsOutcome<null>> {
  return postAccountsAction(
    apiOrigin,
    'update',
    buildUpdateAccountPayload(update),
    fetchImpl
  );
}

export function removeAccount(
  apiOrigin: string,
  username: string,
  fetchImpl: FetchImpl = fetch
): Promise<AccountsOutcome<null>> {
  return postAccountsAction(
    apiOrigin,
    'remove',
    { username: username.trim() },
    fetchImpl
  );
}

export function resetAccountPassword(
  apiOrigin: string,
  username: string,
  password: string,
  fetchImpl: FetchImpl = fetch
): Promise<AccountsOutcome<null>> {
  return postAccountsAction(
    apiOrigin,
    'passwd',
    { username: username.trim(), password },
    fetchImpl
  );
}

// Extra tool servers (console.mcpServers credentials)

export function parseToolServerSecret(value: unknown): ToolServerSecret | null {
  if (!isRecord(value)) return null;
  const { name, configured, source } = value;
  if (typeof name !== 'string' || !name) return null;
  if (typeof configured !== 'boolean') return null;
  if (source !== null && source !== 'console' && source !== 'environment') {
    return null;
  }
  return { name, configured, source };
}

export function parseToolServer(value: unknown): ToolServer | null {
  if (!isRecord(value)) return null;
  const { name, label, url, secrets } = value;
  if (typeof name !== 'string' || !name) return null;
  if (typeof url !== 'string' || !url) return null;
  if (!Array.isArray(secrets)) return null;
  const parsedSecrets: ToolServerSecret[] = [];
  for (const entry of secrets) {
    const secret = parseToolServerSecret(entry);
    if (!secret) return null;
    parsedSecrets.push(secret);
  }
  return {
    name,
    label: typeof label === 'string' && label ? label : name,
    url,
    secrets: parsedSecrets
  };
}

export function parseToolServersSnapshot(
  value: unknown
): ToolServersSnapshot | null {
  if (!isRecord(value)) return null;
  const { servers } = value;
  if (!Array.isArray(servers)) return null;
  const parsed: ToolServer[] = [];
  for (const entry of servers) {
    const server = parseToolServer(entry);
    if (!server) return null;
    parsed.push(server);
  }
  return { servers: parsed };
}

export async function loadToolServers(
  apiOrigin: string,
  fetchImpl: FetchImpl = fetch
): Promise<AccountsOutcome<ToolServersSnapshot>> {
  let response: Response;
  try {
    response = await fetchImpl(toolServersUrl(apiOrigin));
  } catch {
    return { ok: false, failure: accountsFailure('network') };
  }
  if (response.status === 404) {
    // Standalone servers without the Console API expose no tool servers.
    return { ok: true, data: { servers: [] } };
  }
  const body = (await response.json().catch(() => null)) as
    | (ToolServersSnapshot & ApiErrorBody)
    | null;
  if (!response.ok) {
    return {
      ok: false,
      failure: classifyAccountsFailure(response.status, body?.error)
    };
  }
  const snapshot = parseToolServersSnapshot(body);
  if (!snapshot) {
    return { ok: false, failure: accountsFailure('invalid_response') };
  }
  return { ok: true, data: snapshot };
}

async function postToolServerSecret(
  apiOrigin: string,
  serverName: string,
  secretName: string,
  value: string | null,
  fetchImpl: FetchImpl
): Promise<AccountsOutcome<ToolServersSnapshot>> {
  let response: Response;
  try {
    response = await fetchImpl(toolServerSecretUrl(apiOrigin, serverName), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: secretName, value })
    });
  } catch {
    return { ok: false, failure: accountsFailure('network') };
  }
  const body = (await response.json().catch(() => null)) as
    | (ToolServersSnapshot & ApiErrorBody)
    | null;
  if (!response.ok) {
    return {
      ok: false,
      failure: classifyAccountsFailure(response.status, body?.error)
    };
  }
  const snapshot = parseToolServersSnapshot(body);
  if (!snapshot) {
    return { ok: false, failure: accountsFailure('invalid_response') };
  }
  return { ok: true, data: snapshot };
}

export function saveToolServerSecret(
  apiOrigin: string,
  serverName: string,
  secretName: string,
  value: string,
  fetchImpl: FetchImpl = fetch
): Promise<AccountsOutcome<ToolServersSnapshot>> {
  return postToolServerSecret(
    apiOrigin,
    serverName,
    secretName,
    value,
    fetchImpl
  );
}

export function clearToolServerSecret(
  apiOrigin: string,
  serverName: string,
  secretName: string,
  fetchImpl: FetchImpl = fetch
): Promise<AccountsOutcome<ToolServersSnapshot>> {
  return postToolServerSecret(
    apiOrigin,
    serverName,
    secretName,
    null,
    fetchImpl
  );
}
