import crypto from 'node:crypto';
import { env } from '../config/env';
import { incrementExecutionTelemetry, save, state } from '../persistence/store';
import type {
  ExecutionRecord,
  JournalRecord,
  QueueItem,
  RiskValidation,
  Signal,
  Trade,
} from '../types/domain';

export function getOrCreateExecution(
  queue: QueueItem,
  signal: Signal,
  mode: 'LOCAL_PAPER' | 'BYBIT_DEMO',
  validation: RiskValidation,
): ExecutionRecord {
  const existing = state.executions.find(
    (execution) =>
      execution.queueId === queue.id || execution.idempotencyKey === queue.idempotencyKey,
  );
  if (existing) return existing;
  const now = new Date().toISOString();
  const execution: ExecutionRecord = {
    id: crypto.randomUUID(),
    queueId: queue.id,
    signalId: signal.id,
    symbol: signal.symbol,
    mode,
    state: queue.state,
    idempotencyKey: queue.idempotencyKey,
    orderLinkId: queue.orderLinkId,
    requestedQuantity: validation.quantity ?? 0,
    filledQuantity: 0,
    confirmations: { ...queue.confirmations },
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  state.executions.push(execution);
  incrementExecutionTelemetry('queuedExecutions');
  save();
  return execution;
}

export function activateTrade(input: {
  queue: QueueItem;
  signal: Signal;
  execution: ExecutionRecord;
  validation: RiskValidation;
  mode: 'LOCAL_PAPER' | 'BYBIT_DEMO';
  fillPrice: number;
  quantity: number;
  protectionSource: 'LOCAL_ENGINE' | 'BYBIT_EXCHANGE';
  exchangeOrderId?: string;
}): Trade {
  const {
    queue,
    signal,
    execution,
    validation,
    mode,
    fillPrice,
    quantity,
    protectionSource,
    exchangeOrderId,
  } = input;
  const confirmations = execution.confirmations;
  if (
    !confirmations.orderSubmitted ||
    !confirmations.fillConfirmed ||
    !confirmations.positionConfirmed ||
    !confirmations.stopLossConfirmed ||
    !confirmations.takeProfitConfirmed
  ) {
    throw new Error('Trade cannot become active before order, fill, position, SL and TP confirmation');
  }
  const existing = state.trades.find(
    (trade) => trade.queueId === queue.id || trade.orderLinkId === queue.orderLinkId,
  );
  if (existing) return existing;
  const now = new Date().toISOString();
  const trade: Trade = {
    id: crypto.randomUUID(),
    mode,
    symbol: signal.symbol,
    side: signal.side,
    strategy: signal.strategy,
    grade: signal.grade,
    score: signal.score,
    entry: fillPrice,
    currentPrice: fillPrice,
    stopLoss: validation.roundedStopLoss ?? signal.stopLoss,
    tp1: validation.roundedTp1 ?? signal.tp1,
    tp2: validation.roundedTp2 ?? signal.tp2,
    tp3: validation.roundedTp3 ?? signal.tp3,
    takeProfit: validation.roundedTp1 ?? signal.tp1,
    quantity,
    initialQuantity: quantity,
    remainingQuantity: quantity,
    targetPolicy: 'FULL_CLOSE_TP1',
    tpStatus: { tp1: 'PENDING', tp2: 'PENDING', tp3: 'PENDING' },
    stopStatus: 'ACTIVE',
    plannedRisk: validation.plannedRisk ?? 0,
    rr: signal.rr,
    status: 'ACTIVE',
    protectionSource,
    protectionConfirmedAt: now,
    openedAt: now,
    updatedAt: now,
    unrealizedPnl: 0,
    signalId: signal.id,
    queueId: queue.id,
    executionId: execution.id,
    exchangeOrderId,
    orderLinkId: queue.orderLinkId,
  };
  state.trades.push(trade);
  state.signals = state.signals.filter((row) => row.id !== signal.id);
  delete state.symbolBlocks[signal.symbol];
  save();
  return trade;
}

export function closeTradeToJournal(
  trade: Trade,
  exit: number,
  closeReason: JournalRecord['closeReason'],
): JournalRecord {
  const existingJournal = state.journal.find((row) => row.id === trade.id);
  if (existingJournal) return existingJournal;
  const execution = state.executions.find((row) => row.id === trade.executionId);
  const queue = state.queue.find((row) => row.id === trade.queueId);
  if (closeReason === 'TAKE_PROFIT') {
    trade.tpStatus = { tp1: 'HIT', tp2: 'SKIPPED', tp3: 'SKIPPED' };
  } else if (closeReason === 'STOP_LOSS') {
    trade.stopStatus = 'HIT';
    trade.tpStatus = { tp1: 'SKIPPED', tp2: 'SKIPPED', tp3: 'SKIPPED' };
  } else {
    trade.tpStatus = {
      tp1: trade.tpStatus?.tp1 ?? 'PENDING',
      tp2: trade.tpStatus?.tp2 ?? 'PENDING',
      tp3: trade.tpStatus?.tp3 ?? 'PENDING',
    };
  }
  trade.remainingQuantity = 0;
  if (execution && queue && execution.state !== 'CLOSED') {
    if (execution.state !== 'CLOSING') {
      execution.state = 'CLOSING';
      queue.state = 'CLOSING';
    }
    execution.state = 'CLOSED';
    queue.state = 'CLOSED';
    execution.positionSize = 0;
    execution.updatedAt = new Date().toISOString();
    queue.updatedAt = execution.updatedAt;
  }
  const grossPnl =
    (trade.side === 'LONG' ? exit - trade.entry : trade.entry - exit) * trade.quantity;
  const fees = (trade.entry + exit) * trade.quantity * env.feeRate;
  const slippage = Math.abs(exit - trade.currentPrice) * trade.quantity;
  const netPnl = grossPnl - fees - slippage;
  const riskAmount = Math.max(trade.plannedRisk, Number.EPSILON);
  const journal: JournalRecord = {
    ...trade,
    exit,
    grossPnl: Number(grossPnl.toFixed(8)),
    fees: Number(fees.toFixed(8)),
    slippage: Number(slippage.toFixed(8)),
    netPnl: Number(netPnl.toFixed(8)),
    achievedRR: Number((netPnl / riskAmount).toFixed(4)),
    closeReason,
    closedAt: new Date().toISOString(),
  };
  state.trades = state.trades.filter((row) => row.id !== trade.id);
  state.journal.push(journal);
  // Journal, telemetry and Local Paper accounting must be persisted atomically.
  // A separate telemetry save here created a crash window where the journal was
  // durable but realized PnL was not, and the exactly-once guard prevented repair.
  incrementExecutionTelemetry('finalizedTrades', 1, false);
  if (trade.mode === 'LOCAL_PAPER') {
    state.paperAccount.realizedPnl = Number(
      (state.paperAccount.realizedPnl + journal.netPnl).toFixed(8),
    );
    state.paperAccount.availableBalance = Number(
      (state.paperAccount.startingBalance + state.paperAccount.realizedPnl).toFixed(8),
    );
  }
  save();
  return journal;
}
