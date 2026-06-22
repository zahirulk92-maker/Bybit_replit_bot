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

export function evaluatePullbackEntry(context: StrategyContext): StrategyEvaluation {
  const strategy = 'PULLBACK_ENTRY' as const;
  if (!hasMinimumData(context)) return insufficientData(strategy);
  const trend = detectTrend(context.candles1h);
  const side = trend === 'UP' ? 'LONG' : trend === 'DOWN' ? 'SHORT' : null;
  const last15m = context.candles15m.at(-1)!;
  const last5m = context.candles5m.at(-1)!;
  const ema20 = ema(context.candles15m, 20);
  const ema50 = ema(context.candles15m, 50);
  const volatility = atr(context.candles15m);
  const touchedEma20 =
    side === 'LONG'
      ? last15m.low <= ema20 + volatility * 0.2 && last15m.close >= ema20
      : side === 'SHORT'
        ? last15m.high >= ema20 - volatility * 0.2 && last15m.close <= ema20
        : false;
  const structureHeld =
    side === 'LONG'
      ? last15m.low > ema50 - volatility * 0.25
      : side === 'SHORT'
        ? last15m.high < ema50 + volatility * 0.25
        : false;
  const rejectionClose = side ? directionalCandle(last15m, side) : false;
  const fiveMinuteConfirm = side ? directionalCandle(last5m, side) : false;
  const entry = last5m.close;
  const recent = context.candles15m.slice(-8);
  const stop =
    side === 'LONG'
      ? lowest(recent) - volatility * 0.15
      : side === 'SHORT'
        ? highest(recent) + volatility * 0.15
        : null;
  const rows = [
    evidence('1H directional trend', trend !== 'SIDEWAYS', trend, 'UP or DOWN', 'Sideways 1H trend rejected'),
    evidence('15M EMA20 pullback', touchedEma20, Number(ema20.toFixed(8)), 'Price touches and reclaims EMA20', '15M pullback did not interact with EMA20'),
    evidence('15M EMA50 structure hold', structureHeld, Number(ema50.toFixed(8)), 'No deep trend failure', 'Pullback invalidated the trend structure'),
    evidence('15M rejection close', rejectionClose, rejectionClose, true, '15M rejection candle missing'),
    evidence('5M entry confirmation', fiveMinuteConfirm, fiveMinuteConfirm, true, '5M entry confirmation missing'),
  ];
  const score =
    64 +
    (trend !== 'SIDEWAYS' ? 8 : 0) +
    (touchedEma20 ? 10 : 0) +
    (structureHeld ? 6 : 0) +
    (rejectionClose ? 6 : 0) +
    (fiveMinuteConfirm ? 6 : 0);
  return finalizeStrategy({
    context,
    strategy,
    side,
    rawEntry: entry,
    rawStop: stop,
    rawScore: score,
    evidence: rows,
    eligibility: Boolean(side && touchedEma20 && structureHeld && rejectionClose && fiveMinuteConfirm),
    setup15m: touchedEma20 ? 'EMA20 pullback held' : 'EMA20 pullback absent',
    entry5m: fiveMinuteConfirm ? '5M confirmation present' : '5M confirmation absent',
    confirmations: ['1H trend aligned', '15M EMA20 interaction', 'Trend structure held', '5M confirmation'],
  });
}
