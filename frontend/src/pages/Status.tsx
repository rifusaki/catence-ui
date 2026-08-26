import { useEffect, useState } from 'react';

import Page from 'pages/Page';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { displayTimestamp, useSync } from '@/hooks/useSync';

type AthleteRoster = {
  defaultAthleteId: string;
  athletes: Array<{ id: string; label: string }>;
};

type HealthStatus = {
  status: string;
  service: string;
  runtimeVersion: string;
  protocolVersion: number;
  capabilities: Record<string, unknown>;
};

const apiOrigin = (
  import.meta.env.VITE_CATENCE_API_ORIGIN || window.location.origin
).replace(/\/$/, '');

function HealthCard() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const candidates = [
        `${apiOrigin}/api/v1/health`,
        `http://127.0.0.1:8787/api/v1/health`,
        `http://127.0.0.1:8787/health`,
        `${apiOrigin}/health`
      ];
      let lastError: unknown = null;
      for (const url of candidates) {
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) {
            lastError = new Error(
              `Health request failed (${response.status}) at ${url}.`
            );
            continue;
          }
          const text = await response.text();
          // The console serves the SPA HTML for unknown API routes (200 with <!doctype)
          if (
            text.trim().startsWith('<!doctype') ||
            text.trim().startsWith('<html')
          ) {
            lastError = new Error(
              `Health endpoint not available at ${url} (returned HTML).`
            );
            continue;
          }
          const data = JSON.parse(text) as HealthStatus;
          if (data && typeof data.status === 'string') {
            setHealth(data);
            setLoading(false);
            return;
          }
          lastError = new Error(`Invalid health response from ${url}.`);
        } catch (caught) {
          if ((caught as DOMException).name === 'AbortError') return;
          lastError = caught;
        }
      }
      setError(
        lastError instanceof Error ? lastError.message : String(lastError)
      );
      setLoading(false);
    })();
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service health</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !health) {
    return (
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="text-base">Service health</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-900 dark:text-amber-100">
          <p>
            Health check unavailable — the runtime may be starting or
            unreachable.
          </p>
          {error ? (
            <p className="mt-2 text-xs text-muted-foreground">{error}</p>
          ) : null}
          <p className="mt-2 text-xs">
            If this persists, verify the runtime is running at{' '}
            <code className="rounded bg-muted px-1 py-0.5">{apiOrigin}</code>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Service health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${health.status === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'}`}
          />
          <span className="font-medium">{health.status}</span>
          <span className="text-muted-foreground">· {health.service}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            Runtime:{' '}
            <span className="font-medium text-foreground">
              {health.runtimeVersion}
            </span>
          </div>
          <div>
            Protocol:{' '}
            <span className="font-medium text-foreground">
              v{health.protocolVersion}
            </span>
          </div>
        </div>
        {health.capabilities ? (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Capabilities
            </summary>
            <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(health.capabilities, null, 2)}
            </pre>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SyncCard({
  roster,
  athleteId,
  onAthleteChange
}: {
  roster: AthleteRoster | null;
  athleteId: string | null;
  onAthleteChange: (id: string) => void;
}) {
  const { status, starting, syncError, start } = useSync(athleteId);
  const runningCount = status?.progress.running.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sync</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {roster && athleteId ? (
          <label className="flex w-fit items-center gap-2 text-sm">
            Athlete
            <select
              className="rounded-md border bg-background px-2 py-1 text-foreground"
              value={athleteId}
              onChange={(event) => onAthleteChange(event.target.value)}
            >
              {roster.athletes.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.label}
                </option>
              ))}
            </select>
          </label>
        ) : roster ? (
          <p className="text-sm text-muted-foreground">
            Athlete roster loaded — select an athlete to sync.
          </p>
        ) : (
          <Skeleton className="h-8 w-48" />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            disabled={starting || !athleteId || runningCount > 0}
            aria-busy={starting || runningCount > 0}
            title={
              !athleteId
                ? 'Athlete roster unavailable — select an athlete first.'
                : undefined
            }
            onClick={() => void start()}
          >
            {runningCount > 0 ? 'Syncing…' : 'Sync data'}
          </Button>
          {runningCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              {status!.progress.running
                .map(
                  (run) =>
                    `Syncing… ${run.provider} ${run.percentComplete.toFixed(0)}% (${run.stage})`
                )
                .join(' · ')}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Last sync:{' '}
              {displayTimestamp(status?.lastSync?.lastCompletedAt ?? null)}
            </span>
          )}
        </div>

        {syncError ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
            {syncError}
          </div>
        ) : null}

        {status?.lastSync?.providers ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">
              Per-provider last sync
            </div>
            {Object.entries(status.lastSync.providers).map(
              ([provider, timestamp]) => (
                <div key={provider} className="flex justify-between">
                  <span>{provider}</span>
                  <span>{displayTimestamp(timestamp)}</span>
                </div>
              )
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DataSummaryCard({
  roster,
  syncStatus
}: {
  roster: AthleteRoster | null;
  syncStatus: ReturnType<typeof useSync>['status'];
}) {
  if (!roster) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Data summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Athletes</span>
          <span className="font-medium">{roster.athletes.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Default athlete</span>
          <span className="font-medium">{roster.defaultAthleteId}</span>
        </div>
        {syncStatus?.lastSync ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last completed</span>
            <span className="font-medium">
              {displayTimestamp(syncStatus.lastSync.lastCompletedAt)}
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusContent() {
  const [roster, setRoster] = useState<AthleteRoster | null>(null);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const { status: syncStatus } = useSync(athleteId);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`${apiOrigin}/api/v1/athletes`, {
          signal: controller.signal
        });
        if (response.status === 404) return;
        if (!response.ok)
          throw new Error(
            `Athlete roster request failed (${response.status}).`
          );
        const nextRoster = (await response.json()) as AthleteRoster;
        if (
          !nextRoster.athletes.some((a) => a.id === nextRoster.defaultAthleteId)
        )
          throw new Error('Invalid athlete roster.');
        setRoster(nextRoster);
        setAthleteId(nextRoster.defaultAthleteId);
      } catch {
        // Roster is best-effort for Status; health + sync degrade gracefully.
      } finally {
        setRosterLoaded(true);
      }
    })();
    return () => controller.abort();
  }, []);

  // Keep athleteId in sync if roster loads after mount
  useEffect(() => {
    if (rosterLoaded && roster && !athleteId)
      setAthleteId(roster.defaultAthleteId);
  }, [roster, rosterLoaded, athleteId]);

  return (
    <main className="flex flex-1 flex-col gap-6 overflow-auto p-6">
      <div>
        <h1 className="text-2xl font-semibold">Status</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Runtime health, sync progress, and data summary — degraded gracefully
          when a sync holds the write lock.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <HealthCard />
        <SyncCard
          roster={roster}
          athleteId={athleteId}
          onAthleteChange={setAthleteId}
        />
      </div>

      <DataSummaryCard roster={roster} syncStatus={syncStatus} />
    </main>
  );
}

export default function Status() {
  return (
    <Page>
      <StatusContent />
    </Page>
  );
}
