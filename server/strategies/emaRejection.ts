import type { StrategyContext, StrategyEvaluation } from '../types/domain';
import {
  atr,
  detectTrend,
  directionalCandle,
  ema,
  evidence,
  finalizeStrategy,
  hasMinimumData,
  highest,
  insufficientData,
  lowest,
} from './common';

export function evaluateEmaRejection(context: StrategyContext): StrategyEvaluation {
  const strategy = 'EMA_REJECTION' as const;
  if (!hasMinimumData(context)) return insufficientData(strategy);
  const trend = detectTrend(context.candles1h);
  const side = trend === 'UP' ? 'LONG' : trend === 'DOWN' ? 'SHORT' : null;
  const last15m = context.candles15m.at(-1)!;
  const last5m = context.candles5m.at(-1)!;
  const ema20 = ema(context.candles15m, 20);
  const ema50 = ema(context.candles15m, 50);
  const volatility = atr(context.candles15m);
  const emaAlignment = side === 'LONG' ? ema20 > ema50 : side === 'SHORT' ? ema20 < ema50 : false;
  const testedEma =
    side === 'LONG'
      ? last15m.low <= ema20 && last15m.close > ema20
      : side === 'SHORT'
        ? last15m.high >= ema20 && last15m.close < ema20
        : false;
  const closeDistance = Math.abs(last15m.close - ema20) / Math.max(volatility, Number.EPSILON);
  const decisiveRejection = closeDistance >= 0.15 && (side ? directionalCandle(last15m, side) : false);
  const fiveMinuteConfirm = side ? directionalCandle(last5m, side) : false;
  const entry = last5m.close;
  const recent = context.candles15m.slice(-6);
  const stop =
    side === 'LONG'
      ? lowest(recent) - volatility * 0.12
      : side === 'SHORT'
        ? highest(recent) + volatility * 0.12
        : null;
  const rows = [
    evidence('1H directional trend', trend !== 'SIDEWAYS', trend, 'UP or DOWN', 'Sideways 1H trend rejected'),
    evidence('15M EMA20/EMA50 alignment', emaAlignment, `${ema20.toFixed(6)} / ${ema50.toFixed(6)}`, 'Trend aligned', '15M EMA alignment conflicts with 1H trend'),
    evidence('15M EMA20 test and close-away', testedEma, last15m.close, ema20, 'EMA20 was not tested and rejected'),
    evidence('Decisive rejection distance', decisiveRejection, Number(closeDistance.toFixed(2)), '>= 0.15 ATR', 'EMA rejection close is indecisive'),
    evidence('5M follow-through', fiveMinuteConfirm, fiveMinuteConfirm, true, '5M follow-through missing'),
  ];
  const score =
    64 +
    (trend !== 'SIDEWAYS' ? 8 : 0) +
    (emaAlignment ? 7 : 0) +
    (testedEma ? 10 : 0) +
    (decisiveRejection ? 5 : 0) +
    (fiveMinuteConfirm ? 6 : 0);
  return finalizeStrategy({
    context,
    strategy,
    side,
    rawEntry: entry,
    rawStop: stop,
    rawScore: score,
    evidence: rows,
    eligibility: Boolean(side && emaAlignment && testedEma && decisiveRejection && fiveMinuteConfirm),
    setup15m: testedEma ? 'EMA20 rejection confirmed' : 'EMA20 rejection absent',
    entry5m: fiveMinuteConfirm ? 'Follow-through confirmed' : 'Follow-through missing',
    confirmations: ['1H trend aligned', '15M EMA alignment', 'EMA20 test', '5M follow-through'],
  });
}
