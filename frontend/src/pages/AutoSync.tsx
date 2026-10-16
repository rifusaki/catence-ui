import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

import {
  type AutoSyncSchedule,
  formatScheduleTimestamp,
  intervalBudgetHint,
  loadAutoSyncSchedule,
  updateAutoSyncSchedule
} from './autoSyncApi';

const apiOrigin = (
  import.meta.env.VITE_CATENCE_API_ORIGIN || window.location.origin
).replace(/\/$/, '');

type AthleteRoster = {
  defaultAthleteId: string;
  athletes: Array<{ id: string; label: string }>;
};

/**
 * Admin tab for automatic syncing: per athlete, an on/off switch and an
 * interval picker (15m through 24h) mirrored from the CLI's auto-sync
 * commands (Console proxies the calls and checks the admin role).
 */
export function AutoSyncContent() {
  const [roster, setRoster] = useState<AthleteRoster | null>(null);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<AutoSyncSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`${apiOrigin}/api/v1/athletes`, {
          signal: controller.signal
        });
        if (!response.ok) return;
        const nextRoster = (await response.json()) as AthleteRoster;
        setRoster(nextRoster);
        setAthleteId((current) => current ?? nextRoster.defaultAthleteId);
      } catch {
        // Roster is best-effort; the schedule card shows the degraded state.
      }
    })();
    return () => controller.abort();
  }, []);

  const load = useCallback(async (id: string) => {
    const outcome = await loadAutoSyncSchedule(apiOrigin, id);
    if (outcome.ok) {
      setSchedule(outcome.data);
      setError(null);
      return;
    }
    setSchedule(null);
    setError(outcome.failure.message);
  }, []);

  useEffect(() => {
    if (athleteId) void load(athleteId);
  }, [athleteId, load]);

  const apply = async (update: {
    enabled?: boolean;
    intervalMinutes?: number;
  }) => {
    if (!athleteId || !schedule) return;
    setBusy(true);
    setError(null);
    const outcome = await updateAutoSyncSchedule(apiOrigin, {
      athleteId,
      ...update
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.failure.message);
      return;
    }
    setSchedule(outcome.data);
  };

  const budgetHint = schedule
    ? intervalBudgetHint(schedule.intervalMinutes)
    : null;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-6">
      <div>
        <h2 className="text-lg font-semibold">Auto-sync</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Catence syncs automatically while the server runs — no manual
          triggers, no host cron. Pick a cadence per athlete; it applies from
          the next due moment, and a sync already in progress is never
          duplicated.
        </p>
      </div>

      {roster && athleteId ? (
        <label className="flex w-fit items-center gap-2 text-sm">
          Athlete
          <select
            className="rounded-md border bg-background px-2 py-1 text-foreground"
            value={athleteId}
            onChange={(event) => setAthleteId(event.target.value)}
          >
            {roster.athletes.map((athlete) => (
              <option key={athlete.id} value={athlete.id}>
                {athlete.label}
              </option>
            ))}
          </select>
        </label>
      ) : !roster ? (
        <Skeleton className="h-8 w-48" />
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!schedule ? (
        roster && athleteId ? (
          <Skeleton className="h-24 w-full" />
        ) : null
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Schedule</CardTitle>
            <Badge
              variant={schedule.enabled ? 'default' : 'secondary'}
              className={
                schedule.enabled
                  ? 'bg-emerald-600 hover:bg-emerald-600'
                  : undefined
              }
            >
              {schedule.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-3">
              <Switch
                aria-label="Toggle automatic syncing"
                checked={schedule.enabled}
                disabled={busy}
                onCheckedChange={(checked) => void apply({ enabled: checked })}
              />
              <span className="text-sm text-muted-foreground">
                {schedule.enabled
                  ? 'Syncing automatically'
                  : 'Manual sync only'}
              </span>
            </div>

            <label className="flex w-fit items-center gap-2 text-sm">
              Interval
              <select
                className="rounded-md border bg-background px-2 py-1 text-foreground"
                value={schedule.intervalMinutes}
                disabled={busy}
                onChange={(event) =>
                  void apply({ intervalMinutes: Number(event.target.value) })
                }
              >
                {schedule.intervalOptions.map((option) => (
                  <option key={option.minutes} value={option.minutes}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-1 text-xs text-muted-foreground">
              <span>
                Last auto-sync:{' '}
                {formatScheduleTimestamp(schedule.lastTriggeredAt)}
              </span>
              <span>
                Next run:{' '}
                {schedule.enabled
                  ? formatScheduleTimestamp(schedule.nextRunAt)
                  : 'Paused'}
              </span>
            </div>

            {budgetHint ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {budgetHint}
              </p>
            ) : null}

            <p className="text-xs text-muted-foreground">
              The same schedule is available in the CLI:{' '}
              <code className="font-mono text-xs">
                catence-data auto-sync enable --interval 2h
              </code>
              . Changing the interval takes effect on the next scheduled run.
            </p>

            {schedule.lastLogFile ? (
              <p className="break-all font-mono text-xs text-muted-foreground">
                Last run log: {schedule.lastLogFile}
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AutoSyncContent;
