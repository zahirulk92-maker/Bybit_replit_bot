import { incrementExecutionTelemetry, save, state } from '../persistence/store';
import type { ExecutionRecord, ExecutionState, QueueItem } from '../types/domain';

const allowed: Record<ExecutionState, ExecutionState[]> = {
  CREATED: ['SUBMITTING', 'REJECTED', 'CANCELLED', 'ERROR'],
  SUBMITTING: ['SUBMITTED', 'PARTIALLY_FILLED', 'FILLED', 'REJECTED', 'CANCELLED', 'ERROR'],
  SUBMITTED: ['PARTIALLY_FILLED', 'FILLED', 'REJECTED', 'CANCELLED', 'ERROR'],
  PARTIALLY_FILLED: ['PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'ERROR'],
  FILLED: ['PROTECTION_PENDING', 'ERROR'],
  PROTECTION_PENDING: ['PROTECTED', 'ERROR'],
  PROTECTED: ['CLOSING', 'ERROR'],
  REJECTED: [],
  CANCELLED: [],
  ERROR: ['SUBMITTING', 'SUBMITTED', 'PARTIALLY_FILLED', 'FILLED', 'PROTECTION_PENDING', 'PROTECTED', 'CLOSING', 'CANCELLED'],
  CLOSING: ['CLOSED', 'ERROR'],
  CLOSED: [],
};

export function canTransition(from: ExecutionState, to: ExecutionState): boolean {
  return from === to || allowed[from].includes(to);
}

function recordTransition(to: ExecutionState): void {
  if (to === 'SUBMITTING') incrementExecutionTelemetry('submitting');
  if (to === 'SUBMITTED') incrementExecutionTelemetry('submitted');
  if (to === 'PARTIALLY_FILLED') incrementExecutionTelemetry('partialFills');
  if (to === 'PROTECTED') incrementExecutionTelemetry('protectedTrades');
}

export function transitionQueue(
  queue: QueueItem,
  to: ExecutionState,
  reason?: string,
  persist = true,
): QueueItem {
  if (!canTransition(queue.state, to)) {
    throw new Error(`Invalid execution transition ${queue.state} -> ${to}`);
  }
  const changed = queue.state !== to;
  queue.state = to;
  queue.updatedAt = new Date().toISOString();
  queue.reason = reason;
  if (changed) recordTransition(to);
  if (persist) save();
  return queue;
}

export function transitionExecution(
  execution: ExecutionRecord,
  queue: QueueItem,
  to: ExecutionState,
  reason?: string,
): void {
  if (!canTransition(execution.state, to)) {
    throw new Error(`Invalid persisted execution transition ${execution.state} -> ${to}`);
  }
  const changed = execution.state !== to;
  execution.state = to;
  execution.updatedAt = new Date().toISOString();
  execution.lastError = reason;
  transitionQueue(queue, to, reason, false);
  if (changed && queue.state === to) {
    // transitionQueue records the telemetry once for the shared state transition.
  }
  save();
}

export function findExecutionByQueue(queueId: string): ExecutionRecord | undefined {
  return state.executions.find((execution) => execution.queueId === queueId);
}

export function terminalState(stateValue: ExecutionState): boolean {
  return ['CLOSED', 'REJECTED', 'CANCELLED'].includes(stateValue);
}
