import { MessageContext } from '@/contexts/MessageContext';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { toast } from 'sonner';

import {
  ChainlitContext,
  IFeedback,
  IMessageElement,
  IStep,
  messagesState,
  nestMessages,
  sessionIdState,
  sideViewState,
  updateMessageById,
  useChatData,
  useChatInteract,
  useChatMessages,
  useConfig
} from '@chainlit/react-client';

import GenerationStatusBanner from '@/components/chat/GenerationStatusBanner';
import { Messages } from '@/components/chat/Messages';
import { useTranslation } from 'components/i18n/Translator';

import { cotOverrideState } from '@/state/cot';

import { type GenerationStatus } from '@/types/generation';

interface Props {
  navigate?: (to: string) => void;
}

const MessagesContainer = ({ navigate }: Props) => {
  const apiClient = useContext(ChainlitContext);
  const { config } = useConfig();
  const { elements, askUser, loading, actions } = useChatData();
  const { messages, threadId } = useChatMessages();
  const { uploadFile: _uploadFile } = useChatInteract();
  const setMessages = useSetRecoilState(messagesState);
  const setSideView = useSetRecoilState(sideViewState);
  const sessionId = useRecoilValue(sessionIdState);
  const cotOverride = useRecoilValue(cotOverrideState);

  const apiOrigin = (
    import.meta.env.VITE_CATENCE_API_ORIGIN || window.location.origin
  ).replace(/\/$/, '');

  // Poll the generation-status endpoint while a turn is active (including a turn
  // that was detached from the socket), and reload the thread once it finishes
  // so a refresh mid-generation still recovers the answer.
  const [genStatus, setGenStatus] = useState<GenerationStatus | null>(null);
  const wasRunningRef = useRef(false);

  const recoverThread = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(
          `${apiOrigin}/project/thread/${encodeURIComponent(id)}`
        );
        if (!res.ok) return;
        const thread = (await res.json()) as { steps?: IStep[] };
        if (thread?.steps?.length) {
          setMessages(nestMessages(thread.steps));
        }
      } catch {
        // Recovery is best-effort; the next render or reload will catch up.
      }
    },
    [apiOrigin, setMessages]
  );

  useEffect(() => {
    if (!threadId) {
      setGenStatus(null);
      wasRunningRef.current = false;
      return;
    }
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    const poll = async () => {
      try {
        const res = await fetch(
          `${apiOrigin}/api/v1/threads/${encodeURIComponent(threadId)}/generation`
        );
        if (!res.ok) {
          if (!cancelled) setGenStatus(null);
          return;
        }
        const data = (await res.json()) as GenerationStatus;
        if (cancelled) return;
        if (wasRunningRef.current && data.running === false) {
          recoverThread(threadId);
        }
        wasRunningRef.current = data.running;
        if (!cancelled) setGenStatus(data);
      } catch {
        if (!cancelled) setGenStatus(null);
      }
    };
    if (loading || genStatus?.running) {
      poll();
      interval = setInterval(poll, 3000);
    }
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [loading, threadId, genStatus?.running, apiOrigin, recoverThread]);

  const { t } = useTranslation();

  const uploadFile = useCallback(
    (file: File, onProgress: (progress: number) => void, parentId?: string) => {
      return _uploadFile(file, onProgress, parentId);
    },
    [_uploadFile]
  );

  const onFeedbackUpdated = useCallback(
    async (message: IStep, onSuccess: () => void, feedback: IFeedback) => {
      toast.promise(apiClient.setFeedback(feedback, sessionId), {
        loading: t('chat.messages.feedback.status.updating'),
        success: (res) => {
          setMessages((prev) =>
            updateMessageById(prev, message.id, {
              ...message,
              feedback: {
                ...feedback,
                id: res.feedbackId
              }
            })
          );
          onSuccess();
          return t('chat.messages.feedback.status.updated');
        },
        error: (err) => {
          return <span>{err.message}</span>;
        }
      });
    },
    []
  );

  const onFeedbackDeleted = useCallback(
    async (message: IStep, onSuccess: () => void, feedbackId: string) => {
      toast.promise(apiClient.deleteFeedback(feedbackId), {
        loading: t('chat.messages.feedback.status.updating'),
        success: () => {
          setMessages((prev) =>
            updateMessageById(prev, message.id, {
              ...message,
              feedback: undefined
            })
          );
          onSuccess();
          return t('chat.messages.feedback.status.updated');
        },
        error: (err) => {
          return <span>{err.message}</span>;
        }
      });
    },
    []
  );

  const knownSideElementsRef = useRef<Map<string, IMessageElement>>(new Map());
  const knownSideOrderRef = useRef<string[]>([]);

  useEffect(() => {
    const sideElements = elements.filter((e) => e.display === 'side');

    if (sideElements.length === 0) {
      knownSideElementsRef.current = new Map();
      knownSideOrderRef.current = [];
      setSideView(undefined);
      return;
    }

    const prevMap = knownSideElementsRef.current;
    const prevOrder = knownSideOrderRef.current;
    const currentIds = sideElements.map((e) => e.id);

    const hasChanged =
      currentIds.length !== prevOrder.length ||
      currentIds.some((id, i) => prevOrder[i] !== id) ||
      sideElements.some((e) => prevMap.get(e.id) !== e);

    if (hasChanged) {
      const newMap = new Map<string, IMessageElement>();
      sideElements.forEach((e) => newMap.set(e.id, e));
      knownSideElementsRef.current = newMap;
      knownSideOrderRef.current = currentIds;
      setSideView({
        title: sideElements[sideElements.length - 1].name,
        elements: sideElements
      });
    }
  }, [elements]);

  const onElementRefClick = useCallback(
    (element: IMessageElement) => {
      if (
        element.display === 'side' ||
        (element.display === 'page' && !navigate)
      ) {
        setSideView({ title: element.name, elements: [element] });
        return;
      }

      let path = `/element/${element.id}`;

      if (element.threadId) {
        path += `?thread=${element.threadId}`;
      }

      return navigate?.(element.display === 'page' ? path : '#');
    },
    [setSideView, navigate]
  );

  const onError = useCallback((error: string) => toast.error(error), [toast]);

  const enableFeedback = !!config?.dataPersistence;

  // Memoize the context object since it's created on each render.
  // This prevents unnecessary re-renders of children components when no props have changed.
  const memoizedContext = useMemo(() => {
    return {
      uploadFile,
      askUser,
      allowHtml: config?.features?.unsafe_allow_html,
      latex: config?.features?.latex,
      renderUserMarkdown: config?.features?.user_message_markdown,
      editable: !!config?.features.edit_message,
      loading,
      showFeedbackButtons: enableFeedback,
      uiName: config?.ui?.name || '',
      cot: cotOverride ?? config?.ui?.cot ?? 'hidden',
      onElementRefClick,
      onError,
      onFeedbackUpdated,
      onFeedbackDeleted
    };
  }, [
    askUser,
    enableFeedback,
    loading,
    config?.ui?.name,
    config?.ui?.cot,
    cotOverride,
    config?.features?.unsafe_allow_html,
    config?.features?.user_message_markdown,
    onElementRefClick,
    onError,
    onFeedbackUpdated
  ]);

  return (
    <MessageContext.Provider value={memoizedContext}>
      <GenerationStatusBanner status={genStatus} />
      <Messages
        indent={0}
        isRunning={loading}
        messages={messages}
        elements={elements}
        actions={actions}
      />
    </MessageContext.Provider>
  );
};

export default MessagesContainer;
