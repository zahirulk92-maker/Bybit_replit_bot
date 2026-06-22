import type { StrategyContext, StrategyEvaluation, StrategyId } from '../types/domain';
import { evaluateEmaRejection } from './emaRejection';
import { evaluateLiquidityScalping } from './liquidityScalping';
import { evaluateLiquiditySweep } from './liquiditySweep';
import { evaluateMomentumBreakout } from './momentumBreakout';
import { evaluatePullbackEntry } from './pullbackEntry';
import { evaluatePurePriceAction } from './purePriceAction';

export const strategyNames: Record<StrategyId, string> = {
  LIQUIDITY_SCALPING: 'Order Book & Liquidity Scalping',
  MOMENTUM_BREAKOUT: 'Momentum Breakout',
  PULLBACK_ENTRY: 'Pullback Entry',
  LIQUIDITY_SWEEP: 'Liquidity Sweep',
  EMA_REJECTION: 'EMA Rejection',
  PURE_PRICE_ACTION: 'Pure Price Action',
};

export function evaluateStrategies(context: StrategyContext): StrategyEvaluation[] {
  return [
    evaluateLiquidityScalping(context),
    evaluateMomentumBreakout(context),
    evaluatePullbackEntry(context),
    evaluateLiquiditySweep(context),
    evaluateEmaRejection(context),
    evaluatePurePriceAction(context),
  ];
}
