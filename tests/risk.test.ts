import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../server/risk/engine';
import { resetStateForTests, state } from '../server/persistence/store';
import { makeSignal, metadata } from './helpers/fixtures';

test.beforeEach(() => resetStateForTests());

test('risk including fees and slippage stays within one percent', () => {
  const result = validate(makeSignal(), 10_000, metadata);
  assert.equal(result.ok, true);
  assert.ok((result.plannedRisk ?? Infinity) <= 100);
  assert.ok((result.quantity ?? 0) > 0);
});

test('maximum ten active trades blocks entry', () => {
  state.trades = Array.from({ length: 10 }, (_, index) => ({ symbol: `X${index}` }) as any);
  assert.equal(validate(makeSignal(), 10_000, metadata).ok, false);
});

test('minimum-order rejection occurs after precision rounding', () => {
  const tiny = { ...metadata, minimumQuantity: 10, minimumNotional: 2_000 };
  const result = validate(makeSignal(), 100, tiny);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? '', /minimum/i);
});
