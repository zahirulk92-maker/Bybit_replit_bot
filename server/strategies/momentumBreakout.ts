import type { StrategyContext, StrategyEvaluation } from '../types/domain';
import {
  atr,
  bodyRatio,
  detectTrend,
  directionalCandle,
  evidence,
  finalizeStrategy,
  hasMinimumData,
  highest,
  insufficientData,
  lowest,
  volumeRatio,
} from './common';

export function evaluateMomentumBreakout(context: StrategyContext): StrategyEvaluation {
  const strategy = 'MOMENTUM_BREAKOUT' as const;
  if (!hasMinimumData(context)) return insufficientData(strategy);
  const trend = detectTrend(context.candles1h);
  const side = trend === 'UP' ? 'LONG' : trend === 'DOWN' ? 'SHORT' : null;
  const last15m = context.candles15m.at(-1)!;
  const last5m = context.candles5m.at(-1)!;
  const prior = context.candles15m.slice(-21, -1);
  const breakoutLevel = side === 'LONG' ? highest(prior) : lowest(prior);
  const breakout = side === 'LONG' ? last15m.close > breakoutLevel : side === 'SHORT' ? last15m.close < breakoutLevel : false;
  const volumeExpansion = volumeRatio(context.candles15m) >= 1.25;
  const strongBody = bodyRatio(last15m) >= 0.55;
  const fiveMinuteConfirm = side ? directionalCandle(last5m, side) : false;
  const volatility = atr(context.candles15m);
  const entry = last5m.close;
  const stop =
    side === 'LONG'
      ? Math.min(breakoutLevel, last15m.low) - volatility * 0.15
      : side === 'SHORT'
        ? Math.max(breakoutLevel, last15m.high) + volatility * 0.15
        : null;
  const rows = [
    evidence('1H directional trend', trend !== 'SIDEWAYS', trend, 'UP or DOWN', 'Sideways 1H trend rejected'),
    evidence('15M structure breakout', breakout, last15m.close, breakoutLevel, '15M close did not clear the 20-candle structure'),
    evidence('15M volume expansion', volumeExpansion, Number(volumeRatio(context.candles15m).toFixed(2)), '>= 1.25x', 'Breakout volume is insufficient'),
    evidence('15M body strength', strongBody, Number(bodyRatio(last15m).toFixed(2)), '>= 0.55', 'Breakout candle body is weak'),
    evidence('5M continuation confirmation', fiveMinuteConfirm, fiveMinuteConfirm, true, '5M continuation confirmation missing'),
  ];
  const score =
    64 +
    (trend !== 'SIDEWAYS' ? 8 : 0) +
    (breakout ? 10 : 0) +
    (volumeExpansion ? 8 : 0) +
    (strongBody ? 5 : 0) +
    (fiveMinuteConfirm ? 5 : 0);
  return finalizeStrategy({
    context,
    strategy,
    side,
    rawEntry: entry,
    rawStop: stop,
    rawScore: score,
    evidence: rows,
    eligibility: Boolean(side && breakout && volumeExpansion && strongBody && fiveMinuteConfirm),
    setup15m: breakout ? '20-candle breakout confirmed' : 'No confirmed breakout',
    entry5m: fiveMinuteConfirm ? 'Continuation candle confirmed' : 'Continuation missing',
    confirmations: ['1H trend aligned', '15M structure break', '15M volume expansion', '5M continuation'],
  });
}
