import { atom } from 'recoil';

import type { GenerationStatus } from '@/types/generation';

/**
 * Live agent-turn state polled from the generation-status endpoint.
 * Written by `useGenerationStatusPoll` (single poller in MessagesContainer),
 * read by the banner and the composer submit button so Send flips to Stop
 * while a detached turn is still thinking — socket `task_start/task_end`
 * alone can't cover turns that outlive their websocket handler.
 */
export const generationStatusState = atom<GenerationStatus | null>({
  key: 'GenerationStatus',
  default: null
});
