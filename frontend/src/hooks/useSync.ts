import { useCallback, useEffect, useRef, useState } from 'react';

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

/**
 * Detached sync trigger with live progress. The runtime spawns its own
 * `catence-data sync` child, so leaving this page (or the browser) never
 * interrupts a running backfill. Shared between Dashboard (read-only) and
 * Status (interactive).
 */
export function useSync(athleteId: string | null) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const startingRef = useRef(false);

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
    if (!athleteId) return;
    // Poll fast while a run is active; keep a slow idle poll so a sync
    // started elsewhere (another tab, the runtime CLI, an MCP tool) still
    // flips this page into "Syncing…" without user interaction.
    const timer = setInterval(
      () => {
        void (async () => {
          try {
            const response = await fetch(
              `${apiOrigin}/api/v1/sync/status?athleteId=${encodeURIComponent(athleteId)}`
            );
            if (response.ok) setStatus((await response.json()) as SyncStatus);
          } catch {
            // Transient errors are not fatal; the next tick retries.
          }
        })();
      },
      running ? 3_000 : 10_000
    );
    return () => clearInterval(timer);
  }, [athleteId, status?.progress.running.length]);

  const start = useCallback(async () => {
    if (startingRef.current || !athleteId) return;
    startingRef.current = true;
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
      // Discovery runs before the sync child spawns and never blocks it; its
      // failure is only reported as a warning on the accepted response.
      if (result?.warning) setSyncError(String(result.warning));
      // The polling effects above pick the run up within seconds.
    } catch (caught) {
      setSyncError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [athleteId]);

  return { status, starting, syncError, start };
}

export type { SyncStatus, SyncRun };
export function displayTimestamp(value: string | null): string {
  if (!value) return 'never';
  const parsed = new Date(
    value.endsWith('Z') || value.includes('+') ? value : `${value}Z`
  );
  return Number.isNaN(parsed.getTime()) ? 'never' : parsed.toLocaleString();
}
