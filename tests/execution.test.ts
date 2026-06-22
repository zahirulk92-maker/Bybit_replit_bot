import test from 'node:test';
import assert from 'node:assert/strict';
import { executeDemoQueue } from '../server/execution/demoExecution';
import { resetStateForTests, state } from '../server/persistence/store';
import { FakeDemoAdapter, makeQueue, makeSignal, makeValidation } from './helpers/fixtures';

test.beforeEach(() => resetStateForTests());

test('timeout after exchange acceptance does not create a duplicate order', async () => {
  const signal = makeSignal();
  const validation = makeValidation();
  const queue = makeQueue(signal, validation);
  state.signals.push(signal);
  state.queue.push(queue);
  const adapter = new FakeDemoAdapter();
  adapter.timeoutAfterPlace = true;

  const trade = await executeDemoQueue(queue, signal, validation, adapter, {
    pollAttempts: 1,
    pollDelayMs: 0,
  });
  const sameTrade = await executeDemoQueue(queue, signal, validation, adapter, {
    pollAttempts: 1,
    pollDelayMs: 0,
  });

  assert.equal(adapter.placeCalls, 1);
  assert.equal(trade.id, sameTrade.id);
  assert.equal(queue.state, 'PROTECTED');
  assert.equal(state.trades.length, 1);
});

test('partial fill is confirmed, remainder cancelled, and only filled size becomes active', async () => {
  const signal = makeSignal();
  const validation = makeValidation({ quantity: 1 });
  const queue = makeQueue(signal, validation);
  state.signals.push(signal);
  state.queue.push(queue);
  const adapter = new FakeDemoAdapter();
  adapter.partialFill = true;

  const trade = await executeDemoQueue(queue, signal, validation, adapter, {
    pollAttempts: 2,
    pollDelayMs: 0,
  });

  assert.equal(adapter.cancelCalls, 1);
  assert.equal(trade.quantity, 0.4);
  assert.equal(queue.state, 'PROTECTED');
  assert.equal(queue.confirmations.fillConfirmed, true);
});

test('protection failure never reports a trade as protected and blocks duplicate symbol entry', async () => {
  const signal = makeSignal();
  const validation = makeValidation();
  const queue = makeQueue(signal, validation);
  state.signals.push(signal);
  state.queue.push(queue);
  const adapter = new FakeDemoAdapter();
  adapter.protectionWorks = false;

  await assert.rejects(
    executeDemoQueue(queue, signal, validation, adapter, {
      pollAttempts: 1,
      pollDelayMs: 0,
    }),
    /Protection failure/,
  );

  assert.equal(queue.state, 'ERROR');
  assert.equal(state.trades.length, 0);
  assert.match(state.symbolBlocks[signal.symbol], /Protection failure/);
  assert.equal(queue.confirmations.stopLossConfirmed, false);
  assert.equal(queue.confirmations.takeProfitConfirmed, false);
});
