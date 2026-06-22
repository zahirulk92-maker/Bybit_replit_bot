import test from 'node:test';
import assert from 'node:assert/strict';
import { ema, highest, lowest } from '../server/strategies/common';
import { evaluateEmaRejection } from '../server/strategies/emaRejection';
import { evaluateLiquidityScalping } from '../server/strategies/liquidityScalping';
import { evaluateLiquiditySweep } from '../server/strategies/liquiditySweep';
import { evaluateMomentumBreakout } from '../server/strategies/momentumBreakout';
import { evaluatePullbackEntry } from '../server/strategies/pullbackEntry';
import { evaluatePurePriceAction } from '../server/strategies/purePriceAction';
import { makeContext } from './helpers/fixtures';

test('liquidity scalping uses its independent spread and depth rules', () => {
  const context = makeContext();
  const result = evaluateLiquidityScalping(context);
  assert.equal(result.strategy, 'LIQUIDITY_SCALPING');
  assert.equal(result.eligible, true);
  assert.ok(result.candidate?.tp3 && result.candidate.tp3 > result.candidate.tp1);
  context.orderBook.depthRatio = 1;
  const rejected = evaluateLiquidityScalping(context);
  assert.equal(rejected.eligible, false);
  assert.equal(rejected.evidence.find((row) => row.rule === 'Directional depth imbalance')?.passed, false);
});

test('momentum breakout requires a 15M structure break and volume expansion', () => {
  const context = makeContext();
  const priorHigh = highest(context.candles15m.slice(-21, -1));
  context.candles15m[context.candles15m.length - 1] = {
    ...context.candles15m.at(-1)!,
    open: priorHigh + 0.1,
    low: priorHigh - 0.1,
    close: priorHigh + 1,
    high: priorHigh + 1.2,
    volume: 1_000,
  };
  const result = evaluateMomentumBreakout(context);
  assert.equal(result.strategy, 'MOMENTUM_BREAKOUT');
  assert.equal(result.eligible, true);
  context.candles15m.at(-1)!.close = priorHigh - 0.1;
  assert.equal(evaluateMomentumBreakout(context).eligible, false);
});

test('pullback entry requires EMA20 interaction without EMA50 structure failure', () => {
  const context = makeContext();
  const baselineEma20 = ema(context.candles15m.slice(0, -1), 20);
  context.candles15m[context.candles15m.length - 1] = {
    ...context.candles15m.at(-1)!,
    open: baselineEma20 - 0.02,
    low: baselineEma20 - 0.12,
    close: baselineEma20 + 0.2,
    high: baselineEma20 + 0.3,
    volume: 180,
  };
  const result = evaluatePullbackEntry(context);
  assert.equal(result.strategy, 'PULLBACK_ENTRY');
  assert.equal(result.eligible, true);
  context.candles15m.at(-1)!.low = baselineEma20 + 5;
  assert.equal(evaluatePullbackEntry(context).eligible, false);
});

test('liquidity sweep requires a sweep, reclaim, wick and volume', () => {
  const context = makeContext();
  const priorLow = lowest(context.candles15m.slice(-11, -1));
  context.candles15m[context.candles15m.length - 1] = {
    ...context.candles15m.at(-1)!,
    open: priorLow + 0.1,
    low: priorLow - 0.8,
    close: priorLow + 0.35,
    high: priorLow + 0.45,
    volume: 1_000,
  };
  const result = evaluateLiquiditySweep(context);
  assert.equal(result.strategy, 'LIQUIDITY_SWEEP');
  assert.equal(result.eligible, true);
  context.candles15m.at(-1)!.low = priorLow + 0.01;
  assert.equal(evaluateLiquiditySweep(context).eligible, false);
});

test('EMA rejection requires aligned EMA20 test and decisive close-away', () => {
  const context = makeContext();
  const baselineEma20 = ema(context.candles15m.slice(0, -1), 20);
  context.candles15m[context.candles15m.length - 1] = {
    ...context.candles15m.at(-1)!,
    open: baselineEma20 + 0.02,
    low: baselineEma20 - 0.08,
    close: baselineEma20 + 0.55,
    high: baselineEma20 + 0.65,
    volume: 180,
  };
  const result = evaluateEmaRejection(context);
  assert.equal(result.strategy, 'EMA_REJECTION');
  assert.equal(result.eligible, true);
  context.candles15m.at(-1)!.low = baselineEma20 + 1;
  assert.equal(evaluateEmaRejection(context).eligible, false);
});

test('pure price action requires a qualified pattern at recent structure', () => {
  const context = makeContext();
  const support = lowest(context.candles15m.slice(-12, -2));
  context.candles15m[context.candles15m.length - 2] = {
    ...context.candles15m.at(-2)!,
    open: support + 0.5,
    close: support + 0.2,
    high: support + 0.6,
    low: support + 0.1,
  };
  context.candles15m[context.candles15m.length - 1] = {
    ...context.candles15m.at(-1)!,
    open: support + 0.15,
    close: support + 0.75,
    high: support + 0.85,
    low: support - 0.05,
  };
  const result = evaluatePurePriceAction(context);
  assert.equal(result.strategy, 'PURE_PRICE_ACTION');
  assert.equal(result.eligible, true);
  context.candles15m.at(-1)!.open = context.candles15m.at(-1)!.close - 0.01;
  context.candles15m.at(-1)!.low = context.candles15m.at(-1)!.open - 0.01;
  assert.equal(evaluatePurePriceAction(context).eligible, false);
});
