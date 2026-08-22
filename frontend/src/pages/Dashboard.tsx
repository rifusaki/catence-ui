import type { Data, Layout } from 'plotly.js';
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import Page from 'pages/Page';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const Plot = lazy(() =>
  import('react-plotly.js').then((module) => ({ default: module.default }))
);

type DailyHealth = {
  metric_date: string;
  provider: string;
  resting_hr_bpm: number | null;
  hrv_ms: number | null;
  sleep_seconds: number | null;
  sleep_score: number | null;
  stress: number | null;
  body_battery: number | null;
  readiness: number | null;
  steps: number | null;
};

type TrainingWeek = {
  week_start: string;
  activity_count: number;
  distance_m: number | null;
  moving_s: number | null;
  elevation_gain_m: number | null;
  training_load: number | null;
};

type Activity = {
  activity_id: string;
  started_at_utc: string;
  sport: string | null;
  name: string | null;
  distance_m: number | null;
  moving_s: number | null;
  elevation_gain_m: number | null;
  training_load: number | null;
  provider: string;
};

type DashboardSnapshot = {
  generatedAt: string;
  period: { startDate: string; endDate: string; days: number };
  health: DailyHealth[];
  training: { weeks: TrainingWeek[] };
  activities: Activity[];
  caveats: string[];
};

type AthleteRoster = {
  defaultAthleteId: string;
  athletes: Array<{ id: string; label: string }>;
};

type SyncRun = {
  runId: string;
  provider: string;
  stage: string;
  percentComplete: number;
};

type SyncStatus = {
  athleteId: string;
  progress: { running: SyncRun[] };
  lastSync: {
    lastCompletedAt: string | null;
    providers: Record<string, string>;
  } | null;
};

const apiOrigin = (
  import.meta.env.VITE_CATENCE_API_ORIGIN || window.location.origin
).replace(/\/$/, '');

function displayNumber(value: number | null, digits = 0): string {
  return value === null ? '—' : value.toFixed(digits);
}

function displayDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function displayTimestamp(value: string | null): string {
  if (!value) return 'never';
  const parsed = new Date(
    value.endsWith('Z') || value.includes('+') ? value : `${value}Z`
  );
  return Number.isNaN(parsed.getTime()) ? 'never' : parsed.toLocaleString();
}

/**
 * Detached sync trigger with live progress. The runtime spawns its own
 * `catence-data sync` child, so leaving this page (or the browser) never
 * interrupts a running backfill.
 */
function useSync(athleteId: string | null) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!athleteId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `${apiOrigin}/api/v1/sync/status?athleteId=${encodeURIComponent(athleteId)}`,
          { signal: controller.signal }
        );
        if (!response.ok) return;
        setStatus((await response.json()) as SyncStatus);
      } catch {
        // Status is best-effort; the dashboard itself stays usable.
      }
    })();
    return () => controller.abort();
  }, [athleteId]);

  useEffect(() => {
    const running = status?.progress.running.length ?? 0;
    if (!athleteId || !running) return;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(
            `${apiOrigin}/api/v1/sync/status?athleteId=${encodeURIComponent(athleteId)}`
          );
          if (response.ok) setStatus((await response.json()) as SyncStatus);
        } catch {
          // Keep polling; transient errors are not fatal.
        }
      })();
    }, 3_000);
    return () => clearInterval(timer);
  }, [athleteId, status?.progress.running.length]);

  const start = useCallback(async () => {
    if (!athleteId) return;
    setStarting(true);
    setSyncError(null);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          athleteId,
          provider: 'all',
          refresh: false,
          refreshModels: true
        })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error?.message ?? `Sync failed to start (${response.status}).`
        );
      }
      const poll = setInterval(() => {
        void (async () => {
          try {
            const statusResponse = await fetch(
              `${apiOrigin}/api/v1/sync/status?athleteId=${encodeURIComponent(athleteId)}`
            );
            if (statusResponse.ok)
              setStatus((await statusResponse.json()) as SyncStatus);
          } catch {
            // Keep polling.
          }
        })();
      }, 3_000);
      // Stop the start-triggered poll once nothing runs; the idle watcher
      // above takes over afterwards.
      setTimeout(() => clearInterval(poll), 15 * 60_000);
    } catch (caught) {
      setSyncError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setStarting(false);
    }
  }, [athleteId]);

  return { status, starting, syncError, start };
}

const chartLayout: Partial<Layout> = {
  autosize: true,
  margin: { l: 42, r: 24, t: 12, b: 38 },
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: 'hsl(var(--foreground))' },
  legend: { orientation: 'h', y: 1.18 },
  xaxis: { fixedrange: true },
  yaxis: { fixedrange: true, rangemode: 'tozero' }
};

