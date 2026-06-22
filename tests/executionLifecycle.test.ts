import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, transitionExecution } from '../server/execution/stateMachine';
import { closeTradeToJournal } from '../server/execution/records';
import { executeDemoQueue } from '../server/execution/demoExecution';
import { manualCloseDemoTrade, moveDemoStopToBreakeven, reconcileDemo } from '../server/execution/reconciliation';
import { resetStateForTests, state } from '../server/persistence/store';
import { scanner } from '../server/scanner/engine';
import { FakeDemoAdapter, makeQueue, makeSignal, makeValidation } from './helpers/fixtures';

test.beforeEach(() => resetStateForTests());

test('execution state machine accepts approved lifecycle and rejects invalid transitions', () => {
  assert.equal(canTransition('CREATED', 'SUBMITTING'), true);
  assert.equal(canTransition('PROTECTED', 'CLOSING'), true);
  assert.equal(canTransition('CLOSING', 'CLOSED'), true);
  assert.equal(canTransition('CREATED', 'PROTECTED'), false);
  assert.equal(canTransition('CLOSED', 'SUBMITTING'), false);
});

test('full-close-at-TP1 policy stores all targets and finalizes target statuses once', async () => {
  const signal = makeSignal();
  const validation = makeValidation();
  const queue = makeQueue(signal, validation);
  state.signals.push(signal);
  state.queue.push(queue);
  const adapter = new FakeDemoAdapter();
  const trade = await executeDemoQueue(queue, signal, validation, adapter, { pollAttempts: 2, pollDelayMs: 1 });
  assert.equal(trade.targetPolicy, 'FULL_CLOSE_TP1');
  assert.deepEqual(trade.tpStatus, { tp1: 'PENDING', tp2: 'PENDING', tp3: 'PENDING' });
  assert.equal(trade.initialQuantity, 1);
  assert.equal(trade.remainingQuantity, 1);

  const journal = closeTradeToJournal(trade, trade.tp1, 'TAKE_PROFIT');
  assert.deepEqual(journal.tpStatus, { tp1: 'HIT', tp2: 'SKIPPED', tp3: 'SKIPPED' });
  assert.equal(journal.remainingQuantity, 0);
  assert.equal(state.executions[0].state, 'CLOSED');
  assert.equal(state.queue[0].state, 'CLOSED');
  assert.equal(state.executionTelemetry.finalizedTrades, 1);

  const again = closeTradeToJournal(trade, trade.tp1, 'TAKE_PROFIT');
  assert.equal(again.id, journal.id);
  assert.equal(state.journal.length, 1);
  assert.equal(state.executionTelemetry.finalizedTrades, 1);
});

test('partial fill protects only the confirmed exchange position quantity', async () => {
  const signal = makeSignal();
  const validation = makeValidation({ quantity: 1 });
  const queue = makeQueue(signal, validation);
  state.signals.push(signal);
  state.queue.push(queue);
  const adapter = new FakeDemoAdapter();
  adapter.partialFill = true;
  const trade = await executeDemoQueue(queue, signal, validation, adapter, { pollAttempts: 1, pollDelayMs: 1 });
  assert.equal(trade.quantity, 0.4);
  assert.equal(trade.initialQuantity, 0.4);
  assert.equal(trade.remainingQuantity, 0.4);
  assert.equal(state.executions[0].filledQuantity, 0.4);
  assert.equal(adapter.cancelCalls, 1);
});

test('position larger than confirmed fill is rejected and never activated', async () => {
  const signal = makeSignal();
  const validation = makeValidation({ quantity: 1 });
  const queue = makeQueue(signal, validation);
  state.signals.push(signal);
  state.queue.push(queue);
  const adapter = new FakeDemoAdapter();
  adapter.seedFilled(signal, queue, 1);
  adapter.position!.size = 2;
  await assert.rejects(
    () => executeDemoQueue(queue, signal, validation, adapter, { pollAttempts: 1, pollDelayMs: 1 }),
    /exceeds confirmed fill/,
  );
  assert.equal(state.trades.length, 0);
  assert.equal(queue.state, 'ERROR');
});

