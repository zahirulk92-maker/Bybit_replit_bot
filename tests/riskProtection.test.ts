import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, validateSpecificQuantity } from '../server/risk/engine';
import { applyEmergencyStop, clearEmergencyStop, currentCircuitBreaker, recordBlockedEntry, block, riskTelemetry } from '../server/risk/protection';
import { resetStateForTests, save, state } from '../server/persistence/store';
import { recoverPersistedState } from '../server/runtime/recovery';
import { acceptCandidates } from '../server/signals/engine';
import { scanner, startScanner } from '../server/scanner/engine';
import { reconcileDemo } from '../server/execution/reconciliation';
import { FakeDemoAdapter, makeQueue, makeSignal, makeValidation, metadata } from './helpers/fixtures';
import { executeDemoQueue } from '../server/execution/demoExecution';

function journal(netPnl: number, index: number) {
  return {
    id: `journal-${index}`, symbol: `J${index}USDT`, netPnl, closedAt: new Date().toISOString(),
    mode: 'LOCAL_PAPER', side: 'LONG', strategy: 'PULLBACK_ENTRY', grade: 'A', score: 86,
    entry: 100, exit: 100, currentPrice: 100, stopLoss: 99, tp1: 102, tp2: 102.5, tp3: 103,
    takeProfit: 102, quantity: 1, initialQuantity: 1, remainingQuantity: 0, targetPolicy: 'FULL_CLOSE_TP1',
    tpStatus: { tp1: 'SKIPPED', tp2: 'SKIPPED', tp3: 'SKIPPED' }, stopStatus: 'ACTIVE', plannedRisk: 1,
    rr: 2, status: 'CLOSED', protectionSource: 'LOCAL_ENGINE', protectionConfirmedAt: new Date().toISOString(),
    openedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), unrealizedPnl: 0,
    signalId: 's', queueId: 'q', executionId: 'e', orderLinkId: 'o', grossPnl: netPnl, fees: 0,
    achievedRR: netPnl, closeReason: 'MANUAL',
  } as any;
}

test.beforeEach(() => { resetStateForTests(); scanner.enabled = false; scanner.running = false; });

test('configured one-percent risk rejects oversized requested quantity', () => {
  const result = validateSpecificQuantity(makeSignal(), 10_000, metadata, 100);
  assert.equal(result.ok, false);
  assert.equal(result.block?.code, 'RISK_LIMIT');
});

test('aggregate open-risk limit blocks additional exposure', () => {
  state.trades.push({ symbol: 'OPENUSDT', plannedRisk: 499 } as any);
  const result = validate(makeSignal(), 10_000, metadata);
  assert.equal(result.ok, false);
  assert.equal(result.block?.code, 'AGGREGATE_RISK_LIMIT');
});

test('duplicate symbol exposure is structured and logged once', () => {
  const signal = makeSignal();
  state.trades.push({ symbol: signal.symbol, plannedRisk: 1 } as any);
  const first = validate(signal, 10_000, metadata);
  const second = validate(signal, 10_000, metadata);
  assert.equal(first.block?.code, 'DUPLICATE_EXPOSURE');
  assert.equal(second.block?.code, 'DUPLICATE_EXPOSURE');
  assert.equal(state.logs.filter((row) => row.event === 'ENTRY_BLOCKED').length, 1);
  assert.equal(state.riskProtection.blockedEntries, 1);
});

test('pause blocks new queues but does not remove active trades', () => {
  state.pauseNewEntries = true;
  state.trades.push({ symbol: 'OPENUSDT', plannedRisk: 10 } as any);
  const accepted = acceptCandidates([makeSignal()]);
  assert.equal(accepted.length, 0);
  assert.equal(state.queue.length, 0);
  assert.equal(state.trades.length, 1);
  assert.equal(currentCircuitBreaker(), 'MANUAL_PAUSE');
});

test('emergency stop cancels only safe pending entries and survives restart recovery', () => {
  const signal = makeSignal();
  const created = makeQueue(signal);
  const submitted = makeQueue({ ...signal, id: 'second' });
  submitted.id = 'submitted'; submitted.state = 'SUBMITTED';
  state.signals.push(signal);
  state.queue.push(created, submitted);
  applyEmergencyStop();
  assert.equal(created.state, 'CANCELLED');
  assert.equal(submitted.state, 'SUBMITTED');
  assert.equal(state.signals.length, 0);
  save();
  recoverPersistedState();
  assert.equal(state.emergencyStop, true);
  assert.equal(scanner.enabled, false);
  clearEmergencyStop();
  assert.equal(state.emergencyStop, false);
  assert.ok(state.logs.some((row) => row.event === 'EMERGENCY_STOP_RESET'));
});

test('emergency stop blocks scanner start and signal acceptance', () => {
  applyEmergencyStop();
  startScanner();
  assert.equal(scanner.enabled, false);
  assert.equal(acceptCandidates([makeSignal()]).length, 0);
});

test('daily loss, daily profit, and consecutive-loss circuit breakers activate', () => {
  state.journal = [journal(-301, 1)];
  assert.equal(currentCircuitBreaker(), 'DAILY_LOSS_LIMIT');
  state.journal = [journal(501, 2)];
  assert.equal(currentCircuitBreaker(), 'DAILY_PROFIT_LIMIT');
  state.journal = [journal(-1, 1), journal(-1, 2), journal(-1, 3)];
  assert.equal(currentCircuitBreaker(), 'CONSECUTIVE_LOSS_LIMIT');
});



test('consecutive-loss breaker resets at the UTC daily boundary', () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  state.journal = [journal(-1, 1), journal(-1, 2), journal(-1, 3)].map((row) => ({
    ...row,
    closedAt: yesterday,
  }));
  assert.equal(currentCircuitBreaker(), null);
  assert.equal(riskTelemetry().consecutiveLosses, 0);
});

test('stale balance is fail-closed and exposes risk telemetry', () => {
  state.riskProtection.balanceUpdatedAt = new Date(Date.now() - 120_000).toISOString();
  assert.equal(currentCircuitBreaker(), 'BALANCE_UNAVAILABLE');
  assert.equal(riskTelemetry().circuitBreakerReason, 'BALANCE_UNAVAILABLE');
});

test('active Demo protection reconciliation continues during emergency stop', async () => {
  const signal = makeSignal(); const validation = makeValidation(); const queue = makeQueue(signal, validation);
  state.signals.push(signal); state.queue.push(queue);
  const adapter = new FakeDemoAdapter();
  const trade = await executeDemoQueue(queue, signal, validation, adapter, { pollAttempts: 2, pollDelayMs: 1 });
  applyEmergencyStop();
  adapter.position!.markPrice = 101;
  await reconcileDemo(adapter);
  assert.equal(state.emergencyStop, true);
  assert.equal(state.trades.find((row) => row.id === trade.id)?.currentPrice, 101);
});

test('blocked entry helper journals identical event once', () => {
  const item = block('EXCHANGE_UNAVAILABLE', 'Exchange unavailable');
  recordBlockedEntry(item, { symbol: 'BTCUSDT', queueId: 'q1' });
  recordBlockedEntry(item, { symbol: 'BTCUSDT', queueId: 'q1' });
  assert.equal(state.logs.filter((row) => row.event === 'ENTRY_BLOCKED').length, 1);
});
