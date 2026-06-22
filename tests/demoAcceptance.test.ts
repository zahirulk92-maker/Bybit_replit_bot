import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../server/config/env';
import {
  DEMO_ACCEPTANCE_CONFIRMATION,
  runDemoAcceptance,
} from '../server/execution/demoAcceptance';
import { resetStateForTests, state } from '../server/persistence/store';
import { FakeDemoAdapter, makeQueue, makeSignal, metadata } from './helpers/fixtures';

const original = {
  mode: env.mode,
  demoAcceptanceEnabled: env.demoAcceptanceEnabled,
  demoAcceptanceSymbol: env.demoAcceptanceSymbol,
  demoKey: env.demoKey,
  demoSecret: env.demoSecret,
};

test.beforeEach(() => {
  resetStateForTests();
  env.mode = 'BYBIT_DEMO';
  env.demoAcceptanceEnabled = true;
  env.demoAcceptanceSymbol = metadata.symbol;
  env.demoKey = 'configured-in-test-only';
  env.demoSecret = 'configured-in-test-only';
});

test.after(() => Object.assign(env, original));

test('Demo acceptance requires explicit confirmation and never starts automatically', async () => {
  const signal = makeSignal();
  const queue = makeQueue(signal);
  state.signals.push(signal);
  state.queue.push(queue);
  const adapter = new FakeDemoAdapter();
  await assert.rejects(
    runDemoAcceptance(queue.id, undefined, adapter, {
      revalidate: async () => ({ ok: true }),
      getMetadata: async () => metadata,
    }),
    /explicit backend Demo acceptance confirmation/i,
  );
  assert.equal(adapter.placeCalls, 0);
  assert.equal(state.trades.length, 0);
});

test('Demo acceptance uses the smallest valid quantity and completes protection confirmation', async () => {
  const signal = makeSignal();
  const queue = makeQueue(signal);
  state.signals.push(signal);
  state.queue.push(queue);
  const adapter = new FakeDemoAdapter();
  const trade = await runDemoAcceptance(queue.id, DEMO_ACCEPTANCE_CONFIRMATION, adapter, {
    revalidate: async () => ({ ok: true }),
    getMetadata: async () => metadata,
  });
  assert.equal(adapter.placeCalls, 1);
  assert.equal(trade.quantity, 0.05);
  assert.equal(queue.state, 'PROTECTED');
  assert.equal(trade.protectionSource, 'BYBIT_EXCHANGE');
});

test('Demo acceptance rejects any symbol other than the one approved in environment', async () => {
  const signal = makeSignal({ symbol: 'OTHERUSDT', instrument: { ...metadata, symbol: 'OTHERUSDT' } });
  const queue = makeQueue(signal);
  state.signals.push(signal);
  state.queue.push(queue);
  await assert.rejects(
    runDemoAcceptance(queue.id, DEMO_ACCEPTANCE_CONFIRMATION, new FakeDemoAdapter(), {
      revalidate: async () => ({ ok: true }),
      getMetadata: async () => signal.instrument,
    }),
    /restricted to TESTUSDT/,
  );
});


test('closed historical execution does not block a new approved Demo acceptance run', async () => {
  const signal = makeSignal();
  const queue = makeQueue(signal);
  state.signals.push(signal);
  state.queue.push(queue);
  state.executions.push({
    id: 'closed-execution',
    queueId: 'old-queue',
    signalId: 'old-signal',
    symbol: signal.symbol,
    mode: 'BYBIT_DEMO',
    state: 'CLOSED',
    idempotencyKey: 'old-idempotency',
    orderLinkId: 'bbot-old-closed',
    requestedQuantity: 1,
    filledQuantity: 1,
    confirmations: {
      orderSubmitted: true,
      fillConfirmed: true,
      positionConfirmed: true,
      stopLossConfirmed: true,
      takeProfitConfirmed: true,
    },
    attempts: 1,
    createdAt: new Date(Date.now() - 120_000).toISOString(),
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
  });
  const adapter = new FakeDemoAdapter();
  const trade = await runDemoAcceptance(queue.id, DEMO_ACCEPTANCE_CONFIRMATION, adapter, {
    revalidate: async () => ({ ok: true }),
    getMetadata: async () => metadata,
  });
  assert.equal(trade.symbol, signal.symbol);
  assert.equal(adapter.placeCalls, 1);
});
