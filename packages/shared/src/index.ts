export type ExecutionStatus = 'running' | 'completed' | 'failed';
export type EventType = 'execution.started' | 'llm.started' | 'llm.completed' | 'tool.started' | 'tool.completed' | 'error' | 'execution.completed';
export interface TelemetryEvent {
  id: string;
  executionId: string;
  agentId: string;
  type: EventType;
  timestamp: string;
  sequence: number;
  name: string;
  status?: string;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  tokensInput?: number;
  tokensOutput?: number;
  estimatedCostUsd?: number;
  error?: string;
}
export interface ExecutionSummary {
  id: string;
  agentId: string;
  agentName: string;
  prompt: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  error?: string;
}
