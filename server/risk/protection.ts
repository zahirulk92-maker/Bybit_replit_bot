import { env } from '../config/env';
import { log, save, state } from '../persistence/store';
import type { CircuitBreakerReason, RiskBlock, RiskTelemetry } from '../types/domain';

function utcDay(value = new Date()): string {
  return value.toISOString().slice(0, 10);
}

function dailyJournal() {
  const day = utcDay();
  return state.journal.filter((row) => row.closedAt.slice(0, 10) === day);
}

function consecutiveLosses(): number {
  const rows = dailyJournal().slice().sort((a, b) => b.closedAt.localeCompare(a.closedAt));
  let count = 0;
  for (const row of rows) {
    if (row.netPnl < 0) count += 1;
    else break;
  }
  return count;
}

export function refreshDailyBoundary(): void {
  const today = utcDay();
  if (state.riskProtection.day === today) return;
  state.riskProtection.day = today;
  state.riskProtection.dailyBoundaryResetAt = new Date().toISOString();
  state.riskProtection.blockLogKeys = [];
  save();
  log('DAILY_RISK_RESET', 'Daily circuit-breaker counters reset at UTC boundary', { day: today });
}

export function updateBalanceSnapshot(balance: number): void {
  state.riskProtection.availableBalance = Number.isFinite(balance) && balance > 0 ? balance : null;
  state.riskProtection.balanceUpdatedAt = new Date().toISOString();
  save();
}

export function currentCircuitBreaker(): CircuitBreakerReason | null {
  refreshDailyBoundary();
  if (state.emergencyStop) return 'EMERGENCY_STOP';
  if (state.pauseNewEntries) return 'MANUAL_PAUSE';
  const rows = dailyJournal();
  const dailyRealizedPnl = rows.reduce((sum, row) => sum + row.netPnl, 0);
  if (dailyRealizedPnl <= -env.maxDailyRealizedLoss) return 'DAILY_LOSS_LIMIT';
  if (dailyRealizedPnl >= env.maxDailyRealizedProfit) return 'DAILY_PROFIT_LIMIT';
  if (consecutiveLosses() >= env.maxConsecutiveLosses) return 'CONSECUTIVE_LOSS_LIMIT';
  const balance = state.riskProtection.availableBalance;
  const updated = state.riskProtection.balanceUpdatedAt
    ? Date.now() - new Date(state.riskProtection.balanceUpdatedAt).getTime()
    : Number.POSITIVE_INFINITY;
  if (!balance || balance <= 0 || updated > env.balanceStaleMs) return 'BALANCE_UNAVAILABLE';
  if (Object.values(state.symbolBlocks).some((reason) => /protection/i.test(reason))) return 'PROTECTION_FAILURE';
  return null;
}

export function riskTelemetry(plannedRisk = 0): RiskTelemetry {
  refreshDailyBoundary();
  const rows = dailyJournal();
  return {
    activeRisk: Number(state.trades.reduce((sum, trade) => sum + Math.max(0, trade.plannedRisk), 0).toFixed(8)),
    availableBalance: state.riskProtection.availableBalance,
    plannedRisk: Number(plannedRisk.toFixed(8)),
    dailyRealizedPnl: Number(rows.reduce((sum, row) => sum + row.netPnl, 0).toFixed(8)),
    consecutiveLosses: consecutiveLosses(),
    blockedEntries: state.riskProtection.blockedEntries,
    pauseState: state.pauseNewEntries,
    emergencyStopState: state.emergencyStop,
    circuitBreakerReason: currentCircuitBreaker(),
    balanceUpdatedAt: state.riskProtection.balanceUpdatedAt,
  };
}

export function recordBlockedEntry(block: RiskBlock, context: Record<string, unknown> = {}): RiskBlock {
  const key = `${block.code}:${String(context.symbol ?? '')}:${String(context.queueId ?? '')}`;
  if (!state.riskProtection.blockLogKeys.includes(key)) {
    state.riskProtection.blockLogKeys.push(key);
    state.riskProtection.blockLogKeys = state.riskProtection.blockLogKeys.slice(-2_000);
    state.riskProtection.blockedEntries += 1;
    save();
    log('ENTRY_BLOCKED', block.message, { code: block.code, ...context }, 'WARNING');
  }
  return block;
}

export function block(code: CircuitBreakerReason | 'RISK_LIMIT' | 'AGGREGATE_RISK_LIMIT' | 'DUPLICATE_EXPOSURE' | 'ORDER_LIMIT' | 'RR_LIMIT', message: string): RiskBlock {
  return { code, message };
}

export function applyEmergencyStop(reason = 'Manual emergency stop activated'): void {
  state.emergencyStop = true;
  state.pauseNewEntries = true;
  state.riskProtection.emergencyActivatedAt ||= new Date().toISOString();
  state.riskProtection.emergencyReason = reason;
  const now = new Date().toISOString();
  for (const queue of state.queue) {
    if (['CREATED', 'REJECTED', 'CANCELLED', 'ERROR', 'CLOSED'].includes(queue.state)) {
      if (queue.state === 'CREATED') {
        queue.state = 'CANCELLED';
        queue.reason = 'Cancelled by emergency stop before submission';
        queue.updatedAt = now;
      }
    }
  }
  state.signals = [];
  save();
  log('EMERGENCY_STOP_ACTIVATED', reason, { cancelledPendingEntries: true }, 'ERROR');
}

export function clearEmergencyStop(): void {
  state.emergencyStop = false;
  state.pauseNewEntries = false;
  state.riskProtection.emergencyActivatedAt = null;
  state.riskProtection.emergencyReason = null;
  save();
  log('EMERGENCY_STOP_RESET', 'Emergency stop explicitly reset by operator');
}
