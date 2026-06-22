import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { reconcileDemo } from '../server/execution/reconciliation';
import { resetStateForTests, state } from '../server/persistence/store';
import { FakeDemoAdapter, makeQueue, makeSignal, makeValidation } from './helpers/fixtures';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.beforeEach(() => resetStateForTests());

async function activateSeededTrade(adapter = new FakeDemoAdapter()) {
  const signal = makeSignal();
  const validation = makeValidation();
  const queue = makeQueue(signal, validation);
  queue.state = 'SUBMITTED';
  state.signals.push(signal);
  state.queue.push(queue);
  adapter.seedFilled(signal, queue, 1);
  await reconcileDemo(adapter);
  return { adapter, signal, queue, trade: state.trades[0] };
}

test('overlapping reconciliation cycles are skipped instead of running concurrently', async () => {
  const signal = makeSignal();
  const queue = makeQueue(signal, makeValidation());
  queue.state = 'SUBMITTED';
  state.signals.push(signal);
  state.queue.push(queue);
  const adapter = new FakeDemoAdapter();
  adapter.seedFilled(signal, queue, 1);
  const original = adapter.findOrderByLinkId.bind(adapter);
  adapter.findOrderByLinkId = async () => {
    await pause(40);
    return original();
  };
  const first = reconcileDemo(adapter);
  await pause(5);
  const second = await reconcileDemo(adapter);
  const firstResult = await first;
  assert.equal(second.skipped, true);
  assert.equal(firstResult.skipped, false);
  assert.equal(state.trades.length, 1);
});

test('reconciliation retries transient position failures within a bounded cycle', async () => {
  const { adapter } = await activateSeededTrade();
  let calls = 0;
  const original = adapter.getPosition.bind(adapter);
  adapter.getPosition = async () => {
    calls += 1;
    if (calls <= 2) throw new Error('temporary reconnect failure');
    return original();
  };
  const result = await reconcileDemo(adapter);
  assert.equal(result.failures, 0);
  assert.equal(calls, 3);
  assert.equal(state.trades[0].status, 'ACTIVE');
});

test('missing position requires two confirmed cycles before journaling', async () => {
  const { adapter, trade } = await activateSeededTrade();
  adapter.position = null;
  await reconcileDemo(adapter);
  assert.equal(state.trades.length, 1);
  assert.equal(state.positionMissingCounts[trade.id], 1);
  await reconcileDemo(adapter);
  assert.equal(state.trades.length, 0);
  assert.equal(state.journal.length, 1);
});

test('restart crash window after PROTECTED state activates trade without duplicate submission', async () => {
  const signal = makeSignal();
  const validation = makeValidation();
  const queue = makeQueue(signal, validation);
  queue.state = 'PROTECTED';
  queue.confirmations = {
    orderSubmitted: true,
    fillConfirmed: true,
    positionConfirmed: true,
    stopLossConfirmed: true,
    takeProfitConfirmed: true,
  };
  state.signals.push(signal);
  state.queue.push(queue);
  state.executions.push({
    id: crypto.randomUUID(),
    queueId: queue.id,
    signalId: signal.id,
    symbol: signal.symbol,
    mode: 'BYBIT_DEMO',
    state: 'PROTECTED',
    idempotencyKey: queue.idempotencyKey,
    orderLinkId: queue.orderLinkId,
    exchangeOrderId: 'existing-order',
    requestedQuantity: 1,
    filledQuantity: 1,
    averageFillPrice: signal.entry,
    positionSize: 1,
    stopLoss: signal.stopLoss,
    takeProfit: signal.tp1,
    confirmations: { ...queue.confirmations },
    attempts: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const adapter = new FakeDemoAdapter();
  adapter.seedFilled(signal, queue, 1);
  adapter.position!.stopLoss = signal.stopLoss;
  adapter.position!.takeProfit = signal.tp1;
  const result = await reconcileDemo(adapter);
  assert.equal(result.failures, 0);
  assert.equal(adapter.placeCalls, 0);
  assert.equal(state.trades.length, 1);
  assert.equal(state.trades[0].orderLinkId, queue.orderLinkId);
});

test('manual Demo close uses the opposite reduce-only side and journals once', async () => {
  const { adapter, trade } = await activateSeededTrade();
  assert.equal(adapter.position?.side, 'Buy');
  const { manualCloseDemoTrade } = await import('../server/execution/reconciliation');
  await manualCloseDemoTrade(trade, adapter);
  assert.equal(adapter.lastCloseInput?.side, 'Sell');
  assert.equal(adapter.closeCalls, 1);
  assert.equal(state.trades.length, 0);
  assert.equal(state.journal.length, 1);
  await manualCloseDemoTrade(trade, adapter);
  assert.equal(adapter.closeCalls, 1);
  assert.equal(state.journal.length, 1);
});
