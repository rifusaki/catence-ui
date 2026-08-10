import React from 'react';

import { useChatInteract } from '@chainlit/react-client';

import { Translator } from '@/components/i18n';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

import { EditSquare } from '../icons/EditSquare';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  navigate?: (to: string) => void;
  onNewChat?: () => void;
}

const NewChatButton = ({ navigate, onNewChat, ...buttonProps }: Props) => {
  const { clear } = useChatInteract();

  const startNewChat = () => {
    if (onNewChat) {
      onNewChat();
    } else {
      clear();
      navigate?.('/');
    }
  };

  return (
    <div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              id="new-chat-button"
              className="text-muted-foreground hover:text-muted-foreground"
              onClick={startNewChat}
              {...buttonProps}
            >
              <EditSquare className="!size-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <Translator path="navigation.newChat.button" />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default NewChatButton;
