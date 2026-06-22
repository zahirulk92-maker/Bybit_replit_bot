import { env } from '../config/env';
import { isMinimumOrderValid, minimumExecutableQuantity, roundPrice, roundQuantity } from '../market/precision';
import { state } from '../persistence/store';
import { block, currentCircuitBreaker, recordBlockedEntry, riskTelemetry } from './protection';
import type { InstrumentMetadata, RiskBlock, RiskValidation, Signal } from '../types/domain';

function reject(signal: Signal, item: RiskBlock): RiskValidation {
  recordBlockedEntry(item, { symbol: signal.symbol, signalId: signal.id });
  return { ok: false, reason: item.message, block: item };
}

function preflight(signal: Signal, capital: number): RiskValidation | null {
  const breaker = currentCircuitBreaker();
  if (breaker) return reject(signal, block(breaker, `Entry blocked by circuit breaker: ${breaker}`));
  if (state.trades.length >= 10) return reject(signal, block('ORDER_LIMIT', 'Maximum 10 active trades reached'));
  if (state.trades.some((trade) => trade.symbol === signal.symbol)) {
    return reject(signal, block('DUPLICATE_EXPOSURE', 'Duplicate symbol exposure'));
  }
  if (state.queue.some((item) => item.symbol === signal.symbol && item.signalId !== signal.id && !['REJECTED', 'CANCELLED', 'ERROR', 'CLOSED'].includes(item.state))) {
    return reject(signal, block('DUPLICATE_EXPOSURE', 'Duplicate symbol execution already pending'));
  }
  if (state.symbolBlocks[signal.symbol]) {
    return reject(signal, block('PROTECTION_FAILURE', `Symbol blocked: ${state.symbolBlocks[signal.symbol]}`));
  }
  if (signal.rr < 2) return reject(signal, block('RR_LIMIT', 'RR below 1:2'));
  if (!Number.isFinite(capital) || capital <= 0) {
    return reject(signal, block('BALANCE_UNAVAILABLE', 'Available balance is invalid or unavailable'));
  }
  return null;
}

function roundedLevels(signal: Signal, metadata: InstrumentMetadata) {
  const roundedEntry = roundPrice(metadata, signal.entry, 'NEAREST');
  const roundedStopLoss = roundPrice(metadata, signal.stopLoss, signal.side === 'LONG' ? 'DOWN' : 'UP');
  const roundedTp1 = roundPrice(metadata, signal.tp1, signal.side === 'LONG' ? 'UP' : 'DOWN');
  const roundedTp2 = roundPrice(metadata, signal.tp2, signal.side === 'LONG' ? 'UP' : 'DOWN');
  const roundedTp3 = roundPrice(metadata, signal.tp3, signal.side === 'LONG' ? 'UP' : 'DOWN');
  return { roundedEntry, roundedStopLoss, roundedTp1, roundedTp2, roundedTp3 };
}

export function validateSpecificQuantity(signal: Signal, capital: number, metadata: InstrumentMetadata, requestedQuantity: number): RiskValidation {
  const rejected = preflight(signal, capital);
  if (rejected) return rejected;
  const levels = roundedLevels(signal, metadata);
  const stopDistance = Math.abs(levels.roundedEntry - levels.roundedStopLoss);
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) return { ok: false, reason: 'Invalid stop distance after price rounding', ...levels };
  const roundedRr = Math.abs(levels.roundedTp1 - levels.roundedEntry) / stopDistance;
  if (roundedRr < 2) return reject(signal, block('RR_LIMIT', 'RR below 1:2 after price rounding'));
  const quantity = roundQuantity(metadata, requestedQuantity);
  if (quantity <= 0) return { ok: false, reason: 'Quantity below instrument precision', ...levels };
  const minimumCheck = isMinimumOrderValid(metadata, quantity, levels.roundedEntry);
  if (!minimumCheck.ok) return { ok: false, reason: minimumCheck.reason, quantity, notional: minimumCheck.notional, riskBudget: capital * env.maxRiskPerTradePct / 100, ...levels };
  if (metadata.maximumQuantity && quantity > metadata.maximumQuantity) return { ok: false, reason: `Quantity exceeds maximum market quantity ${metadata.maximumQuantity}`, ...levels };
  if (minimumCheck.notional > capital) return reject(signal, block('BALANCE_UNAVAILABLE', 'Order notional exceeds available balance'));
  const riskBudget = capital * env.maxRiskPerTradePct / 100;
  const feesEstimate = levels.roundedEntry * quantity * env.feeRate * 2;
  const slippageEstimate = levels.roundedEntry * quantity * env.slippageRate;
  const plannedRisk = quantity * stopDistance + feesEstimate + slippageEstimate;
  if (plannedRisk > riskBudget + metadata.tickSize * metadata.quantityStep) {
    return { ok: false, reason: 'Requested quantity exceeds the configured per-trade risk budget', block: recordBlockedEntry(block('RISK_LIMIT', 'Requested quantity exceeds the configured per-trade risk budget'), { symbol: signal.symbol, signalId: signal.id }), quantity, plannedRisk, riskBudget, feesEstimate, slippageEstimate, notional: minimumCheck.notional, ...levels };
  }
  const activeRisk = riskTelemetry(plannedRisk).activeRisk;
  const aggregateLimit = capital * env.maxAggregateOpenRiskPct / 100;
  if (activeRisk + plannedRisk > aggregateLimit) {
    return { ok: false, reason: 'Aggregate open-risk limit exceeded', block: recordBlockedEntry(block('AGGREGATE_RISK_LIMIT', 'Aggregate open-risk limit exceeded'), { symbol: signal.symbol, signalId: signal.id }), quantity, plannedRisk, riskBudget, ...levels };
  }
  return { ok: true, quantity, plannedRisk: Number(plannedRisk.toFixed(8)), riskBudget: Number(riskBudget.toFixed(8)), feesEstimate: Number(feesEstimate.toFixed(8)), slippageEstimate: Number(slippageEstimate.toFixed(8)), notional: Number(minimumCheck.notional.toFixed(8)), ...levels };
}

export function minimumAcceptanceValidation(signal: Signal, capital: number, metadata: InstrumentMetadata): RiskValidation {
  const levels = roundedLevels(signal, metadata);
  const quantity = minimumExecutableQuantity(metadata, levels.roundedEntry);
  if (quantity <= 0) return { ok: false, reason: 'No valid minimum quantity is available for the instrument', ...levels };
  return validateSpecificQuantity(signal, capital, metadata, quantity);
}

export function validate(signal: Signal, capital: number, metadata: InstrumentMetadata = signal.instrument): RiskValidation {
  const rejected = preflight(signal, capital);
  if (rejected) return rejected;
  const levels = roundedLevels(signal, metadata);
  const stopDistance = Math.abs(levels.roundedEntry - levels.roundedStopLoss);
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) return { ok: false, reason: 'Invalid stop distance after price rounding', ...levels };
  const roundedRr = Math.abs(levels.roundedTp1 - levels.roundedEntry) / stopDistance;
  if (roundedRr < 2) return reject(signal, block('RR_LIMIT', 'RR below 1:2 after price rounding'));
  const riskBudget = capital * env.maxRiskPerTradePct / 100;
  const costPerUnit = stopDistance + levels.roundedEntry * (env.feeRate * 2 + env.slippageRate);
  return validateSpecificQuantity(signal, capital, metadata, riskBudget / costPerUnit);
}
