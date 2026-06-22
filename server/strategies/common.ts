import { roundPrice } from '../market/precision';
import type {
  Candle,
  Candidate,
  Grade,
  MarketSnapshot,
  Side,
  StrategyContext,
  StrategyEvaluation,
  StrategyEvidence,
  StrategyId,
} from '../types/domain';

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

export function gradeForScore(score: number): Grade | null {
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  return null;
}

export function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function ema(candles: Candle[], period: number): number {
  if (!candles.length) return 0;
  const multiplier = 2 / (period + 1);
  let value = candles[0].close;
  for (const candle of candles.slice(1)) {
    value = candle.close * multiplier + value * (1 - multiplier);
  }
  return value;
}

export function atr(candles: Candle[], period = 14): number {
  const rows = candles.slice(-period);
  if (!rows.length) return 0;
  return average(
    rows.map((candle, index) => {
      const previousClose = rows[index - 1]?.close ?? candle.open;
      return Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose),
      );
    }),
  );
}

export function highest(candles: Candle[]): number {
  return candles.length ? Math.max(...candles.map((candle) => candle.high)) : 0;
}

export function lowest(candles: Candle[]): number {
  return candles.length ? Math.min(...candles.map((candle) => candle.low)) : 0;
}

export function bodyRatio(candle: Candle): number {
  const range = Math.max(candle.high - candle.low, Number.EPSILON);
  return Math.abs(candle.close - candle.open) / range;
}

export function volumeRatio(candles: Candle[], lookback = 20): number {
  if (candles.length < 2) return 0;
  const current = candles.at(-1)?.volume ?? 0;
  const baseline = average(candles.slice(-(lookback + 1), -1).map((candle) => candle.volume));
  return baseline > 0 ? current / baseline : 0;
}

export function detectTrend(candles1h: Candle[]): 'UP' | 'DOWN' | 'SIDEWAYS' {
  if (candles1h.length < 55) return 'SIDEWAYS';
  const ema20 = ema(candles1h, 20);
  const ema50 = ema(candles1h, 50);
  const last = candles1h.at(-1)!;
  const separation = Math.abs(ema20 - ema50) / Math.max(last.close, Number.EPSILON);
  if (separation < 0.001) return 'SIDEWAYS';
  if (ema20 > ema50 && last.close > ema20) return 'UP';
  if (ema20 < ema50 && last.close < ema20) return 'DOWN';
  return 'SIDEWAYS';
}

export function directionalCandle(candle: Candle, side: Side): boolean {
  return side === 'LONG' ? candle.close > candle.open : candle.close < candle.open;
}

export function evidence(
  rule: string,
  passed: boolean,
  value?: StrategyEvidence['value'],
  threshold?: StrategyEvidence['threshold'],
  note?: string,
): StrategyEvidence {
  return { rule, passed, value, threshold, note };
}

export interface FinalizeInput {
  context: StrategyContext;
  strategy: StrategyId;
  side: Side | null;
  rawEntry: number | null;
  rawStop: number | null;
  rawScore: number;
  evidence: StrategyEvidence[];
  eligibility: boolean;
  setup15m: string;
  entry5m: string;
  confirmations: string[];
  additionalRejections?: string[];
}

