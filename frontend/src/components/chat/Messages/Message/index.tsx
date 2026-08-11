import { cn } from '@/lib/utils';
import { MessageContext } from 'contexts/MessageContext';
import { memo, useContext, useMemo, useRef } from 'react';

import {
  type IAction,
  type IMessageElement,
  type IStep
} from '@chainlit/react-client';

import { useLayoutMaxWidth } from 'hooks/useLayoutMaxWidth';

import { Messages } from '..';
import ThinkingSteps from '../ThinkingSteps';
import { AskActionButtons } from './AskActionButtons';
import { AskFileButton } from './AskFileButton';
import { MessageAvatar } from './Avatar';
import { MessageButtons } from './Buttons';
import { MessageContent } from './Content';
import Step from './Step';
import UserMessage from './UserMessage';

interface Props {
  message: IStep;
  elements: IMessageElement[];
  actions: IAction[];
  indent: number;
  isRunning?: boolean;
  isScorable?: boolean;
  scorableRun?: IStep;
  hideMessageSteps?: boolean;
}

const EMPTY_ELEMENTS: IMessageElement[] = [];

const Message = memo(
  ({
    message,
    elements,
    actions,
    isRunning,
    indent,
    isScorable,
    scorableRun,
    hideMessageSteps = false
  }: Props) => {
    const { allowHtml, cot, latex, renderUserMarkdown, onError } =
      useContext(MessageContext);
    const layoutMaxWidth = useLayoutMaxWidth();
    const contentRef = useRef<HTMLDivElement>(null);
    const isUserMessage = message.type === 'user_message';
    const isStep = !message.type.includes('message');
    // Only keep tool calls if Chain of Thought is tool_call
    const toolCallSkip =
      isStep && cot === 'tool_call' && message.type !== 'tool';

    const hiddenSkip = isStep && cot === 'hidden';

    const skip = toolCallSkip || hiddenSkip;
    const showInputSection = Boolean(message.input && message.showInput);
    const shouldRenderOutput = !showInputSection || Boolean(message.output);
    const traceSteps = message.steps?.filter(
      (step) => !step.type.includes('message')
    );
    const childMessages = message.steps?.filter((step) =>
      step.type.includes('message')
    );

    const userMessageContent = useMemo(
      () => (
        <MessageContent
          elements={EMPTY_ELEMENTS}
          message={message}
          allowHtml={allowHtml}
          latex={latex}
          renderMarkdown={renderUserMarkdown}
        />
      ),
      [message, allowHtml, latex]
    );

    if (skip) {
      if (!message.steps) {
        return null;
      }
      return (
        <Messages
          messages={message.steps}
          elements={elements}
          actions={actions}
          indent={indent}
          isRunning={isRunning}
          scorableRun={scorableRun}
          hideMessageSteps={hideMessageSteps}
        />
      );
    }

    return (
      <>
        <div
          data-step-type={message.type}
          className={cn('step', isStep ? 'py-0.5' : 'py-2')}
        >
          <div
            className="flex flex-col"
            style={{
              maxWidth: indent ? '100%' : layoutMaxWidth
            }}
          >
            <div
              className={cn('flex flex-grow pb-2')}
              id={`step-${message.id}`}
            >
              {/* User message is displayed differently */}
              {isUserMessage ? (
                <div className="flex flex-col flex-grow max-w-full">
                  <UserMessage message={message} elements={elements}>
                    {userMessageContent}
                  </UserMessage>
                </div>
              ) : (
                <div className="ai-message flex gap-4 w-full">
                  {!isStep ? (
                    <MessageAvatar
                      author={message.metadata?.avatarName || message.name}
                      isError={message.isError}
                      iconName={message.metadata?.icon}
                    />
                  ) : null}
                  {/* Display the step and its children */}
                  {isStep ? (
                    <Step step={message} isRunning={isRunning}>
                      {showInputSection ? (
                        <MessageContent
                          elements={elements}
                          message={message}
                          allowHtml={allowHtml}
                          latex={latex}
                          renderMarkdown={true}
                          sections={['input']}
                        />
                      ) : null}
                      {message.steps ? (
                        <Messages
                          messages={message.steps.filter(
                            (s) => !s.type.includes('message')
                          )}
                          elements={elements}
                          actions={actions}
                          indent={indent + 1}
                          isRunning={isRunning}
                          hideMessageSteps={hideMessageSteps}
                        />
                      ) : null}
                      {shouldRenderOutput ? (
                        <MessageContent
                          ref={contentRef}
                          elements={elements}
                          message={message}
                          allowHtml={allowHtml}
                          latex={latex}
                          renderMarkdown={true}
                          sections={showInputSection ? ['output'] : undefined}
                        />
                      ) : null}
                      <MessageButtons
                        message={message}
                        actions={actions}
                        contentRef={contentRef}
                      />
                    </Step>
                  ) : (
                    // Display an assistant message
                    <div className="flex flex-col items-start min-w-[150px] flex-grow gap-2">
                      <MessageContent
                        ref={contentRef}
                        elements={elements}
                        message={message}
                        allowHtml={allowHtml}
                        latex={latex}
                        renderMarkdown={true}
                      />

                      <AskFileButton messageId={message.id} onError={onError} />
                      <AskActionButtons
                        actions={actions}
                        messageId={message.id}
                      />

                      <MessageButtons
                        message={message}
                        actions={actions}
                        run={
                          scorableRun && isScorable ? scorableRun : undefined
                        }
                        contentRef={contentRef}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Make sure the child assistant messages of a step are displayed at the root level. */}
        {message.steps && isStep && !hideMessageSteps ? (
          <Messages
            messages={message.steps.filter((s) => s.type.includes('message'))}
            elements={elements}
            actions={actions}
            indent={0}
            isRunning={isRunning}
            scorableRun={scorableRun}
          />
        ) : null}
        {/* A user message owns its callback run, which decides response/trace order. */}
        {message.steps && isUserMessage ? (
          <Messages
            messages={message.steps}
            elements={elements}
            actions={actions}
            indent={indent}
            isRunning={isRunning}
            scorableRun={scorableRun}
            hideMessageSteps={hideMessageSteps}
          />
        ) : null}
        {/* Older threads attach tool calls directly to the assistant message. */}
        {message.steps && !isStep && !isUserMessage && traceSteps?.length ? (
          <ThinkingSteps count={traceSteps.length}>
            <Messages
              messages={traceSteps}
              elements={elements}
              actions={actions}
              indent={indent}
              isRunning={isRunning}
              scorableRun={scorableRun}
              hideMessageSteps
            />
          </ThinkingSteps>
        ) : null}
        {message.steps && !isStep && !isUserMessage && childMessages?.length ? (
          <Messages
            messages={childMessages}
            elements={elements}
            actions={actions}
            indent={indent}
            isRunning={isRunning}
            scorableRun={scorableRun}
            hideMessageSteps={hideMessageSteps}
          />
        ) : null}
      </>
    );
  }
);

export { Message };
