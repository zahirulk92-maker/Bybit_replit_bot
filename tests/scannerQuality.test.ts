import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarketQuality, marketQualityRejections, baseMarketScore } from '../server/scanner/engine';
import { finalizeStrategy, evidence } from '../server/strategies/common';
import { acceptCandidates } from '../server/signals/engine';
import { resetStateForTests, state } from '../server/persistence/store';
import { makeContext, makeSignal } from './helpers/fixtures';

function quality(overrides: Record<string, unknown> = {}) {
  const context = makeContext();
  const result = buildMarketQuality(
    { ...context.ticker, ...(overrides.ticker as object ?? {}) },
    { ...context.orderBook, ...(overrides.book as object ?? {}) },
    context.candles1h,
    context.candles15m,
    context.candles5m,
    (overrides.now as number | undefined) ?? Date.now(),
  );
  return result;
}

test.beforeEach(() => resetStateForTests());

test('market quality rejects abnormal spread, low liquidity, weak depth, and stale candles', () => {
  const context = makeContext();
  const weak = buildMarketQuality(
    { ...context.ticker, turnover24h: 1000, volume24h: 0, spreadBps: 25 },
    { ...context.orderBook, bidDepth: 50, askDepth: 20, depthRatio: 8 },
    context.candles1h,
    context.candles15m,
    context.candles5m,
    Date.now() + 24 * 60 * 60_000,
  );
  const reasons = marketQualityRejections(weak);
  assert.ok(reasons.some((row) => row.includes('turnover')));
  assert.ok(reasons.some((row) => row.includes('spread')));
  assert.ok(reasons.some((row) => row.includes('depth')));
  assert.ok(reasons.some((row) => row.includes('Stale')));
});

test('market ranking is deterministic for equal market scores', () => {
  const a = { ...makeContext().ticker, symbol: 'AAAUSDT' };
  const b = { ...a, symbol: 'BBBUSDT' };
  const rows = [b, a].sort((left, right) => baseMarketScore(right) - baseMarketScore(left) || left.symbol.localeCompare(right.symbol));
  assert.deepEqual(rows.map((row) => row.symbol), ['AAAUSDT', 'BBBUSDT']);
});

test('failed evidence caps an inflated raw score below A grade', () => {
  const context = makeContext();
  const result = finalizeStrategy({
    context,
    strategy: 'PULLBACK_ENTRY',
    side: 'LONG',
    rawEntry: 100,
    rawStop: 99,
    rawScore: 100,
    evidence: [evidence('Trend alignment', true), evidence('Volume confirmation', false, 0.8, 1.2, 'Weak volume')],
    eligibility: false,
    setup15m: 'conflict',
    entry5m: 'weak',
    confirmations: [],
  });
  assert.equal(result.grade, null);
  assert.equal(result.score, 84.99);
  assert.ok(result.rejectionReasons.includes('Weak volume'));
});

test('signal ranking uses grade, score, RR, liquidity, freshness, then symbol deterministically', () => {
  const now = Date.now();
  const lowLiquidity = makeSignal({ symbol: 'ZZZUSDT', score: 90, rr: 2, triggerCandle: now - 600_000 });
  lowLiquidity.marketQuality.liquidityScore = 60;
  const highLiquidity = makeSignal({ symbol: 'AAAUSDT', score: 90, rr: 2, triggerCandle: now - 300_000 });
  highLiquidity.marketQuality.liquidityScore = 95;
  const candidates = [lowLiquidity, highLiquidity].map(({ id, createdAt, expiresAt, confluenceStrategies, ...row }) => row);
  acceptCandidates(candidates);
  assert.deepEqual(state.signals.map((row) => row.symbol), ['AAAUSDT', 'ZZZUSDT']);
});

test('timeframe conflict cannot qualify despite a high raw score', () => {
  const context = makeContext();
  const result = finalizeStrategy({
    context,
    strategy: 'EMA_REJECTION',
    side: 'LONG',
    rawEntry: 100,
    rawStop: 99,
    rawScore: 98,
    evidence: [evidence('1H trend', true), evidence('15M alignment', false, 'DOWN', 'UP', 'Timeframe conflict')],
    eligibility: false,
    setup15m: 'conflicting',
    entry5m: 'long',
    confirmations: [],
  });
  assert.equal(result.eligible, false);
  assert.equal(result.grade, null);
});
