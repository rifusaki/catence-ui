import { useCallback, useEffect, useMemo, useState } from 'react';

import CopyButton from '@/components/CopyButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

import {
  type McpExposure,
  loadMcpExposure,
  setMcpExposure,
  tunnelIngressSnippet
} from './mcpExposureApi';

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
    </div>
  );
}

export default McpExposureContent;
