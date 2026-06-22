import { log, save, state } from '../persistence/store';
import { scanner } from '../scanner/engine';
import type { ExecutionState } from '../types/domain';

const legacyStateMap: Record<string, ExecutionState> = {
  PENDING: 'CREATED',
  VALIDATED: 'CREATED',
  BLOCKED: 'REJECTED',
  EXECUTED: 'PROTECTED',
};

export function recoverPersistedState(): void {
  scanner.enabled = false;
  scanner.running = false;
  scanner.nextScanAt = null;
  const now = Date.now();
  const validSignalIds = new Set(
    state.signals
      .filter((signal) => new Date(signal.expiresAt).getTime() > now)
      .map((signal) => signal.id),
  );
  state.signals = state.signals.filter((signal) => validSignalIds.has(signal.id));

  for (const queue of state.queue) {
    const legacy = legacyStateMap[String(queue.state)];
    if (legacy) queue.state = legacy;
    queue.updatedAt ||= queue.createdAt || new Date().toISOString();
    queue.attempts ||= 0;
    queue.orderLinkId ||= `bbot-${queue.id.replace(/-/g, '').slice(0, 24)}`;
    queue.confirmations ||= {
      orderSubmitted: false,
      fillConfirmed: false,
      positionConfirmed: false,
      stopLossConfirmed: false,
      takeProfitConfirmed: false,
    };
    if (!validSignalIds.has(queue.signalId) && queue.state === 'CREATED') {
      queue.state = 'CANCELLED';
      queue.reason = 'Signal expired before execution';
    }
  }

  for (const execution of state.executions) {
    execution.confirmations ||= {
      orderSubmitted: false,
      fillConfirmed: false,
      positionConfirmed: false,
      stopLossConfirmed: false,
      takeProfitConfirmed: false,
    };
    execution.updatedAt ||= execution.createdAt;
    if (
      ['SUBMITTING', 'SUBMITTED', 'PARTIALLY_FILLED', 'FILLED', 'PROTECTION_PENDING', 'PROTECTED', 'ERROR', 'CLOSING'].includes(
        execution.state,
      ) && !state.trades.some((trade) => trade.executionId === execution.id)
    ) {
      state.symbolBlocks[execution.symbol] =
        state.symbolBlocks[execution.symbol] || 'Persisted execution requires reconciliation';
    }
  }
  for (const trade of state.trades) {
    trade.initialQuantity ||= trade.quantity;
    trade.remainingQuantity ??= trade.quantity;
    trade.targetPolicy ||= 'FULL_CLOSE_TP1';
    trade.tpStatus ||= { tp1: 'PENDING', tp2: 'PENDING', tp3: 'PENDING' };
    trade.stopStatus ||= 'ACTIVE';
    if (trade.mode === 'BYBIT_DEMO' && trade.status !== 'ACTIVE') {
      state.symbolBlocks[trade.symbol] ||= 'Persisted Demo trade requires protection reconciliation';
    }
  }
  save();
  log('RESTART_RECOVERY', 'Persisted trading state loaded; scanner remains OFF', {
    activeSignals: state.signals.length,
    activeTrades: state.trades.length,
    inFlightExecutions: state.executions.filter((row) => !['PROTECTED', 'CLOSED', 'REJECTED', 'CANCELLED'].includes(row.state)).length,
  });
}
