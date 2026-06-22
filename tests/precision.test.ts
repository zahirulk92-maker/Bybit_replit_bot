import test from 'node:test';
import assert from 'node:assert/strict';
import { isMinimumOrderValid, roundPrice, roundQuantity } from '../server/market/precision';
import { metadata } from './helpers/fixtures';

test('price and quantity round to Bybit instrument steps', () => {
  assert.equal(roundPrice({ ...metadata, tickSize: 0.05 }, 100.037, 'DOWN'), 100);
  assert.equal(roundPrice({ ...metadata, tickSize: 0.05 }, 100.037, 'UP'), 100.05);
  assert.equal(roundQuantity({ ...metadata, quantityStep: 0.01 }, 1.239), 1.23);
});

test('minimum quantity and minimum notional are both enforced', () => {
  assert.equal(isMinimumOrderValid(metadata, 0.0005, 100).ok, false);
  assert.equal(isMinimumOrderValid(metadata, 0.01, 100).ok, false);
  assert.equal(isMinimumOrderValid(metadata, 0.1, 100).ok, true);
});
