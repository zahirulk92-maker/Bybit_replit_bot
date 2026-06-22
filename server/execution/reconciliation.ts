import crypto from 'node:crypto';
import { env } from '../config/env';
import { approximatelyEqual } from '../market/precision';
import { incrementExecutionTelemetry, log, safeErrorMessage, save, state } from '../persistence/store';
import { withRetry } from '../runtime/retry';
import type { DemoExchangeAdapter, JournalRecord, Trade } from '../types/domain';
import { DemoApiError } from './bybitDemo';
import { closeTradeToJournal } from './records';
import { transitionExecution } from './stateMachine';
import { executeDemoQueue } from './demoExecution';

function inferCloseReason(trade: Trade): JournalRecord['closeReason'] {
  const tick = trade.currentPrice;
  const tolerance = Math.max(Math.abs(trade.entry) * 0.001, Number.EPSILON);
  if (Math.abs(tick - trade.tp1) <= tolerance) return 'TAKE_PROFIT';
  if (Math.abs(tick - trade.stopLoss) <= tolerance) return 'STOP_LOSS';
  return 'EXCHANGE_POSITION_CLOSED';
}

function retryable(error: unknown): boolean {
  return error instanceof DemoApiError ? error.retryable : true;
}

async function resilient<T>(label: string, operation: () => Promise<T>): Promise<T> {
  return withRetry(() => operation(), {
    attempts: env.workerRetryAttempts,
    baseDelayMs: env.workerBackoffBaseMs,
    maxDelayMs: env.workerBackoffMaxMs,
    retryable,
    onRetry: (error, attempt, delayMs) => {
      log('DEMO_RECONCILIATION_RETRY', `${label} will retry`, {
        attempt,
        delayMs,
        error: safeErrorMessage(error),
      }, 'WARNING');
      incrementExecutionTelemetry('reconciliationRetries');
    },
  });
}

let reconciliationRunning = false;

export function reconciliationStatus(): { running: boolean } {
  return { running: reconciliationRunning };
}

