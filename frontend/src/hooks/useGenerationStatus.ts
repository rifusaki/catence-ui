import { useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';

import { useChatMessages } from '@chainlit/react-client';

import { generationStatusState } from '@/state/generation';

import type { GenerationStatus } from '@/types/generation';

const apiOrigin = (
  import.meta.env.VITE_CATENCE_API_ORIGIN || window.location.origin
).replace(/\/$/, '');

async function fetchGenerationStatus(
  threadId: string
): Promise<GenerationStatus | null> {
  const candidates = [
    `${apiOrigin}/api/v1/threads/${encodeURIComponent(threadId)}/generation`,
    `http://127.0.0.1:8787/api/v1/threads/${encodeURIComponent(threadId)}/generation`,
    `http://localhost:8787/api/v1/threads/${encodeURIComponent(threadId)}/generation`
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      // The console serves the SPA HTML for unknown API routes.
      if (
        text.trim().startsWith('<!doctype') ||
        text.trim().startsWith('<html')
      )
        continue;
      const data = JSON.parse(text) as GenerationStatus;
      return data;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Single poller — mount once (MessagesContainer). Polls on mount/thread
 * change so a refresh mid-generation immediately discovers the active run
 * without waiting for the next user action.
 */
export function useGenerationStatusPoll() {
  const { threadId } = useChatMessages();
  const [, setStatus] = useRecoilState(generationStatusState);

  useEffect(() => {
    if (!threadId) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const data = await fetchGenerationStatus(threadId);
      if (!cancelled) setStatus(data);
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [threadId, setStatus]);

  return useRecoilValue(generationStatusState);
}

/** Read-only access for components that must not start their own poller. */
export function useGenerationStatus() {
  return useRecoilValue(generationStatusState);
}
