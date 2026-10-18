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
import { Skeleton } from '@/components/ui/skeleton';

import { useWhoami } from '@/hooks/useWhoami';

import {
  type McpKey,
  type McpKeyCreated,
  accountKeysFor,
  createMcpKey,
  formatKeyTimestamp,
  listMcpKeys,
  revokeMcpKey,
  rollMcpKey
} from './mcpKeysApi';

const apiOrigin = (
  import.meta.env.VITE_CATENCE_API_ORIGIN || window.location.origin
).replace(/\/$/, '');

type IssuedKey = {
  title: string;
  key: McpKeyCreated;
};

/**
 * Account-scoped MCP API keys (Settings → API keys). Every account manages
 * only its own keys: the Console scopes the list to the signed-in account and
 * refuses cross-account mutations, and the runtime enforces the same boundary
 * for callers that authenticate with a key or OAuth token directly. Admins
 * keep the full registry in the MCP Exposure tab.
 */
export function AccountApiKeysContent() {
  const whoami = useWhoami();
  const username = whoami?.username ?? null;

  const [keys, setKeys] = useState<McpKey[] | null>(null);
  const [keysError, setKeysError] = useState<string | null>(null);
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

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const ownKeys = useMemo(
    () => (username && keys ? accountKeysFor(keys, username) : []),
    [keys, username]
  );

  const activeCount = useMemo(
    () => ownKeys.filter((key) => !key.revokedAt).length,
    [ownKeys]
  );

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username) {
      setCreateError('Sign in to manage API keys.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    setActionError(null);
    const outcome = await createMcpKey(apiOrigin, { account: username, label });
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

  if (whoami === null) {
    return (
      <main className="flex flex-1 flex-col gap-6 overflow-auto p-6">
        <div>
          <h1 className="text-2xl font-semibold">API keys</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Bearer keys for MCP clients, scoped to your account's athletes.
          </p>
        </div>
        <Skeleton className="h-24 w-full" />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-6 overflow-auto p-6">
      <div>
        <h1 className="text-2xl font-semibold">API keys</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Bearer keys for MCP clients such as Claude or Mistral, scoped to{' '}
          <span className="font-mono text-xs">{username}</span>'s athlete
          grants. Use them as the client's{' '}
          <span className="font-mono text-xs">Authorization: Bearer</span>{' '}
          token. Administrators manage every account's keys in the MCP Exposure
          tab.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Your API keys</CardTitle>
          {keys ? (
            <Badge variant="secondary">{activeCount} active</Badge>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-3">
          {keysError ? (
            <p className="text-sm text-destructive">
              Could not load the API keys: {keysError}
            </p>
          ) : !keys ? (
            <Skeleton className="h-16 w-full" />
          ) : ownKeys.length ? (
            <div className="grid gap-2">
              {ownKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span>{key.label}</span>
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
              <Label htmlFor="account-key-label">Label (optional)</Label>
              <Input
                id="account-key-label"
                value={label}
                placeholder="Claude on my laptop"
                autoComplete="off"
                onChange={(event) => setLabel(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Defaults to "&lt;account&gt; key" when left empty. The key
                inherits this account's athlete grants.
              </p>
            </div>
            {createError ? (
              <p className="text-sm text-destructive">{createError}</p>
            ) : null}
            <div>
              <Button type="submit" disabled={creating || !username}>
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
    </main>
  );
}

export default function AccountApiKeys() {
  return <AccountApiKeysContent />;
}