export async function reconcileDemo(
  adapter: DemoExchangeAdapter,
): Promise<{ skipped: boolean; recoveredExecutions: number; reconciledTrades: number; failures: number }> {
  if (reconciliationRunning) {
    log('DEMO_RECONCILIATION_OVERLAP_SKIPPED', 'Overlapping reconciliation cycle skipped', undefined, 'WARNING');
    return { skipped: true, recoveredExecutions: 0, reconciledTrades: 0, failures: 0 };
  }
  reconciliationRunning = true;
  let recoveredExecutions = 0;
  let reconciledTrades = 0;
  let failures = 0;
  const errors: string[] = [];
  try {
    for (const queue of state.queue.filter((item) =>
      ['SUBMITTING', 'SUBMITTED', 'PARTIALLY_FILLED', 'FILLED', 'PROTECTION_PENDING', 'ERROR'].includes(item.state) ||
      (item.state === 'PROTECTED' && !state.trades.some((trade) => trade.queueId === item.id)),
    )) {
      const signal = state.signals.find((row) => row.id === queue.signalId);
      if (!signal || !queue.validation?.ok) continue;
      try {
        await resilient(`execution recovery ${queue.id}`, () =>
          executeDemoQueue(queue, signal, queue.validation!, adapter, {
            pollAttempts: 2,
            pollDelayMs: 50,
          }),
        );
        recoveredExecutions += 1;
      } catch (error) {
        failures += 1;
        const message = safeErrorMessage(error);
        errors.push(`${queue.symbol}: ${message}`);
        log('DEMO_RECOVERY_PENDING', 'In-flight execution remains pending recovery', {
          symbol: queue.symbol,
          queueId: queue.id,
          error: message,
        }, 'WARNING');
      }
    }

    for (const trade of [...state.trades].filter((row) => row.mode === 'BYBIT_DEMO')) {
      try {
        const position = await resilient(`position sync ${trade.symbol}`, () => adapter.getPosition(trade.symbol));
        if (!position || position.size <= 0) {
          const missingCount = (state.positionMissingCounts[trade.id] ?? 0) + 1;
          state.positionMissingCounts[trade.id] = missingCount;
          state.symbolBlocks[trade.symbol] = `Exchange position missing; confirmation ${missingCount}/2`;
          save();
          if (missingCount < 2) {
            log('DEMO_POSITION_MISSING_PENDING', 'Missing position requires a second confirmed reconciliation cycle', {
              symbol: trade.symbol,
              tradeId: trade.id,
              missingCount,
            }, 'WARNING');
            continue;
          }
          const journal = closeTradeToJournal(trade, trade.currentPrice, inferCloseReason(trade));
          delete state.positionMissingCounts[trade.id];
          delete state.symbolBlocks[trade.symbol];
          save();
          log('DEMO_POSITION_CLOSED', 'Exchange position no longer exists; trade journaled after confirmation', {
            symbol: trade.symbol,
            tradeId: trade.id,
            closeReason: journal.closeReason,
          });
          reconciledTrades += 1;
          continue;
        }

        delete state.positionMissingCounts[trade.id];
        trade.currentPrice = position.markPrice || trade.currentPrice;
        trade.unrealizedPnl = position.unrealizedPnl;
        const sizeTolerance = Math.max(trade.initialQuantity * 1e-8, Number.EPSILON);
        if (!approximatelyEqual(position.size, trade.remainingQuantity, sizeTolerance)) {
          log('DEMO_POSITION_SIZE_MISMATCH', 'Persisted remaining quantity reconciled to exchange position size', {
            symbol: trade.symbol,
            tradeId: trade.id,
            persistedQuantity: trade.remainingQuantity,
            exchangeQuantity: position.size,
          }, 'WARNING');
          trade.remainingQuantity = position.size;
        }
        trade.quantity = position.size;
        trade.updatedAt = new Date().toISOString();
        const slConfirmed =
          position.stopLoss > 0 &&
          approximatelyEqual(position.stopLoss, trade.stopLoss, Math.max(Math.abs(trade.stopLoss) * 1e-8, Number.EPSILON));
        const tpConfirmed =
          position.takeProfit > 0 &&
          approximatelyEqual(position.takeProfit, trade.tp1, Math.max(Math.abs(trade.tp1) * 1e-8, Number.EPSILON));
        if (!slConfirmed || !tpConfirmed) {
          trade.status = 'PROTECTION_ERROR';
          incrementExecutionTelemetry('protectionFailures');
          state.symbolBlocks[trade.symbol] = `Reconciliation found missing protection (SL=${slConfirmed}, TP=${tpConfirmed})`;
          save();
          log('DEMO_PROTECTION_MISSING', 'Reconciliation detected missing exchange protection', {
            symbol: trade.symbol,
            tradeId: trade.id,
            stopLossConfirmed: slConfirmed,
            takeProfitConfirmed: tpConfirmed,
          }, 'ERROR');
          await resilient(`protection restore ${trade.symbol}`, async () => {
            await adapter.setProtection({
              symbol: trade.symbol,
              stopLoss: trade.stopLoss,
              takeProfit: trade.tp1,
              positionIdx: position.positionIdx,
            });
            const verified = await adapter.getPosition(trade.symbol);
            if (
              !verified ||
              !approximatelyEqual(verified.stopLoss, trade.stopLoss, Math.max(Math.abs(trade.stopLoss) * 1e-8, Number.EPSILON)) ||
              !approximatelyEqual(verified.takeProfit, trade.tp1, Math.max(Math.abs(trade.tp1) * 1e-8, Number.EPSILON))
            ) {
              throw new Error('Exchange protection remains unconfirmed after restore attempt');
            }
          });
          trade.status = 'ACTIVE';
          trade.protectionConfirmedAt = new Date().toISOString();
          delete state.symbolBlocks[trade.symbol];
          log('DEMO_PROTECTION_RESTORED', 'Exchange protection restored and confirmed', {
            symbol: trade.symbol,
            tradeId: trade.id,
          });
        } else {
          trade.status = 'ACTIVE';
          delete state.symbolBlocks[trade.symbol];
        }
        reconciledTrades += 1;
        save();
      } catch (error) {
        failures += 1;
        const message = safeErrorMessage(error);
        errors.push(`${trade.symbol}: ${message}`);
        trade.status = 'PROTECTION_ERROR';
        state.symbolBlocks[trade.symbol] = `Reconciliation error: ${message}`;
        save();
        log('DEMO_TRADE_RECONCILIATION_ERROR', 'Trade reconciliation failed without stopping other trades', {
          symbol: trade.symbol,
          tradeId: trade.id,
          error: message,
        }, 'ERROR');
      }
    }
    state.lastReconciliationAt = new Date().toISOString();
    state.lastReconciliationError = errors.length ? errors.slice(0, 5).join(' | ') : null;
    save();
    return { skipped: false, recoveredExecutions, reconciledTrades, failures };
  } finally {
    reconciliationRunning = false;
  }
}