test('manual close requires final zero position and records close failure without journal', async () => {
  const signal = makeSignal();
  const validation = makeValidation();
  const queue = makeQueue(signal, validation);
  state.signals.push(signal);
  state.queue.push(queue);
  const adapter = new FakeDemoAdapter();
  const trade = await executeDemoQueue(queue, signal, validation, adapter, { pollAttempts: 2, pollDelayMs: 1 });
  const originalClose = adapter.closePosition.bind(adapter);
  adapter.closePosition = async (input) => {
    const result = await originalClose(input);
    adapter.position = {
      symbol: signal.symbol, side: 'Buy', size: 0.1, averagePrice: 100, markPrice: 100,
      stopLoss: signal.stopLoss, takeProfit: signal.tp1, unrealizedPnl: 0, positionIdx: 0,
    };
    return result;
  };
  await assert.rejects(() => manualCloseDemoTrade(trade, adapter), /position remains open/);
  assert.equal(state.journal.length, 0);
  assert.equal(state.executionTelemetry.closeFailures, 1);
  assert.equal(state.executions[0].state, 'ERROR');
});

test('reconciliation corrects persisted position-size mismatch while scanner remains OFF', async () => {
  const signal = makeSignal();
  const validation = makeValidation();
  const queue = makeQueue(signal, validation);
  state.signals.push(signal);
  state.queue.push(queue);
  const adapter = new FakeDemoAdapter();
  const trade = await executeDemoQueue(queue, signal, validation, adapter, { pollAttempts: 2, pollDelayMs: 1 });
  trade.remainingQuantity = 1;
  adapter.position!.size = 0.6;
  scanner.enabled = false;
  await reconcileDemo(adapter);
  assert.equal(scanner.enabled, false);
  assert.equal(trade.remainingQuantity, 0.6);
  assert.equal(trade.quantity, 0.6);
  assert.equal(trade.status, 'ACTIVE');
});


test('breakeven update is idempotently skipped under approved TP1 full-close policy', async () => {
  const signal = makeSignal();
  const validation = makeValidation();
  const queue = makeQueue(signal, validation);
  state.signals.push(signal);
  state.queue.push(queue);
  const adapter = new FakeDemoAdapter();
  const trade = await executeDemoQueue(queue, signal, validation, adapter, { pollAttempts: 2, pollDelayMs: 1 });
  const before = adapter.protectionCalls;
  const first = await moveDemoStopToBreakeven(trade, adapter);
  const second = await moveDemoStopToBreakeven(trade, adapter);
  assert.equal(first.updated, false);
  assert.equal(second.updated, false);
  assert.equal(adapter.protectionCalls, before);
  assert.equal(trade.stopStatus, 'ACTIVE');
});

test('transitionExecution persists CLOSING and CLOSED without duplicate telemetry finalization', () => {
  const signal = makeSignal();
  const queue = makeQueue(signal);
  queue.state = 'PROTECTED';
  const execution = {
    id: 'exec', queueId: queue.id, signalId: signal.id, symbol: signal.symbol, mode: 'LOCAL_PAPER' as const,
    state: 'PROTECTED' as const, idempotencyKey: queue.idempotencyKey, orderLinkId: queue.orderLinkId,
    requestedQuantity: 1, filledQuantity: 1, confirmations: {
      orderSubmitted: true, fillConfirmed: true, positionConfirmed: true, stopLossConfirmed: true, takeProfitConfirmed: true,
    }, attempts: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  state.queue.push(queue);
  state.executions.push(execution);
  transitionExecution(execution, queue, 'CLOSING');
  transitionExecution(execution, queue, 'CLOSED');
  assert.equal(execution.state, 'CLOSED');
  assert.throws(() => transitionExecution(execution, queue, 'SUBMITTING'), /Invalid persisted execution transition/);
});
