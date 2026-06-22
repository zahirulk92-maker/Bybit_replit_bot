import { env, validateDemoAcceptance } from '../config/env';
import { getInstrumentMetadata } from '../market/bybitPublic';
import { log, save, state } from '../persistence/store';
import { minimumAcceptanceValidation } from '../risk/engine';
import type { DemoExchangeAdapter, Trade } from '../types/domain';
import { createDemoClient } from './bybitDemo';
import { executeDemoQueue } from './demoExecution';
import { revalidateSignalMarket } from './validation';

export const DEMO_ACCEPTANCE_CONFIRMATION = 'RUN_DEMO_ACCEPTANCE';

export function demoAcceptanceReadiness(): {
  enabled: boolean;
  approvedSymbol: string | null;
  autoStart: false;
  valid: boolean;
  reason?: string;
} {
  const validation = validateDemoAcceptance();
  return {
    enabled: env.demoAcceptanceEnabled,
    approvedSymbol: env.demoAcceptanceSymbol || null,
    autoStart: false,
    valid: validation.valid,
    reason: validation.reason,
  };
}

export interface DemoAcceptanceDependencies {
  revalidate: typeof revalidateSignalMarket;
  getMetadata: typeof getInstrumentMetadata;
}

const productionDependencies: DemoAcceptanceDependencies = {
  revalidate: revalidateSignalMarket,
  getMetadata: getInstrumentMetadata,
};

export async function runDemoAcceptance(
  queueId: string,
  confirmation: string | undefined,
  adapter: DemoExchangeAdapter = createDemoClient(),
  dependencies: DemoAcceptanceDependencies = productionDependencies,
): Promise<Trade> {
  const readiness = validateDemoAcceptance();
  if (!readiness.valid) throw new Error(readiness.reason);
  if (confirmation !== DEMO_ACCEPTANCE_CONFIRMATION) {
    throw new Error('Explicit backend Demo acceptance confirmation is required');
  }
  const queue = state.queue.find((row) => row.id === queueId);
  const signal = queue && state.signals.find((row) => row.id === queue.signalId);
  if (!queue || !signal) throw new Error('Queue item or signal not found');
  if (signal.symbol !== env.demoAcceptanceSymbol) {
    throw new Error(`Demo acceptance is restricted to ${env.demoAcceptanceSymbol}`);
  }
  if (!['CREATED', 'ERROR'].includes(queue.state)) {
    const existing = state.trades.find((trade) => trade.queueId === queue.id);
    if (existing) return existing;
    throw new Error(`Queue state ${queue.state} is not eligible for a new acceptance run`);
  }
  if (
    state.trades.some((trade) => trade.symbol === signal.symbol) ||
    state.executions.some(
      (execution) =>
        execution.symbol === signal.symbol &&
        execution.queueId !== queue.id &&
        !['REJECTED', 'CANCELLED', 'CLOSED'].includes(execution.state),
    )
  ) {
    throw new Error('Duplicate symbol/order protection blocked Demo acceptance');
  }

  const market = await dependencies.revalidate(signal);
  if (!market.ok) throw new Error(market.reason);
  const metadata = await dependencies.getMetadata(signal.symbol, true);
  signal.instrument = metadata;
  const balance = await adapter.getAvailableBalance();
  const validation = minimumAcceptanceValidation(signal, balance, metadata);
  if (!validation.ok) throw new Error(validation.reason || 'Demo acceptance validation failed');
  queue.validation = validation;
  queue.validatedAt = new Date().toISOString();
  queue.reason = undefined;
  queue.updatedAt = new Date().toISOString();
  save();
  log('DEMO_ACCEPTANCE_START', 'Explicit Bybit Demo acceptance run started', {
    queueId: queue.id,
    symbol: signal.symbol,
    quantity: validation.quantity,
    notional: validation.notional,
  });
  return executeDemoQueue(queue, signal, validation, adapter);
}
