import type { StrategyContext, StrategyEvaluation } from '../types/domain';
import {
  atr,
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

export function evaluateLiquiditySweep(context: StrategyContext): StrategyEvaluation {
  const strategy = 'LIQUIDITY_SWEEP' as const;
  if (!hasMinimumData(context)) return insufficientData(strategy);
  const trend = detectTrend(context.candles1h);
  const side = trend === 'UP' ? 'LONG' : trend === 'DOWN' ? 'SHORT' : null;
  const last15m = context.candles15m.at(-1)!;
  const last5m = context.candles5m.at(-1)!;
  const prior = context.candles15m.slice(-11, -1);
  const priorLow = lowest(prior);
  const priorHigh = highest(prior);
  const sweep =
    side === 'LONG'
      ? last15m.low < priorLow && last15m.close > priorLow
      : side === 'SHORT'
        ? last15m.high > priorHigh && last15m.close < priorHigh
        : false;
  const body = Math.max(Math.abs(last15m.close - last15m.open), Number.EPSILON);
  const rejectionWick =
    side === 'LONG'
      ? Math.min(last15m.open, last15m.close) - last15m.low
      : side === 'SHORT'
        ? last15m.high - Math.max(last15m.open, last15m.close)
        : 0;
  const wickPassed = rejectionWick / body >= 1.2;
  const volumePassed = volumeRatio(context.candles15m) >= 1.05;
  const fiveMinuteConfirm = side ? directionalCandle(last5m, side) : false;
  const volatility = atr(context.candles15m);
  const entry = last5m.close;
  const stop =
    side === 'LONG'
      ? last15m.low - volatility * 0.1
      : side === 'SHORT'
        ? last15m.high + volatility * 0.1
        : null;
  const rows = [
    evidence('1H directional trend', trend !== 'SIDEWAYS', trend, 'UP or DOWN', 'Sideways 1H trend rejected'),
    evidence('15M liquidity sweep and reclaim', sweep, side === 'LONG' ? last15m.low : last15m.high, side === 'LONG' ? priorLow : priorHigh, 'Prior liquidity was not swept and reclaimed'),
    evidence('Rejection wick strength', wickPassed, Number((rejectionWick / body).toFixed(2)), '>= 1.2x body', 'Sweep rejection wick is weak'),
    evidence('Sweep volume participation', volumePassed, Number(volumeRatio(context.candles15m).toFixed(2)), '>= 1.05x', 'Sweep lacks volume participation'),
    evidence('5M reversal confirmation', fiveMinuteConfirm, fiveMinuteConfirm, true, '5M reversal confirmation missing'),
  ];
  const score =
    64 +
    (trend !== 'SIDEWAYS' ? 8 : 0) +
    (sweep ? 11 : 0) +
    (wickPassed ? 7 : 0) +
    (volumePassed ? 4 : 0) +
    (fiveMinuteConfirm ? 6 : 0);
  return finalizeStrategy({
    context,
    strategy,
    side,
    rawEntry: entry,
    rawStop: stop,
    rawScore: score,
    evidence: rows,
    eligibility: Boolean(side && sweep && wickPassed && volumePassed && fiveMinuteConfirm),
    setup15m: sweep ? 'Liquidity sweep reclaimed' : 'No valid sweep reclaim',
    entry5m: fiveMinuteConfirm ? 'Reversal confirmed' : 'Reversal confirmation absent',
    confirmations: ['1H trend aligned', '15M liquidity sweep', 'Rejection wick', '5M reversal'],
  });
}