function DashboardContent() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roster, setRoster] = useState<AthleteRoster | null>(null);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const { status: syncStatus, starting, syncError, start } = useSync(athleteId);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`${apiOrigin}/api/v1/athletes`, {
          signal: controller.signal
        });
        // Older standalone Catence servers have no roster endpoint. Preserve
        // VITE_CATENCE_API_ORIGIN deployments by using their legacy dashboard.
        if (response.status === 404) return;
        if (!response.ok)
          throw new Error(
            `Catence athlete roster request failed (${response.status}).`
          );
        const nextRoster = (await response.json()) as AthleteRoster;
        if (
          !nextRoster.athletes.some(
            (athlete) => athlete.id === nextRoster.defaultAthleteId
          )
        )
          throw new Error('Catence returned an invalid athlete roster.');
        setRoster(nextRoster);
        setAthleteId(nextRoster.defaultAthleteId);
      } catch (caught) {
        if ((caught as DOMException).name !== 'AbortError')
          setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setRosterLoaded(true);
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!rosterLoaded || (roster && !athleteId)) return;
    const controller = new AbortController();
    void (async () => {
      try {
        setError(null);
        const query = new URLSearchParams({ days: '28' });
        if (athleteId) query.set('athleteId', athleteId);
        const response = await fetch(`${apiOrigin}/api/v1/dashboard?${query}`, {
          signal: controller.signal
        });
        if (!response.ok)
          throw new Error(
            `Catence dashboard request failed (${response.status}).`
          );
        setSnapshot((await response.json()) as DashboardSnapshot);
      } catch (caught) {
        if ((caught as DOMException).name !== 'AbortError')
          setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => controller.abort();
  }, [athleteId, roster, rosterLoaded]);

  const latestHealth = snapshot?.health.at(-1) ?? null;
  const healthData = useMemo<Data[]>(() => {
    if (!snapshot) return [];
    const dates = snapshot.health.map((row) => row.metric_date);
    return [
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Readiness',
        x: dates,
        y: snapshot.health.map((row) => row.readiness),
        connectgaps: false
      },
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Body Battery',
        x: dates,
        y: snapshot.health.map((row) => row.body_battery),
        connectgaps: false
      },
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Sleep score',
        x: dates,
        y: snapshot.health.map((row) => row.sleep_score),
        connectgaps: false
      }
    ];
  }, [snapshot]);
  const weeklyData = useMemo<Data[]>(() => {
    if (!snapshot) return [];
    return [
      {
        type: 'bar',
        name: 'Training load',
        x: snapshot.training.weeks.map((row) => row.week_start),
        y: snapshot.training.weeks.map((row) => row.training_load)
      },
      {
        type: 'bar',
        name: 'Distance (km)',
        x: snapshot.training.weeks.map((row) => row.week_start),
        y: snapshot.training.weeks.map((row) =>
          row.distance_m === null ? null : row.distance_m / 1000
        ),
        yaxis: 'y2'
      }
    ];
  }, [snapshot]);

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-sm text-destructive">
        {error}
      </main>
    );
  }
  if (!snapshot) {
    return (
      <main className="flex flex-1 flex-col gap-6 overflow-auto p-6">
        <Skeleton className="h-12 w-56" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  const weeklyLayout: Partial<Layout> = {
    ...chartLayout,
    barmode: 'group',
    yaxis2: {
      overlaying: 'y',
      side: 'right',
      fixedrange: true,
      rangemode: 'tozero',
      title: 'km'
    }
  };

  return (
    <main className="flex flex-1 flex-col gap-6 overflow-auto p-6">
      <div>
        <h1 className="text-2xl font-semibold">Training dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {snapshot.period.startDate} to {snapshot.period.endDate} · generated{' '}
          {new Date(snapshot.generatedAt).toLocaleString()}
        </p>
        {roster && athleteId ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <label className="flex w-fit items-center gap-2">
              Athlete
              <select
                className="rounded-md border bg-background px-2 py-1 text-foreground"
                value={athleteId}
                onChange={(event) => {
                  setSnapshot(null);
                  setAthleteId(event.target.value);
                }}
              >
                {roster.athletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={
                starting || (syncStatus?.progress.running.length ?? 0) > 0
              }
              onClick={() => void start()}
            >
              Sync data
            </Button>
            {(syncStatus?.progress.running.length ?? 0) > 0 ? (
              <span className="text-xs">
                {syncStatus!.progress.running
                  .map(
                    (run) =>
                      `${run.provider} ${run.percentComplete.toFixed(0)}% (${run.stage})`
                  )
                  .join(' · ')}
              </span>
            ) : (
              <span className="text-xs">
                Last sync:{' '}
                {displayTimestamp(
                  syncStatus?.lastSync?.lastCompletedAt ?? null
                )}
              </span>
            )}
          </div>
        ) : null}
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Readiness</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {displayNumber(latestHealth?.readiness ?? null)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Body Battery</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {displayNumber(latestHealth?.body_battery ?? null)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">HRV</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {displayNumber(latestHealth?.hrv_ms ?? null)}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ms
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sleep</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {displayDuration(latestHealth?.sleep_seconds ?? null)}
          </CardContent>
        </Card>
      </section>

      {syncError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {syncError}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recovery trend</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <Suspense fallback={<Skeleton className="h-full" />}>
              <Plot
                data={healthData}
                layout={chartLayout}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%', height: '100%' }}
                useResizeHandler
              />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly training</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <Suspense fallback={<Skeleton className="h-full" />}>
              <Plot
                data={weeklyData}
                layout={weeklyLayout}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%', height: '100%' }}
                useResizeHandler
              />
            </Suspense>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activities</CardTitle>
        </CardHeader>
        <CardContent>
          {snapshot.activities.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Activity</th>
                    <th className="pb-3 font-medium">Sport</th>
                    <th className="pb-3 text-right font-medium">Distance</th>
                    <th className="pb-3 text-right font-medium">Load</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.activities.map((activity) => (
                    <tr key={activity.activity_id} className="border-t">
                      <td className="py-3">
                        {new Date(activity.started_at_utc).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        {activity.name ?? activity.activity_id}
                      </td>
                      <td className="py-3">{activity.sport ?? '—'}</td>
                      <td className="py-3 text-right">
                        {activity.distance_m === null
                          ? '—'
                          : `${(activity.distance_m / 1000).toFixed(1)} km`}
                      </td>
                      <td className="py-3 text-right">
                        {displayNumber(activity.training_load)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No canonical activity data is available for this period.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="pb-4 text-xs text-muted-foreground">
        {snapshot.caveats.join(' ')}
      </p>
    </main>
  );
}

export default function Dashboard() {
  return (
    <Page>
      <DashboardContent />
    </Page>
  );
}