export async function manualCloseDemoTrade(
  trade: Trade,
  adapter: DemoExchangeAdapter,
): Promise<void> {
  const existingJournal = state.journal.find((row) => row.id === trade.id);
  if (existingJournal) {
    incrementExecutionTelemetry('duplicateSubmissionsBlocked');
    return;
  }
  const execution = state.executions.find((row) => row.id === trade.executionId);
  const queue = state.queue.find((row) => row.id === trade.queueId);
  if (!execution || !queue) throw new Error('Trade execution linkage is missing');
  if (execution.state === 'CLOSED') return;
  incrementExecutionTelemetry('closeAttempts');
  if (execution.state !== 'CLOSING') transitionExecution(execution, queue, 'CLOSING');
  try {
    const position = await resilient(`manual close position lookup ${trade.symbol}`, () => adapter.getPosition(trade.symbol));
    if (!position || position.size <= 0) {
      closeTradeToJournal(trade, trade.currentPrice, 'EXCHANGE_POSITION_CLOSED');
      return;
    }
    const orderLinkId = `close-${crypto.createHash('sha256').update(trade.id).digest('hex').slice(0, 24)}`;
    let existingClose = await adapter.findOrderByLinkId(trade.symbol, orderLinkId);
    if (!existingClose) {
      try {
        existingClose = await adapter.closePosition({
          symbol: trade.symbol,
          side: position.side === 'Buy' ? 'Sell' : 'Buy',
          quantity: position.size,
          orderLinkId,
          positionIdx: position.positionIdx,
        });
      } catch (error) {
        existingClose = await adapter.findOrderByLinkId(trade.symbol, orderLinkId);
        if (!existingClose) throw error;
      }
    } else {
      incrementExecutionTelemetry('duplicateSubmissionsBlocked');
    }
    const after = await resilient(`manual close confirmation ${trade.symbol}`, () => adapter.getPosition(trade.symbol));
    if (after && after.size > 0) throw new Error('Manual close order confirmed but position remains open');
    trade.remainingQuantity = 0;
    closeTradeToJournal(trade, position.markPrice || trade.currentPrice, 'MANUAL_CLOSE');
    log('DEMO_MANUAL_CLOSE', 'Bybit Demo position fully closed and confirmed', {
      symbol: trade.symbol,
      tradeId: trade.id,
      closeOrderId: existingClose.orderId,
    });
  } catch (error) {
    incrementExecutionTelemetry('closeFailures');
    transitionExecution(execution, queue, 'ERROR', `Close failure: ${safeErrorMessage(error)}`);
    throw error;
  }
}

/**
 * Idempotent breakeven helper for a future runner policy. The approved current
 * policy is FULL_CLOSE_TP1, so it safely reports no action and never invents a
 * partial allocation. It can only update an actual remaining position after a
 * confirmed TP1 hit.
 */
export async function moveDemoStopToBreakeven(
  trade: Trade,
  adapter: DemoExchangeAdapter,
): Promise<{ updated: boolean; reason: string }> {
  if (trade.targetPolicy === 'FULL_CLOSE_TP1') {
    return { updated: false, reason: 'FULL_CLOSE_TP1 has no remaining runner' };
  }
  if (trade.stopStatus === 'BREAKEVEN') {
    return { updated: false, reason: 'Breakeven already confirmed' };
  }
  if (trade.tpStatus.tp1 !== 'HIT' || trade.remainingQuantity <= 0) {
    return { updated: false, reason: 'TP1 and remaining position are required' };
  }
  const position = await adapter.getPosition(trade.symbol);
  if (!position || position.size <= 0) {
    throw new Error('Cannot move stop to breakeven without an exchange position');
  }
  await adapter.setProtection({
    symbol: trade.symbol,
    stopLoss: trade.entry,
    takeProfit: trade.tp3,
    positionIdx: position.positionIdx,
  });
  const verified = await adapter.getPosition(trade.symbol);
  if (!verified || !approximatelyEqual(verified.stopLoss, trade.entry, Math.max(Math.abs(trade.entry) * 1e-8, Number.EPSILON))) {
    trade.stopStatus = 'FAILED';
    save();
    throw new Error('Breakeven stop update is not confirmed by exchange');
  }
  trade.stopLoss = trade.entry;
  trade.stopStatus = 'BREAKEVEN';
  trade.breakevenConfirmedAt = new Date().toISOString();
  save();
  return { updated: true, reason: 'Breakeven confirmed' };
}
