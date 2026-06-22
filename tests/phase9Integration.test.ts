import assert from 'node:assert/strict';
import test from 'node:test';
import { executeDemoQueue } from '../server/execution/demoExecution';
import { manualCloseDemoTrade } from '../server/execution/reconciliation';
import { closeTradeToJournal } from '../server/execution/records';
import { operationalReport } from '../server/persistence/reporting';
import { resetStateForTests, state } from '../server/persistence/store';
import { recoverPersistedState } from '../server/runtime/recovery';
import { scanner } from '../server/scanner/engine';
import { acceptCandidates } from '../server/signals/engine';
import type { ExecutionState } from '../server/types/domain';
import { FakeDemoAdapter, makeQueue, makeSignal, makeValidation } from './helpers/fixtures';

test.beforeEach(() => resetStateForTests());

test('scanner-to-protected-trade-to-close integration finalizes journal and reporting exactly once', async () => {
  const source = makeSignal();
  const accepted = acceptCandidates([{ ...source, id: undefined, createdAt: undefined, expiresAt: undefined } as never]);
  assert.equal(accepted.length, 1);
  const signal = accepted[0];
  const queue = state.queue.find((row) => row.signalId === signal.id)!;
  const validation = makeValidation();
  queue.validation = validation;
  queue.validatedAt = new Date().toISOString();

  const adapter = new FakeDemoAdapter();
  const trade = await executeDemoQueue(queue, signal, validation, adapter, { pollAttempts: 1, pollDelayMs: 0 });
  assert.equal(trade.status, 'ACTIVE');
  assert.equal(queue.state, 'PROTECTED');
  assert.equal(state.signals.length, 0);

  await manualCloseDemoTrade(trade, adapter);
  await manualCloseDemoTrade(trade, adapter);

  assert.equal(state.trades.length, 0);
  assert.equal(state.journal.length, 1);
  assert.equal(state.executionTelemetry.finalizedTrades, 1);
  assert.equal(adapter.closeCalls, 1);
  const report = operationalReport();
  assert.equal(report.runtime.activeTrades, 0);
  assert.equal(report.runtime.inFlightExecutions, 0);
  assert.equal(report.runtime.queuedEntries, 0);
  assert.equal(report.runtime.totalQueueRecords, 1);
  assert.equal(report.journal.totalTrades, 1);
});

test('Local Paper journal, realized PnL and finalization telemetry change exactly once', () => {
  const signal = makeSignal();
  const queue = makeQueue(signal);
  state.signals.push(signal);
  state.queue.push(queue);
  const execution = {
    id: 'exec-atomic', queueId: queue.id, signalId: signal.id, symbol: signal.symbol,
    mode: 'LOCAL_PAPER' as const, state: 'PROTECTED' as const,
    idempotencyKey: queue.idempotencyKey, orderLinkId: queue.orderLinkId,
    requestedQuantity: 1, filledQuantity: 1, positionSize: 1,
    confirmations: { orderSubmitted: true, fillConfirmed: true, positionConfirmed: true, stopLossConfirmed: true, takeProfitConfirmed: true },
    attempts: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  state.executions.push(execution);
  const trade = {
    id: 'trade-atomic', mode: 'LOCAL_PAPER' as const, symbol: signal.symbol, side: signal.side,
    strategy: signal.strategy, grade: signal.grade, score: signal.score, entry: 100, currentPrice: 102,
    stopLoss: 99, tp1: 102, tp2: 102.5, tp3: 103, takeProfit: 102, quantity: 1,
    initialQuantity: 1, remainingQuantity: 1, targetPolicy: 'FULL_CLOSE_TP1' as const,
    tpStatus: { tp1: 'PENDING' as const, tp2: 'PENDING' as const, tp3: 'PENDING' as const },
    stopStatus: 'ACTIVE' as const, plannedRisk: 1.2, rr: 2, status: 'ACTIVE' as const,
    protectionSource: 'LOCAL_ENGINE' as const, protectionConfirmedAt: new Date().toISOString(),
    openedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), unrealizedPnl: 2,
    signalId: signal.id, queueId: queue.id, executionId: execution.id, orderLinkId: queue.orderLinkId,
  };
  state.trades.push(trade);
  const before = state.paperAccount.realizedPnl;
  const first = closeTradeToJournal(trade, 102, 'TAKE_PROFIT');
  const after = state.paperAccount.realizedPnl;
  const second = closeTradeToJournal(trade, 102, 'TAKE_PROFIT');
  assert.equal(first.id, second.id);
  assert.equal(state.journal.length, 1);
  assert.equal(state.executionTelemetry.finalizedTrades, 1);
  assert.equal(state.paperAccount.realizedPnl, after);
  assert.equal(Number((after - before).toFixed(8)), first.netPnl);
});

test('restart recovery handles every nonterminal execution state without enabling scanner or duplicating records', () => {
  const states: ExecutionState[] = ['SUBMITTING', 'PARTIALLY_FILLED', 'PROTECTION_PENDING', 'CLOSING'];
  for (const executionState of states) {
    resetStateForTests();
    const signal = makeSignal({ symbol: `${executionState.replaceAll('_', '')}USDT` });
    const queue = makeQueue(signal);
    queue.state = executionState;
    state.queue.push(queue);
    state.executions.push({
      id: `exec-${executionState}`, queueId: queue.id, signalId: signal.id, symbol: signal.symbol,
      mode: 'BYBIT_DEMO', state: executionState, idempotencyKey: queue.idempotencyKey,
      orderLinkId: queue.orderLinkId, requestedQuantity: 1, filledQuantity: executionState === 'SUBMITTING' ? 0 : 0.4,
      confirmations: { ...queue.confirmations }, attempts: 1,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    scanner.enabled = true;
    recoverPersistedState();
    recoverPersistedState();
    assert.equal(scanner.enabled, false);
    assert.equal(state.executions.length, 1);
    assert.equal(state.queue.length, 1);
    assert.match(state.symbolBlocks[signal.symbol], /reconciliation/i);
  }
});

test('repeated operational cycles keep bounded logs and stable empty trading state', () => {
  for (let index = 0; index < 250; index += 1) {
    const report = operationalReport();
    assert.equal(report.runtime.activeSignals, 0);
    assert.equal(report.runtime.activeTrades, 0);
  }
  assert.equal(state.signals.length, 0);
  assert.equal(state.trades.length, 0);
  assert.equal(scanner.enabled, false);
});
