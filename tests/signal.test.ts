import test from 'node:test';
import assert from 'node:assert/strict';
import { resetStateForTests, state } from '../server/persistence/store';
import { acceptCandidates } from '../server/signals/engine';
import { makeSignal } from './helpers/fixtures';

test.beforeEach(() => resetStateForTests());

test('below 85 is ignored and only one active signal exists per symbol', () => {
  const qualified = makeSignal();
  const below = { ...makeSignal(), score: 84, grade: 'A' as const };
  const accepted = acceptCandidates([below, qualified]);
  assert.equal(accepted.length, 1);
  assert.equal(state.signals.length, 1);
  assert.equal(state.signals[0].grade, 'A+');
  assert.equal(state.queue[0].state, 'CREATED');
  acceptCandidates([{ ...qualified, id: undefined } as any]);
  assert.equal(state.signals.length, 1);
});

test('maximum twenty active signals is preserved', () => {
  const candidates = Array.from({ length: 25 }, (_, index) => ({
    ...makeSignal({ symbol: `S${index}USDT` }),
    id: undefined,
    triggerCandle: Date.now() - index * 300_000,
    instrument: { ...makeSignal().instrument, symbol: `S${index}USDT` },
  })) as any[];
  acceptCandidates(candidates);
  assert.equal(state.signals.length, 20);
});


test('closed queue history does not permanently block a later qualified signal for the same symbol', () => {
  const previous = makeSignal();
  const closedQueue = {
    id: 'closed-queue',
    signalId: previous.id,
    symbol: previous.symbol,
    state: 'CLOSED' as const,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 30_000).toISOString(),
    idempotencyKey: 'closed-idempotency',
    orderLinkId: 'bbot-closed-history',
    attempts: 1,
    confirmations: {
      orderSubmitted: true,
      fillConfirmed: true,
      positionConfirmed: true,
      stopLossConfirmed: true,
      takeProfitConfirmed: true,
    },
  };
  state.queue.push(closedQueue);
  const next = { ...makeSignal(), triggerCandle: previous.triggerCandle + 300_000 };
  const accepted = acceptCandidates([next]);
  assert.equal(accepted.length, 1);
  assert.equal(state.signals[0].symbol, previous.symbol);
});
