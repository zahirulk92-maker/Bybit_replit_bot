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
} from './common';

export function evaluateLiquidityScalping(context: StrategyContext): StrategyEvaluation {
  const strategy = 'LIQUIDITY_SCALPING' as const;
  if (!hasMinimumData(context)) return insufficientData(strategy);
  const trend = detectTrend(context.candles1h);
  const side = trend === 'UP' ? 'LONG' : trend === 'DOWN' ? 'SHORT' : null;
  const last5m = context.candles5m.at(-1)!;
  const recent5m = context.candles5m.slice(-8);
  const spreadPassed = context.ticker.spreadBps <= 5;
  const imbalancePassed =
    side === 'LONG'
      ? context.orderBook.depthRatio >= 1.15
      : side === 'SHORT'
        ? context.orderBook.depthRatio <= 0.87
        : false;
  const directional = side ? directionalCandle(last5m, side) : false;
  const bookAvailable = context.orderBook.bids.length > 0 && context.orderBook.asks.length > 0;
  const entry =
    side === 'LONG'
      ? context.orderBook.asks[0]?.price ?? context.ticker.ask1Price
      : side === 'SHORT'
        ? context.orderBook.bids[0]?.price ?? context.ticker.bid1Price
        : context.ticker.lastPrice;
  const volatility = atr(context.candles5m);
  const stop =
    side === 'LONG'
      ? lowest(recent5m) - volatility * 0.2
      : side === 'SHORT'
        ? highest(recent5m) + volatility * 0.2
        : null;
  const rows = [
    evidence('1H directional trend', trend !== 'SIDEWAYS', trend, 'UP or DOWN', 'Sideways 1H trend rejected'),
    evidence('Executable order book', bookAvailable, bookAvailable, true, 'Order book is unavailable'),
    evidence('Spread quality', spreadPassed, Number(context.ticker.spreadBps.toFixed(3)), '<= 5 bps', 'Spread too wide for liquidity scalping'),
    evidence('Directional depth imbalance', imbalancePassed, Number(context.orderBook.depthRatio.toFixed(3)), side === 'LONG' ? '>= 1.15' : '<= 0.87', 'Order-book imbalance does not support the trend'),
    evidence('5M directional close', directional, directional, true, '5M entry candle lacks directional confirmation'),
  ];
  const score =
    66 +
    (trend !== 'SIDEWAYS' ? 8 : 0) +
    (bookAvailable ? 5 : 0) +
    (spreadPassed ? 7 : 0) +
    (imbalancePassed ? 10 : 0) +
    (directional ? 6 : 0);
  return finalizeStrategy({
    context,
    strategy,
    side,
    rawEntry: entry,
    rawStop: stop,
    rawScore: score,
    evidence: rows,
    eligibility: Boolean(side && bookAvailable && spreadPassed && imbalancePassed && directional),
    setup15m: `Order-book depth ratio ${context.orderBook.depthRatio.toFixed(2)}`,
    entry5m: directional ? 'Directional close confirmed' : 'Directional close missing',
    confirmations: ['1H trend aligned', 'Top-10 depth evaluated', 'Spread evaluated', '5M close confirmed'],
  });
}
