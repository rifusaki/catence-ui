export interface GenerationStatus {
  threadId: string;
  stage?: string;
  running: boolean;
  stale: boolean;
  heartbeatAt?: string;
  startedAt?: string;
  updatedAt?: string;
  toolCallCount: number;
  lastTool?: string | null;
}
