import { useChatInteract } from '@chainlit/react-client';

import Alert from '@/components/Alert';
import { Loader } from '@/components/Loader';
import { Button } from '@/components/ui/button';

import { type GenerationStatus } from '@/types/generation';

interface Props {
  status: GenerationStatus | null;
}

/**
 * Shows the agent's live generation state so the user can tell "still thinking"
 * from "stuck". Rendered by the parent, which owns polling (so it can also
 * recover the thread once a detached turn completes). A stalled run offers a
 * Stop button: the console turns it into a terminal sidecar state even when
 * the process behind the run is gone, which unblocks the chat.
 */
export default function GenerationStatusBanner({ status }: Props) {
  const { stopTask } = useChatInteract();

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
          <span className="flex-1">
            Generation may be stalled (no progress update in a while). Stop, or
            reload the page to recover.
          </span>
          <Button
            id="generation-stalled-stop"
            onClick={stopTask}
            size="sm"
            variant="outline"
            className="h-7 shrink-0"
          >
            Stop
          </Button>
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