export function finalizeStrategy(input: FinalizeInput): StrategyEvaluation {
  const {
    context,
    strategy,
    side,
    rawEntry,
    rawStop,
    rawScore,
    evidence: rows,
    eligibility,
    setup15m,
    entry5m,
    confirmations,
    additionalRejections = [],
  } = input;
  const passedRules = rows.filter((row) => row.passed).length;
  const allRulesPassed = rows.length > 0 && passedRules === rows.length;
  const uncappedScore = clampScore(rawScore);
  // A failed evidence rule cannot be offset by additive points into an A/A+ grade.
  const score = allRulesPassed && eligibility ? uncappedScore : Math.min(84.99, uncappedScore);
  const grade = gradeForScore(score);
  const rejectionReasons = [
    ...rows.filter((row) => !row.passed).map((row) => row.note || `${row.rule} failed`),
    ...additionalRejections,
  ];

  if (!side || !rawEntry || !rawStop || rawEntry <= 0 || rawStop <= 0 || rawEntry === rawStop) {
    return {
      strategy,
      eligible: false,
      side,
      entry: rawEntry,
      stopLoss: rawStop,
      tp1: null,
      tp2: null,
      tp3: null,
      rr: null,
      score,
      grade,
      rejectionReasons: rejectionReasons.length ? rejectionReasons : ['Invalid strategy price geometry'],
      evidence: rows,
    };
  }

  const metadata = context.instrument;
  const entry = roundPrice(metadata, rawEntry, 'NEAREST');
  const stopLoss = roundPrice(metadata, rawStop, side === 'LONG' ? 'DOWN' : 'UP');
  const riskDistance = Math.abs(entry - stopLoss);
  const rawTp1 = side === 'LONG' ? entry + riskDistance * 2 : entry - riskDistance * 2;
  const rawTp2 = side === 'LONG' ? entry + riskDistance * 2.5 : entry - riskDistance * 2.5;
  const rawTp3 = side === 'LONG' ? entry + riskDistance * 3 : entry - riskDistance * 3;
  const tp1 = roundPrice(metadata, rawTp1, side === 'LONG' ? 'UP' : 'DOWN');
  const tp2 = roundPrice(metadata, rawTp2, side === 'LONG' ? 'UP' : 'DOWN');
  const tp3 = roundPrice(metadata, rawTp3, side === 'LONG' ? 'UP' : 'DOWN');
  const rr = riskDistance > 0 ? Math.abs(tp1 - entry) / riskDistance : 0;
  const minimumRrPassed = rr + 1e-9 >= 2;
  const qualified = eligibility && minimumRrPassed && grade !== null;
  if (!minimumRrPassed) rejectionReasons.push('Minimum RR 1:2 not met after tick-size rounding');
  if (!grade) rejectionReasons.push('Score below 85');

  const snapshot: MarketSnapshot = {
    trend1h: detectTrend(context.candles1h),
    setup15m,
    entry5m,
    spreadBps: context.ticker.spreadBps,
    depthRatio: context.orderBook.depthRatio,
    capturedAt: context.capturedAt,
    marketQuality: context.marketQuality,
  };

  const candidate: Candidate | undefined = qualified
    ? {
        symbol: context.symbol,
        side,
        strategy,
        entry,
        stopLoss,
        tp1,
        tp2,
        tp3,
        takeProfit: tp1,
        rr: Number(rr.toFixed(4)),
        score,
        grade,
        confirmations,
        rejectionReasons: [],
        evidence: rows,
        snapshot,
        instrument: metadata,
        triggerCandle: context.candles5m.at(-1)?.start ?? 0,
        marketQuality: context.marketQuality!,
        signalEvidence: {
          timeframeAlignment: `${snapshot.trend1h} / ${setup15m} / ${entry5m}`,
          entryReason: confirmations.at(-1) ?? entry5m,
          stopReason: `Invalidation beyond ${strategy} setup structure`,
          targetReason: 'TP1/TP2/TP3 fixed at 2R/2.5R/3R from rounded risk distance',
          scoreBreakdown: {
            raw: uncappedScore,
            passedRules,
            totalRules: rows.length,
            capped: score !== uncappedScore,
          },
          candleTimestamps: {
            '1h': context.candles1h.at(-1)?.start ?? 0,
            '15m': context.candles15m.at(-1)?.start ?? 0,
            '5m': context.candles5m.at(-1)?.start ?? 0,
          },
        },
      }
    : undefined;

  return {
    strategy,
    eligible: qualified,
    side,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    rr: Number(rr.toFixed(4)),
    score,
    grade,
    rejectionReasons,
    evidence: rows,
    candidate,
  };
}

export function insufficientData(strategy: StrategyId): StrategyEvaluation {
  return {
    strategy,
    eligible: false,
    side: null,
    entry: null,
    stopLoss: null,
    tp1: null,
    tp2: null,
    tp3: null,
    rr: null,
    score: 0,
    grade: null,
    rejectionReasons: ['Insufficient closed-candle history'],
    evidence: [evidence('Closed candle history', false, false, '>= 55/30/30 candles')],
  };
}

export function hasMinimumData(context: StrategyContext): boolean {
  return (
    context.candles1h.length >= 55 &&
    context.candles15m.length >= 30 &&
    context.candles5m.length >= 30 &&
    context.candles1h.every((candle) => candle.closed) &&
    context.candles15m.every((candle) => candle.closed) &&
    context.candles5m.every((candle) => candle.closed)
  );
}
