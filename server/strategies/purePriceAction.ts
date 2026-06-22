import type { Candle, StrategyContext, StrategyEvaluation } from '../types/domain';
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
} from './common';

function bullishEngulfing(previous: Candle, current: Candle): boolean {
  return previous.close < previous.open && current.close > current.open && current.open <= previous.close && current.close >= previous.open;
}

function bearishEngulfing(previous: Candle, current: Candle): boolean {
  return previous.close > previous.open && current.close < current.open && current.open >= previous.close && current.close <= previous.open;
}

export function evaluatePurePriceAction(context: StrategyContext): StrategyEvaluation {
  const strategy = 'PURE_PRICE_ACTION' as const;
  if (!hasMinimumData(context)) return insufficientData(strategy);
  const trend = detectTrend(context.candles1h);
  const side = trend === 'UP' ? 'LONG' : trend === 'DOWN' ? 'SHORT' : null;
  const previous15m = context.candles15m.at(-2)!;
  const last15m = context.candles15m.at(-1)!;
  const last5m = context.candles5m.at(-1)!;
  const structure = context.candles15m.slice(-12, -2);
  const support = lowest(structure);
  const resistance = highest(structure);
  const range = Math.max(last15m.high - last15m.low, Number.EPSILON);
  const lowerWick = Math.min(last15m.open, last15m.close) - last15m.low;
  const upperWick = last15m.high - Math.max(last15m.open, last15m.close);
  const pinBar =
    side === 'LONG'
      ? lowerWick / range >= 0.5 && last15m.close > last15m.open
      : side === 'SHORT'
        ? upperWick / range >= 0.5 && last15m.close < last15m.open
        : false;
  const engulfing =
    side === 'LONG'
      ? bullishEngulfing(previous15m, last15m)
      : side === 'SHORT'
        ? bearishEngulfing(previous15m, last15m)
        : false;
  const pattern = pinBar || engulfing;
  const structureProximity =
    side === 'LONG'
      ? last15m.low <= support * 1.003
      : side === 'SHORT'
        ? last15m.high >= resistance * 0.997
        : false;
  const fiveMinuteConfirm = side ? directionalCandle(last5m, side) : false;
  const volatility = atr(context.candles15m);
  const entry = last5m.close;
  const stop =
    side === 'LONG'
      ? last15m.low - volatility * 0.12
      : side === 'SHORT'
        ? last15m.high + volatility * 0.12
        : null;
  const rows = [
    evidence('1H directional trend', trend !== 'SIDEWAYS', trend, 'UP or DOWN', 'Sideways 1H trend rejected'),
    evidence('15M price-action pattern', pattern, engulfing ? 'ENGULFING' : pinBar ? 'PIN_BAR' : 'NONE', 'Engulfing or pin bar', 'No qualified 15M price-action pattern'),
    evidence('Pattern at recent structure', structureProximity, side === 'LONG' ? last15m.low : last15m.high, side === 'LONG' ? support : resistance, 'Pattern is not located at recent support/resistance'),
    evidence('5M confirmation', fiveMinuteConfirm, fiveMinuteConfirm, true, '5M confirmation missing'),
    evidence('Spread acceptable', context.ticker.spreadBps <= 8, Number(context.ticker.spreadBps.toFixed(3)), '<= 8 bps', 'Spread too wide for price-action entry'),
  ];
  const score =
    65 +
    (trend !== 'SIDEWAYS' ? 8 : 0) +
    (pattern ? 10 : 0) +
    (structureProximity ? 7 : 0) +
    (fiveMinuteConfirm ? 6 : 0) +
    (context.ticker.spreadBps <= 8 ? 4 : 0);
  return finalizeStrategy({
    context,
    strategy,
    side,
    rawEntry: entry,
    rawStop: stop,
    rawScore: score,
    evidence: rows,
    eligibility: Boolean(side && pattern && structureProximity && fiveMinuteConfirm && context.ticker.spreadBps <= 8),
    setup15m: pattern ? (engulfing ? 'Engulfing pattern' : 'Pin-bar rejection') : 'No qualified pattern',
    entry5m: fiveMinuteConfirm ? '5M confirmation present' : '5M confirmation absent',
    confirmations: ['1H trend aligned', '15M price-action pattern', 'Structure location', '5M confirmation'],
  });
}
