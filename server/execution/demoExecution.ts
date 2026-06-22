import { approximatelyEqual } from '../market/precision';
import { incrementExecutionTelemetry, log, save, state } from '../persistence/store';
import type {
  DemoExchangeAdapter,
  DemoOrder,
  QueueItem,
  RiskValidation,
  Signal,
  Trade,
} from '../types/domain';
import { activateTrade, getOrCreateExecution } from './records';
import { transitionExecution } from './stateMachine';

interface ExecuteOptions {
  pollAttempts?: number;
  pollDelayMs?: number;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function orderState(order: DemoOrder): 'FILLED' | 'PARTIAL' | 'REJECTED' | 'CANCELLED' | 'OPEN' {
  const status = order.status.toLowerCase();
  if (status === 'filled') return 'FILLED';
  if (status.includes('partially')) return 'PARTIAL';
  if (status.includes('reject') || status.includes('deactivated')) return 'REJECTED';
  if (status.includes('cancel')) return 'CANCELLED';
  return 'OPEN';
}

function syncOrderConfirmation(
  queue: QueueItem,
  execution: ReturnType<typeof getOrCreateExecution>,
  order: DemoOrder,
): void {
  execution.exchangeOrderId = order.orderId || execution.exchangeOrderId;
  execution.filledQuantity = Math.max(
    execution.filledQuantity,
    order.cumulativeFilledQuantity,
  );
  if (order.averagePrice > 0) execution.averageFillPrice = order.averagePrice;
  execution.confirmations.orderSubmitted = true;
  queue.confirmations.orderSubmitted = true;
  save();
}

export async function executeDemoQueue(
  queue: QueueItem,
  signal: Signal,
  validation: RiskValidation,
  adapter: DemoExchangeAdapter,
  options: ExecuteOptions = {},
): Promise<Trade> {
  if (!validation.ok || !validation.quantity) {
    throw new Error(validation.reason || 'Risk validation failed');
  }
  const existingTrade = state.trades.find(
    (trade) => trade.queueId === queue.id || trade.orderLinkId === queue.orderLinkId,
  );
  if (existingTrade) {
    incrementExecutionTelemetry('duplicateSubmissionsBlocked');
    return existingTrade;
  }

  const execution = getOrCreateExecution(queue, signal, 'BYBIT_DEMO', validation);
  const pollAttempts = options.pollAttempts ?? 8;
  const pollDelayMs = options.pollDelayMs ?? 500;
  let order: DemoOrder | null = null;

  if (execution.filledQuantity <= 0) {
    if (queue.state === 'CREATED' || queue.state === 'ERROR') {
      transitionExecution(execution, queue, 'SUBMITTING');
    }
    execution.attempts += 1;
    queue.attempts = execution.attempts;
    save();

    try {
      // Lookup always happens before submission. This is the core timeout/restart idempotency guard.
      order = await adapter.findOrderByLinkId(signal.symbol, queue.orderLinkId);
      if (!order) {
        order = await adapter.placeMarketOrder({
          symbol: signal.symbol,
          side: signal.side === 'LONG' ? 'Buy' : 'Sell',
          quantity: validation.quantity,
          orderLinkId: queue.orderLinkId,
        });
      }
      syncOrderConfirmation(queue, execution, order);
      if (queue.state === 'SUBMITTING' || queue.state === 'ERROR') {
        transitionExecution(execution, queue, 'SUBMITTED');
      }
    } catch (error) {
      // A timeout can happen after Bybit accepted the order. Query by the same orderLinkId before declaring failure.
      try {
        order = await adapter.findOrderByLinkId(signal.symbol, queue.orderLinkId);
      } catch {
        order = null;
      }
      if (!order) {
        const reason = `Order outcome unknown: ${error instanceof Error ? error.message : String(error)}`;
        transitionExecution(execution, queue, 'ERROR', reason);
        state.symbolBlocks[signal.symbol] = reason;
        save();
        log('DEMO_ORDER_UNKNOWN', 'Demo order outcome could not be confirmed', {
          symbol: signal.symbol,
          queueId: queue.id,
        }, 'ERROR');
        throw new Error(reason);
      }
      syncOrderConfirmation(queue, execution, order);
      if (queue.state === 'SUBMITTING' || queue.state === 'ERROR') {
        transitionExecution(execution, queue, 'SUBMITTED');
      }
    }

    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
      const refreshed = await adapter.findOrderByLinkId(signal.symbol, queue.orderLinkId);
      if (refreshed) order = refreshed;
      if (!order) {
        await delay(pollDelayMs);
        continue;
      }
      syncOrderConfirmation(queue, execution, order);
      const status = orderState(order);
      if (status === 'REJECTED') {
        transitionExecution(execution, queue, 'REJECTED', `Exchange rejected order: ${order.status}`);
        throw new Error(`Exchange rejected order: ${order.status}`);
      }
      if (status === 'CANCELLED' && order.cumulativeFilledQuantity <= 0) {
        transitionExecution(execution, queue, 'CANCELLED', 'Order cancelled without a fill');
        throw new Error('Order cancelled without a fill');
      }
      if (status === 'PARTIAL') {
        if (queue.state !== 'PARTIALLY_FILLED') {
          transitionExecution(execution, queue, 'PARTIALLY_FILLED');
        }
      }
      if (status === 'FILLED') break;
      await delay(pollDelayMs);
    }

    if (!order || execution.filledQuantity <= 0) {
      const reason = 'No confirmed fill before execution timeout';
      transitionExecution(execution, queue, 'ERROR', reason);
      state.symbolBlocks[signal.symbol] = reason;
      save();
      throw new Error(reason);
    }

    if (orderState(order) !== 'FILLED' && execution.exchangeOrderId) {
      await adapter.cancelOrder(signal.symbol, execution.exchangeOrderId);
      const finalOrder = await adapter.findOrderByLinkId(signal.symbol, queue.orderLinkId);
      if (finalOrder) syncOrderConfirmation(queue, execution, finalOrder);
      // A confirmed partial fill becomes the complete managed position after cancelling the remainder.
      if (execution.filledQuantity <= 0) {
        transitionExecution(execution, queue, 'CANCELLED', 'Unfilled remainder cancelled');
        throw new Error('Order cancelled without a confirmed fill');
      }
    }
  }

