import Alert from '@/components/Alert';

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
