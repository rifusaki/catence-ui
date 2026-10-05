import {
  useChatData,
  useChatInteract,
  useChatMessages
} from '@chainlit/react-client';

import { Send } from '@/components/icons/Send';
import { Stop } from '@/components/icons/Stop';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Translator } from 'components/i18n';

import {
  isGenerationActive,
  useGenerationStatus
} from '@/hooks/useGenerationStatus';

interface SubmitButtonProps {
  disabled?: boolean;
  onSubmit: () => void;
}

export default function SubmitButton({
  disabled,
  onSubmit
}: SubmitButtonProps) {
  const { loading } = useChatData();
  const { firstInteraction } = useChatMessages();
  const { stopTask } = useChatInteract();
  const genStatus = useGenerationStatus();
  // Socket task events fire task_end as soon as the detached turn is accepted,
  // so `loading` alone never covers generation. The sidecar-backed generation
  // status does — including across a page refresh. Stale statuses mean the run
  // is dead, so the Send button comes back and the chat is usable again.
  const isGenerating = isGenerationActive(genStatus);

  return (
    <TooltipProvider>
      {isGenerating || (loading && firstInteraction) ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              id="stop-button"
              onClick={stopTask}
              size="icon"
              className="rounded-full h-8 w-8"
            >
              <Stop className="!size-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              <Translator path="chat.input.actions.stop" />
            </p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              id="chat-submit"
              disabled={disabled}
              onClick={onSubmit}
              size="icon"
              className="rounded-full h-8 w-8"
            >
              <Send className="!size-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              <Translator path="chat.input.actions.send" />
            </p>
          </TooltipContent>
        </Tooltip>
      )}
    </TooltipProvider>
  );
}
