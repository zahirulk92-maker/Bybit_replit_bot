import { env, validateMode } from '../config/env';
import { createDemoClient } from '../execution/bybitDemo';
import { reconcilePaperTickers } from '../execution/paper';
import { reconcileDemo } from '../execution/reconciliation';
import { tickers } from '../market/bybitPublic';
import { log, safeErrorMessage } from '../persistence/store';
import { withRetry } from './retry';

interface WorkerTelemetry {
  running: boolean;
  cycles: number;
  failures: number;
  consecutiveFailures: number;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
}

function telemetry(): WorkerTelemetry {
  return {
    running: false,
    cycles: 0,
    failures: 0,
    consecutiveFailures: 0,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastError: null,
  };
}

const workerState = {
  started: false,
  stopping: false,
  demo: telemetry(),
  paper: telemetry(),
};

let reconciliationTimer: NodeJS.Timeout | undefined;
let lifecycleTimer: NodeJS.Timeout | undefined;
let demoPromise: Promise<void> | null = null;
let paperPromise: Promise<void> | null = null;

async function guardedCycle(
  name: 'demo' | 'paper',
  operation: () => Promise<void>,
): Promise<void> {
  const status = workerState[name];
  if (status.running || workerState.stopping) return;
  status.running = true;
  status.lastStartedAt = new Date().toISOString();
  try {
    await withRetry(() => operation(), {
      attempts: env.workerRetryAttempts,
      baseDelayMs: env.workerBackoffBaseMs,
      maxDelayMs: env.workerBackoffMaxMs,
      retryable: () => true,
      onRetry: (error, attempt, delayMs) => {
        log('WORKER_RETRY', `${name} worker cycle will retry`, {
          worker: name,
          attempt,
          delayMs,
          error: safeErrorMessage(error),
        }, 'WARNING');
      },
    });
    status.cycles += 1;
    status.consecutiveFailures = 0;
    status.lastError = null;
  } catch (error) {
    status.failures += 1;
    status.consecutiveFailures += 1;
    status.lastError = safeErrorMessage(error);
    log('WORKER_CYCLE_ERROR', `${name} worker cycle failed without terminating the process`, {
      worker: name,
      error: status.lastError,
    }, 'ERROR');
  } finally {
    status.running = false;
    status.lastCompletedAt = new Date().toISOString();
  }
}

export async function runDemoReconciliationCycle(): Promise<void> {
  if (demoPromise) return demoPromise;
  demoPromise = guardedCycle('demo', async () => {
    await reconcileDemo(createDemoClient());
  }).finally(() => {
    demoPromise = null;
  });
  return demoPromise;
}

export async function runPaperLifecycleCycle(): Promise<void> {
  if (paperPromise) return paperPromise;
  paperPromise = guardedCycle('paper', async () => {
    reconcilePaperTickers(await tickers());
  }).finally(() => {
    paperPromise = null;
  });
  return paperPromise;
}

export function runtimeWorkerStatus(): typeof workerState {
  return workerState;
}

export function startRuntimeWorkers(): void {
  if (workerState.started) return;
  workerState.started = true;
  workerState.stopping = false;
  const validation = validateMode();
  if (!validation.valid) {
    log('EXECUTION_MODE_INVALID', validation.reason || 'Execution mode invalid', undefined, 'ERROR');
    return;
  }
  if (env.mode === 'BYBIT_DEMO') {
    void runDemoReconciliationCycle();
    reconciliationTimer = setInterval(() => void runDemoReconciliationCycle(), env.reconciliationIntervalMs);
    reconciliationTimer.unref();
  }
  if (env.mode === 'LOCAL_PAPER') {
    void runPaperLifecycleCycle();
    lifecycleTimer = setInterval(() => void runPaperLifecycleCycle(), env.lifecycleIntervalMs);
    lifecycleTimer.unref();
  }
}

export async function stopRuntimeWorkers(): Promise<void> {
  workerState.stopping = true;
  if (reconciliationTimer) clearInterval(reconciliationTimer);
  if (lifecycleTimer) clearInterval(lifecycleTimer);
  reconciliationTimer = undefined;
  lifecycleTimer = undefined;
  const active = [demoPromise, paperPromise].filter((row): row is Promise<void> => Boolean(row));
  if (active.length) {
    await Promise.race([
      Promise.allSettled(active),
      new Promise<void>((resolve) => setTimeout(resolve, env.workerShutdownGraceMs)),
    ]);
  }
  workerState.started = false;
  workerState.stopping = false;
}

export function resetWorkerStateForTests(): void {
  workerState.started = false;
  workerState.stopping = false;
  Object.assign(workerState.demo, telemetry());
  Object.assign(workerState.paper, telemetry());
  if (reconciliationTimer) clearInterval(reconciliationTimer);
  if (lifecycleTimer) clearInterval(lifecycleTimer);
  reconciliationTimer = undefined;
  lifecycleTimer = undefined;
  demoPromise = null;
  paperPromise = null;
}
