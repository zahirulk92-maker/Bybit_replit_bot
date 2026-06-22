import test from 'node:test';
import assert from 'node:assert/strict';
import { resetStateForTests, state } from '../server/persistence/store';
import {
  runScanWithDependencies,
  scanner,
  scannerProductionDependenciesForTests,
  type ScannerDependencies,
} from '../server/scanner/engine';
import { acceptCandidates } from '../server/signals/engine';
import type { Candidate, StrategyEvaluation } from '../server/types/domain';
import { candleSeries, makeContext, makeSignal, metadata } from './helpers/fixtures';

function candidateFor(symbol: string): Candidate {
  const signal = makeSignal({
    symbol,
    instrument: { ...metadata, symbol },
    triggerCandle: Date.now() - 300_000,
  });
  const {
    id: _id,
    createdAt: _createdAt,
    expiresAt: _expiresAt,
    confluenceStrategies: _confluenceStrategies,
    ...candidate
  } = signal;
  return candidate;
}

function qualifiedEvaluation(symbol: string): StrategyEvaluation[] {
  const candidate = candidateFor(symbol);
  return [{
    strategy: candidate.strategy,
    eligible: true,
    side: candidate.side,
    entry: candidate.entry,
    stopLoss: candidate.stopLoss,
    tp1: candidate.tp1,
    tp2: candidate.tp2,
    tp3: candidate.tp3,
    rr: candidate.rr,
    score: candidate.score,
    grade: candidate.grade,
    rejectionReasons: [],
    evidence: [],
    candidate,
  }];
}

function dependencies(openCandleSymbol?: string): ScannerDependencies {
  const symbols = Array.from({ length: 65 }, (_, index) => `S${index}USDT`);
  return {
    instruments: async () => symbols.map((symbol) => ({ ...metadata, symbol })),
    tickers: async () => symbols.map((symbol, index) => ({
      symbol,
      lastPrice: 100 + index,
      volume24h: 1_000_000 + index * 1_000,
      turnover24h: 100_000_000 + index * 10_000,
      bid1Price: 99.99 + index,
      ask1Price: 100.01 + index,
      spreadBps: 1,
      price24hPcnt: 0.02,
    })),
    orderbook: async (symbol) => {
      if (symbol === 'S64USDT') throw new Error('isolated depth failure');
      return {
        symbol,
        bids: [{ price: 100, quantity: 100 }],
        asks: [{ price: 100.01, quantity: 100 }],
        bidDepth: 10_000,
        askDepth: 10_001,
        depthRatio: 0.9999,
        capturedAt: new Date().toISOString(),
      };
    },
    candles: async (symbol, interval) => {
      if (symbol === 'S63USDT' && interval === '5') throw new Error('isolated candle failure');
      const minutes = Number(interval);
      const rows = candleSeries(80, 90, 0.2, minutes * 60_000);
      if (symbol === openCandleSymbol && interval === '15') rows.at(-1)!.closed = false;
      return rows;
    },
    evaluate: (context) => qualifiedEvaluation(context.symbol),
    accept: acceptCandidates,
  };
}

test.beforeEach(() => {
  resetStateForTests();
  scanner.enabled = false;
  scanner.running = false;
});

test('scanner connects strategy evaluation to top-50 flow with symbol isolation and signal limits', async () => {
  await runScanWithDependencies(dependencies(), { marketLimit: 50, depthShortlist: 65, concurrency: 5 });
  assert.equal(scanner.enabled, false);
  assert.equal(scanner.rankedSymbols, 50);
  assert.ok(scanner.evaluatedSymbols >= 49);
  assert.ok(scanner.symbolFailures >= 1);
  assert.equal(scanner.closedCandleViolations, 0);
  assert.equal(state.signals.length, 20);
  assert.equal(new Set(state.signals.map((row) => row.symbol)).size, state.signals.length);
});

test('scanner rejects any symbol containing an open candle', async () => {
  await runScanWithDependencies(dependencies('S62USDT'), { marketLimit: 50, depthShortlist: 65, concurrency: 5 });
  assert.equal(scanner.closedCandleViolations, 1);
  assert.equal(state.signals.some((row) => row.symbol === 'S62USDT'), false);
});

test('production scanner dependency is wired to all six independent strategy engines', () => {
  const rows = scannerProductionDependenciesForTests().evaluate(makeContext());
  assert.deepEqual(
    new Set(rows.map((row) => row.strategy)),
    new Set([
      'LIQUIDITY_SCALPING',
      'MOMENTUM_BREAKOUT',
      'PULLBACK_ENTRY',
      'LIQUIDITY_SWEEP',
      'EMA_REJECTION',
      'PURE_PRICE_ACTION',
    ]),
  );
});