  execution.confirmations.fillConfirmed = execution.filledQuantity > 0;
  queue.confirmations.fillConfirmed = execution.confirmations.fillConfirmed;
  if (!['FILLED', 'PROTECTION_PENDING', 'PROTECTED'].includes(queue.state)) {
    transitionExecution(execution, queue, 'FILLED');
  }

  const position = await adapter.getPosition(signal.symbol);
  if (!position || position.size <= 0) {
    const reason = 'Order fill confirmed but exchange position not confirmed';
    transitionExecution(execution, queue, 'ERROR', reason);
    incrementExecutionTelemetry('protectionFailures');
    state.symbolBlocks[signal.symbol] = reason;
    save();
    throw new Error(reason);
  }
  const quantityTolerance = Math.max(signal.instrument.quantityStep / 2, Number.EPSILON);
  if (position.size - execution.filledQuantity > quantityTolerance) {
    const reason = `Exchange position size ${position.size} exceeds confirmed fill ${execution.filledQuantity}`;
    transitionExecution(execution, queue, 'ERROR', reason);
    state.symbolBlocks[signal.symbol] = reason;
    save();
    throw new Error(reason);
  }
  execution.positionSize = position.size;
  // Protection is based only on the confirmed exchange position, never the requested quantity.
  execution.filledQuantity = Math.min(execution.filledQuantity, position.size);
  execution.averageFillPrice = position.averagePrice || execution.averageFillPrice;
  execution.confirmations.positionConfirmed = true;
  queue.confirmations.positionConfirmed = true;
  if (queue.state !== 'PROTECTION_PENDING' && queue.state !== 'PROTECTED') {
    transitionExecution(execution, queue, 'PROTECTION_PENDING');
  }

  const stopLoss = validation.roundedStopLoss ?? signal.stopLoss;
  const takeProfit = validation.roundedTp1 ?? signal.tp1;
  try {
    if (queue.state !== 'PROTECTED') {
      await adapter.setProtection({
      symbol: signal.symbol,
      stopLoss,
      takeProfit,
        positionIdx: position.positionIdx,
      });
    }
    const protectedPosition = await adapter.getPosition(signal.symbol);
    const stopConfirmed = Boolean(
      protectedPosition &&
        protectedPosition.stopLoss > 0 &&
        approximatelyEqual(protectedPosition.stopLoss, stopLoss, signal.instrument.tickSize),
    );
    const takeConfirmed = Boolean(
      protectedPosition &&
        protectedPosition.takeProfit > 0 &&
        approximatelyEqual(protectedPosition.takeProfit, takeProfit, signal.instrument.tickSize),
    );
    execution.stopLoss = stopLoss;
    execution.takeProfit = takeProfit;
    execution.confirmations.stopLossConfirmed = stopConfirmed;
    execution.confirmations.takeProfitConfirmed = takeConfirmed;
    queue.confirmations.stopLossConfirmed = stopConfirmed;
    queue.confirmations.takeProfitConfirmed = takeConfirmed;
    save();
    if (!stopConfirmed || !takeConfirmed) {
      throw new Error(
        `Exchange protection unconfirmed (SL=${stopConfirmed}, TP=${takeConfirmed})`,
      );
    }
  } catch (error) {
    const reason = `Protection failure: ${error instanceof Error ? error.message : String(error)}`;
    transitionExecution(execution, queue, 'ERROR', reason);
    incrementExecutionTelemetry('protectionFailures');
    state.symbolBlocks[signal.symbol] = reason;
    save();
    log('DEMO_PROTECTION_FAILURE', 'Position exists but exchange protection is not confirmed', {
      symbol: signal.symbol,
      queueId: queue.id,
      exchangeOrderId: execution.exchangeOrderId,
    }, 'ERROR');
    throw new Error(reason);
  }

  if (queue.state !== 'PROTECTED') transitionExecution(execution, queue, 'PROTECTED');
  const trade = activateTrade({
    queue,
    signal,
    execution,
    validation,
    mode: 'BYBIT_DEMO',
    fillPrice: execution.averageFillPrice || position.averagePrice,
    quantity: position.size,
    protectionSource: 'BYBIT_EXCHANGE',
    exchangeOrderId: execution.exchangeOrderId,
  });
  log('DEMO_TRADE_PROTECTED', 'Bybit Demo trade activated after exchange protection confirmation', {
    symbol: trade.symbol,
    tradeId: trade.id,
    exchangeOrderId: trade.exchangeOrderId,
  });
  return trade;
}
