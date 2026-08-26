import Alert from '@/components/Alert';
import { Loader } from '@/components/Loader';

import { type GenerationStatus } from '@/types/generation';

interface Props {
  status: GenerationStatus | null;
}

/**
 * Shows the agent's live generation state so the user can tell "still thinking"
 * from "stuck". Rendered by the parent, which owns polling (so it can also
 * recover the thread once a detached turn completes).
 */
export default function GenerationStatusBanner({ status }: Props) {
  if (!status || !status.running) return null;

  if (status.stale) {
    return (
      <Alert
        className="mx-2 sticky top-2 z-10 shadow-sm"
        id="generation-stalled"
        variant="error"
      >
        <div className="flex items-center gap-2">
          <Loader className="h-4 w-4 shrink-0 text-destructive" />
          <span>
            Generation may be stalled (no progress update in a while). You can
            Stop or reload the page.
          </span>
        </div>
      </Alert>
    );
  }

  return (
    <Alert
      className="mx-2 sticky top-2 z-10 shadow-sm"
      id="generation-thinking"
      variant="info"
    >
      <div className="flex items-center gap-2">
        <Loader className="h-4 w-4 shrink-0" />
        <span>
          Thinking… {status.toolCallCount} tool call
          {status.toolCallCount === 1 ? '' : 's'}
          {status.lastTool ? ` — last: ${status.lastTool}` : ''}
        </span>
      </div>
    </Alert>
  );
}
