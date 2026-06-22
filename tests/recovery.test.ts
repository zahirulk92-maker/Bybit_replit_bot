import test from 'node:test';
import assert from 'node:assert/strict';
import { env, validateMode } from '../server/config/env';
import { reconcileDemo } from '../server/execution/reconciliation';
import { resetStateForTests, state } from '../server/persistence/store';
import { recoverPersistedState } from '../server/runtime/recovery';
import { scanner } from '../server/scanner/engine';
import { FakeDemoAdapter, makeQueue, makeSignal, makeValidation } from './helpers/fixtures';

test.beforeEach(() => resetStateForTests());

test('restart recovery resumes a submitted order by orderLinkId without resubmission', async () => {
  const signal = makeSignal();
  const validation = makeValidation();
  const queue = makeQueue(signal, validation);
  queue.state = 'SUBMITTED';
  state.signals.push(signal);
  state.queue.push(queue);
  recoverPersistedState();

  const adapter = new FakeDemoAdapter();
  adapter.seedFilled(signal, queue, 1);
  await reconcileDemo(adapter);

  assert.equal(adapter.placeCalls, 0);
  assert.equal(queue.state, 'PROTECTED');
  assert.equal(state.trades.length, 1);
  assert.equal(state.trades[0].protectionSource, 'BYBIT_EXCHANGE');
});

test('reconciliation detects missing protection and restores it before clearing the block', async () => {
  const signal = makeSignal();
  const validation = makeValidation();
  const queue = makeQueue(signal, validation);
  queue.state = 'SUBMITTED';
  state.signals.push(signal);
  state.queue.push(queue);
  const adapter = new FakeDemoAdapter();
  adapter.seedFilled(signal, queue, 1);
  await reconcileDemo(adapter);
  const trade = state.trades[0];
  assert.ok(trade);

  adapter.position!.stopLoss = 0;
  adapter.position!.takeProfit = 0;
  await reconcileDemo(adapter);

  assert.equal(trade.status, 'ACTIVE');
  assert.equal(state.symbolBlocks[trade.symbol], undefined);
  assert.ok(adapter.protectionCalls >= 2);
});

test('fresh restart keeps scanner OFF and default mode does not fall back automatically', () => {
  scanner.enabled = false;
  scanner.running = false;
  recoverPersistedState();
  assert.equal(scanner.enabled, false);
  assert.equal(env.mode, 'DISABLED');
  assert.equal(validateMode().valid, true);
  assert.equal(state.signals.length, 0);
  assert.equal(state.trades.length, 0);
});
