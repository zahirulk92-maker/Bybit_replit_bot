import { env } from '../config/env';
import { incrementExecutionTelemetry, log, save, state } from '../persistence/store';
import type { QueueItem, RiskValidation, Signal, Ticker, Trade } from '../types/domain';
import { activateTrade, closeTradeToJournal, getOrCreateExecution } from './records';
import { transitionExecution } from './stateMachine';

export function executePaper(
  queue: QueueItem,
  signal: Signal,
  validation: RiskValidation,
): Trade {
  if (env.mode !== 'LOCAL_PAPER' || !env.paperEnabled) {
    throw new Error('LOCAL_PAPER is not enabled');
  }
  if (!validation.ok || !validation.quantity) {
    throw new Error(validation.reason || 'Risk validation failed');
  }
  const execution = getOrCreateExecution(queue, signal, 'LOCAL_PAPER', validation);
  const existing = state.trades.find(
    (trade) => trade.queueId === queue.id || trade.orderLinkId === queue.orderLinkId,
  );
  if (existing) return existing;

  transitionExecution(execution, queue, 'SUBMITTING');
  execution.attempts += 1;
  queue.attempts = execution.attempts;
  execution.confirmations.orderSubmitted = true;
  queue.confirmations.orderSubmitted = true;
  transitionExecution(execution, queue, 'SUBMITTED');

  const baseEntry = validation.roundedEntry ?? signal.entry;
  const fillPrice =
    signal.side === 'LONG'
      ? baseEntry * (1 + env.slippageRate)
      : baseEntry * (1 - env.slippageRate);
  execution.filledQuantity = validation.quantity;
  execution.averageFillPrice = fillPrice;
  execution.positionSize = validation.quantity;
  execution.confirmations.fillConfirmed = true;
  execution.confirmations.positionConfirmed = true;
  queue.confirmations.fillConfirmed = true;
  queue.confirmations.positionConfirmed = true;
  transitionExecution(execution, queue, 'FILLED');
  transitionExecution(execution, queue, 'PROTECTION_PENDING');

  // Local Paper protection is deterministic local lifecycle logic, never exchange confirmation.
  execution.stopLoss = validation.roundedStopLoss;
  execution.takeProfit = validation.roundedTp1;
  execution.confirmations.stopLossConfirmed = true;
  execution.confirmations.takeProfitConfirmed = true;
  queue.confirmations.stopLossConfirmed = true;
  queue.confirmations.takeProfitConfirmed = true;
  transitionExecution(execution, queue, 'PROTECTED');

  const trade = activateTrade({
    queue,
    signal,
    execution,
    validation,
    mode: 'LOCAL_PAPER',
    fillPrice,
    quantity: validation.quantity,
    protectionSource: 'LOCAL_ENGINE',
  });
  save();
  log('PAPER_EXECUTION', 'Deterministic Local Paper trade activated', {
    symbol: signal.symbol,
    tradeId: trade.id,
    queueId: queue.id,
  });
  return trade;
}

export function reconcilePaperTickers(rows: Ticker[]): void {
  const bySymbol = new Map(rows.map((row) => [row.symbol, row]));
  for (const trade of [...state.trades].filter((row) => row.mode === 'LOCAL_PAPER')) {
    const ticker = bySymbol.get(trade.symbol);
    if (!ticker || ticker.lastPrice <= 0) continue;
    trade.currentPrice = ticker.lastPrice;
    trade.updatedAt = new Date().toISOString();
    trade.unrealizedPnl = Number(
      (
        (trade.side === 'LONG'
          ? ticker.lastPrice - trade.entry
          : trade.entry - ticker.lastPrice) * trade.quantity
      ).toFixed(8),
    );
    const takeProfitHit =
      trade.side === 'LONG'
        ? ticker.lastPrice >= trade.tp1
        : ticker.lastPrice <= trade.tp1;
    const stopLossHit =
      trade.side === 'LONG'
        ? ticker.lastPrice <= trade.stopLoss
        : ticker.lastPrice >= trade.stopLoss;
    if (takeProfitHit) {
      incrementExecutionTelemetry('closeAttempts');
      closeTradeToJournal(trade, trade.tp1, 'TAKE_PROFIT');
      log('PAPER_TAKE_PROFIT', 'Local Paper trade fully closed at TP1', {
        symbol: trade.symbol,
        tradeId: trade.id,
      });
    } else if (stopLossHit) {
      incrementExecutionTelemetry('closeAttempts');
      closeTradeToJournal(trade, trade.stopLoss, 'STOP_LOSS');
      log('PAPER_STOP_LOSS', 'Local Paper trade fully closed at stop loss', {
        symbol: trade.symbol,
        tradeId: trade.id,
      });
    }
  }
  save();
}
