import { useEffect, useState } from 'react';

import Alert from '@/components/Alert';

import { type GenerationStatus } from '@/types/generation';

const apiOrigin = (
  import.meta.env.VITE_CATENCE_API_ORIGIN || window.location.origin
).replace(/\/$/, '');

interface Props {
  threadId?: string;
  /** Whether a generation turn is currently in progress. */
  active: boolean;
}

/**
 * Surfaces the agent's live generation state so the user can tell "still
 * thinking" from "stuck". Polls the backend generation-status endpoint while a
 * turn is active; a fresh heartbeat shows progress, a stale one (or a missing
 * endpoint) is treated as not-running so it never blocks the UI.
 */
export default function GenerationStatusBanner({ threadId, active }: Props) {
  const [status, setStatus] = useState<GenerationStatus | null>(null);

  useEffect(() => {
    if (!active || !threadId) {
      setStatus(null);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `${apiOrigin}/api/v1/threads/${encodeURIComponent(threadId)}/generation`
        );
        if (!res.ok) {
          if (!cancelled) setStatus(null);
          return;
        }
        const data = (await res.json()) as GenerationStatus;
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setStatus(null);
      }
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active, threadId]);

  if (!status || !status.running) return null;

  if (status.stale) {
    return (
      <Alert className="mx-2" id="generation-stalled" variant="error">
        Generation may be stalled (no progress update in a while). You can Stop
        or reload the page.
      </Alert>
    );
  }

  return (
    <Alert className="mx-2" id="generation-thinking" variant="info">
      Thinking… {status.toolCallCount} tool call
      {status.toolCallCount === 1 ? '' : 's'}
      {status.lastTool ? ` — last: ${status.lastTool}` : ''}
    </Alert>
  );
}
