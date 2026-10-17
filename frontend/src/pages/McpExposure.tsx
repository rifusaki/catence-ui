import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import CopyButton from '@/components/CopyButton';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

import { type Account, loadAccounts } from './accountsApi';
import {
  type McpExposure,
  loadMcpExposure,
  setMcpExposure,
  tunnelIngressSnippet
} from './mcpExposureApi';
import {
  type McpKey,
  type McpKeyCreated,
  createMcpKey,
  formatKeyTimestamp,
  listMcpKeys,
  revokeMcpKey,
  rollMcpKey
} from './mcpKeysApi';
import {
  type McpOauthSettings,
  getMcpOauthSettings,
  updateMcpOauthSettings
} from './mcpOauthApi';

const apiOrigin = (
  import.meta.env.VITE_CATENCE_API_ORIGIN || window.location.origin
).replace(/\/$/, '');

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
      <CopyButton content={value} className="ml-auto" />
    </div>
  );
}

type IssuedKey = {
  title: string;
  key: McpKeyCreated;
};

/**
 * Admin section for per-account MCP API keys: the key list plus create,
 * revoke (confirmed), and roll actions. A raw token is shown exactly once,
 * in the card that appears right after a create or a roll.
 */
function McpKeysSection() {
  const [keys, setKeys] = useState<McpKey[] | null>(null);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [account, setAccount] = useState('');
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [revoking, setRevoking] = useState<McpKey | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [rollingId, setRollingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    const outcome = await listMcpKeys(apiOrigin);
    if (outcome.ok) {
      setKeys(outcome.data);
      setKeysError(null);
      return;
    }
    setKeysError(outcome.failure.message);
  }, []);

  const loadAccountList = useCallback(async () => {
    const outcome = await loadAccounts(apiOrigin);
    if (outcome.ok) {
      setAccounts(outcome.data.accounts);
      setAccountsError(null);
      return;
    }
    setAccountsError(outcome.failure.message);
  }, []);

  useEffect(() => {
    void loadKeys();
    void loadAccountList();
  }, [loadKeys, loadAccountList]);

  const activeCount = useMemo(
    () => (keys ?? []).filter((key) => !key.revokedAt).length,
    [keys]
  );

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selected = account.trim();
    if (!selected) {
      setCreateError('Choose an account for the key.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    setActionError(null);
    const outcome = await createMcpKey(apiOrigin, {
      account: selected,
      label
    });
    setCreating(false);
    if (!outcome.ok) {
      setCreateError(outcome.failure.message);
      return;
    }
    setIssued({ title: 'New API key', key: outcome.data });
    setLabel('');
    void loadKeys();
  };

  const roll = async (key: McpKey) => {
    setRollingId(key.id);
    setActionError(null);
    const outcome = await rollMcpKey(apiOrigin, key);
    setRollingId(null);
    if (!outcome.ok) {
      setActionError(outcome.failure.message);
      return;
    }
    setIssued({ title: 'Rolled API key', key: outcome.data });
    void loadKeys();
  };

  const submitRevoke = async () => {
    if (!revoking) return;
    setRevokeBusy(true);
    setRevokeError(null);
    setActionError(null);
    const outcome = await revokeMcpKey(apiOrigin, revoking.id);
    setRevokeBusy(false);
    if (!outcome.ok) {
      setRevokeError(outcome.failure.message);
      return;
    }
    setRevoking(null);
    void loadKeys();
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>API keys</CardTitle>
          {keys ? (
            <Badge variant="secondary">{activeCount} active</Badge>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Per-account bearer keys for MCP clients. A key inherits its
            account's athlete grants and works wherever the MCP gate is armed.
            Rolling replaces the token immediately — the old one stops working,
            and rolling a revoked key issues a fresh token and reactivates it.
          </p>
          {keysError ? (
            <p className="text-sm text-destructive">
              Could not load the API keys: {keysError}
            </p>
          ) : !keys ? (
            <Skeleton className="h-16 w-full" />
          ) : keys.length ? (
            <div className="grid gap-2">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span>{key.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {key.account}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatKeyTimestamp(key.createdAt)}
                    {key.revokedAt
                      ? ` · revoked ${formatKeyTimestamp(key.revokedAt)}`
                      : ''}
                  </span>
                  {key.revokedAt ? (
                    <Badge variant="outline" className="text-amber-600">
                      Revoked
                    </Badge>
                  ) : null}
                  <span className="ml-auto flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={rollingId === key.id}
                      onClick={() => void roll(key)}
                    >
                      {rollingId === key.id ? 'Rolling…' : 'Roll'}
                    </Button>
                    {!key.revokedAt ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRevokeError(null);
                          setRevoking(key);
                        }}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No API keys yet — create the first one below.
            </p>
          )}
          {actionError ? (
            <p className="text-sm text-destructive">{actionError}</p>
          ) : null}
        </CardContent>
      </Card>

      {issued ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>{issued.title}</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIssued(null)}
            >
              Dismiss
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              Key for{' '}
              <span className="font-mono text-xs">{issued.key.account}</span> (
              {issued.key.label}).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                {issued.key.token}
              </code>
              <CopyButton content={issued.key.token} />
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
              This token is shown only once and cannot be retrieved again — copy
              it now. Anyone holding it can act as this account.
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Create API key</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={submitCreate}>
            <div className="grid gap-1.5">
              <Label htmlFor="mcp-key-account">Account</Label>
              {accountsError ? (
                <p className="text-sm text-destructive">
                  Could not load the accounts: {accountsError}
                </p>
              ) : !accounts ? (
                <Skeleton className="h-9 w-full" />
              ) : accounts.length ? (
                <Select value={account} onValueChange={setAccount}>
                  <SelectTrigger id="mcp-key-account">
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((entry) => (
                      <SelectItem key={entry.username} value={entry.username}>
                        {entry.username} ({entry.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No Console accounts exist yet — create one in the Accounts
                  tab.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                The key inherits this account's role and athlete grants.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mcp-key-label">Label (optional)</Label>
              <Input
                id="mcp-key-label"
                value={label}
                placeholder="Claude on my laptop"
                autoComplete="off"
                onChange={(event) => setLabel(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Defaults to "&lt;account&gt; key" when left empty.
              </p>
            </div>
            {createError ? (
              <p className="text-sm text-destructive">{createError}</p>
            ) : null}
            <div>
              <Button type="submit" disabled={creating || !account}>
                {creating ? 'Creating…' : 'Create key'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {revoking ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) setRevoking(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke {revoking.label}?</AlertDialogTitle>
              <AlertDialogDescription>
                Clients using this key lose access immediately. The key stays in
                the list as revoked and this cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {revokeError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {revokeError}
              </div>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={revokeBusy}>
                Cancel
              </AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={revokeBusy}
                aria-busy={revokeBusy}
                onClick={() => void submitRevoke()}
              >
                {revokeBusy ? 'Revoking…' : 'Revoke key'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}

const OAUTH_SOURCE_LABELS: Record<McpOauthSettings['source'], string> = {
  console:
    'Set from the Console — overrides CATENCE_OAUTH_ENABLED / CATENCE_PUBLIC_URL',
  environment:
    'Set from CATENCE_OAUTH_ENABLED / CATENCE_PUBLIC_URL (startup default)',
  disabled: 'Not configured'
};

/**
 * Admin section for the OAuth 2.1 authorization server (ChatGPT/Codex
 * sign-in): an enable switch plus the public URL that becomes the advertised
 * issuer. The Console settings take effect immediately — no restart — and
 * override the CATENCE_OAUTH_ENABLED/CATENCE_PUBLIC_URL startup values.
 */
function McpOauthSection() {
  const [settings, setSettings] = useState<McpOauthSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const outcome = await getMcpOauthSettings(apiOrigin);
    if (outcome.ok) {
      setSettings(outcome.data);
      setEnabled(outcome.data.enabled);
      setPublicUrl(outcome.data.publicUrl ?? '');
      setLoadError(null);
      return;
    }
    setLoadError(outcome.failure.message);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = publicUrl.trim();
    if (enabled && !url) {
      setSaveError('The public URL is required when OAuth is enabled.');
      return;
    }
    if (url && !url.startsWith('https://')) {
      setSaveError(
        'The public URL must use https:// — use the tunnel hostname from Remote access setup.'
      );
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    const outcome = await updateMcpOauthSettings(apiOrigin, {
      enabled,
      publicUrl: url
    });
    setSaving(false);
    if (!outcome.ok) {
      setSaveError(outcome.failure.message);
      return;
    }
    setSettings(outcome.data);
    setSaved(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>OAuth 2.1 sign-in</CardTitle>
        {settings ? (
          <Badge
            variant={settings.enabled ? 'default' : 'secondary'}
            className={
              settings.enabled
                ? 'bg-emerald-600 hover:bg-emerald-600'
                : undefined
            }
          >
            {settings.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          ChatGPT and Codex connect with their OAuth flow: a Console account
          signs in at <code className="font-mono text-xs">/oauth/consent</code>{' '}
          and approves the client; the token is scoped to that account's athlete
          grants. Enabling needs the public https URL of this server (the tunnel
          hostname).
        </p>
        {loadError ? (
          <p className="text-sm text-destructive">
            Could not load the OAuth settings: {loadError}
          </p>
        ) : !settings ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            {settings.settingsState === 'invalid' ? (
              <p className="text-sm text-amber-600">
                The stored OAuth settings are unreadable, so OAuth stays
                disabled — saving below rewrites them.
              </p>
            ) : null}
            <form className="grid gap-3" onSubmit={submit}>
              <div className="flex items-center gap-3">
                <Switch
                  aria-label="Toggle OAuth 2.1 sign-in"
                  checked={enabled}
                  disabled={saving}
                  onCheckedChange={(checked) => {
                    setEnabled(checked);
                    setSaved(false);
                  }}
                />
                <span className="text-sm text-muted-foreground">
                  {enabled
                    ? 'OAuth sign-in is available to MCP clients'
                    : 'OAuth sign-in is off'}
                </span>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mcp-oauth-public-url">Public URL</Label>
                <Input
                  id="mcp-oauth-public-url"
                  value={publicUrl}
                  placeholder="https://mcp.example.com"
                  autoComplete="off"
                  onChange={(event) => {
                    setPublicUrl(event.target.value);
                    setSaved(false);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  The public https URL of this server (the tunnel hostname) — it
                  becomes the advertised OAuth issuer.
                </p>
              </div>
              {saveError ? (
                <p className="text-sm text-destructive">{saveError}</p>
              ) : null}
              {saved ? (
                <p className="text-sm text-emerald-600">
                  Saved — the change applies immediately, no restart needed.
                </p>
              ) : null}
              <div>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save OAuth settings'}
                </Button>
              </div>
            </form>
            <p className="text-xs text-muted-foreground">
              {OAUTH_SOURCE_LABELS[settings.source]}.
            </p>
            {settings.enabled && settings.publicUrl ? (
              <div className="grid gap-1">
                <StatusRow
                  label="Authorization server metadata"
                  value={`${settings.publicUrl}/.well-known/oauth-authorization-server`}
                />
                <StatusRow
                  label="Consent page"
                  value={`${settings.publicUrl}/oauth/consent`}
                />
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Admin tab for the Catence MCP server's remote exposure: the bearer-token
 * gate, its token, and everything needed to point an MCP client at this
 * server locally or through a tunnel (Console proxies the calls and checks
 * the admin role).
 */
export function McpExposureContent() {
  const [exposure, setExposure] = useState<McpExposure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hostname, setHostname] = useState('');

  const load = useCallback(async () => {
    const outcome = await loadMcpExposure(apiOrigin);
    if (outcome.ok) {
      setExposure(outcome.data);
      setError(null);
      return;
    }
    setError(outcome.failure.message);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    const outcome = await setMcpExposure(apiOrigin, enabled);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.failure.message);
      return;
    }
    setExposure(outcome.data);
    setRevealed(enabled ? revealed : false);
  };

  const snippet = useMemo(() => tunnelIngressSnippet(hostname), [hostname]);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-6">
      <div>
        <h2 className="text-lg font-semibold">MCP exposure</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Expose the Catence MCP server to local and remote MCP clients. A
          generated bearer token gates every endpoint except the health probes;
          the only extra setup a remote client needs is an HTTPS tunnel or
          reverse proxy in front of this server.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!exposure ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Bearer-token gate</CardTitle>
              <Badge
                variant={exposure.enabled ? 'default' : 'secondary'}
                className={
                  exposure.enabled
                    ? 'bg-emerald-600 hover:bg-emerald-600'
                    : undefined
                }
              >
                {exposure.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </CardHeader>
            <CardContent className="grid gap-3">
              <StatusRow label="MCP endpoint" value={exposure.endpoint} />
              <StatusRow
                label="Health endpoint"
                value={exposure.healthEndpoint}
              />
              <StatusRow label="Token file" value={exposure.tokenFile} />
              <p className="text-xs text-muted-foreground">
                The token file's presence is the switch — toggling here takes
                effect immediately, without restarting the server.
              </p>
              <div>
                {exposure.enabled ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void toggle(false)}
                  >
                    {busy ? 'Disabling…' : 'Disable remote access'}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggle(true)}
                  >
                    {busy ? 'Enabling…' : 'Enable remote access'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {exposure.enabled ? (
            <Card>
              <CardHeader>
                <CardTitle>Bearer token</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                    {exposure.token && revealed
                      ? exposure.token
                      : '•'.repeat(24)}
                  </code>
                  {exposure.token ? (
                    <CopyButton content={exposure.token} />
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevealed(!revealed)}
                  >
                    {revealed ? 'Hide' : 'Reveal'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste this token into the client's credential flow (for
                  example a Mistral Work custom connector). Treat it as a
                  password: anyone holding it can query every athlete store.
                  Rotating means disabling and enabling again.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Remote access setup</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p className="text-sm text-muted-foreground">
                Route an HTTPS hostname to the MCP endpoint with a Cloudflare
                Tunnel (or any reverse proxy). Keep the server bound to loopback
                — the tunnel client connects from the same machine.
              </p>
              <div className="grid gap-1.5">
                <Label htmlFor="mcp-hostname">Public hostname</Label>
                <Input
                  id="mcp-hostname"
                  value={hostname}
                  placeholder="mcp.example.com"
                  autoComplete="off"
                  onChange={(event) => setHostname(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  A domain you control in Cloudflare; route its DNS to the
                  tunnel first:{' '}
                  <code className="font-mono text-xs">
                    cloudflared tunnel route dns &lt;tunnel&gt;{' '}
                    {hostname.trim() || '<hostname>'}
                  </code>
                </p>
              </div>
              {snippet ? (
                <div className="relative">
                  <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs">
                    {snippet}
                  </pre>
                  <div className="absolute right-2 top-2">
                    <CopyButton content={snippet} />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Enter the hostname to generate the cloudflared ingress snippet
                  for your tunnel config.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                MCP clients require a valid HTTPS URL — that is why the tunnel
                is mandatory for remote access. Register the full endpoint path
                (<code className="font-mono text-xs">/mcp</code>) as the server
                URL and complete the bearer credential flow with the token
                above.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      <McpOauthSection />
      <McpKeysSection />
    </div>
  );
}

export default McpExposureContent;
