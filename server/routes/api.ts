import { Router } from 'express';
import { env, validateMode } from '../config/env';
import { createDemoClient, demoStatus } from '../execution/bybitDemo';
import {
  demoAcceptanceReadiness,
  runDemoAcceptance,
} from '../execution/demoAcceptance';
import { executeDemoQueue } from '../execution/demoExecution';
import { executePaper } from '../execution/paper';
import { closeTradeToJournal } from '../execution/records';
import { manualCloseDemoTrade, reconcileDemo } from '../execution/reconciliation';
import { revalidateSignalMarket } from '../execution/validation';
import { incrementExecutionTelemetry, log, safeErrorMessage, save, state } from '../persistence/store';
import { validate } from '../risk/engine';
import { applyEmergencyStop, clearEmergencyStop, riskTelemetry, updateBalanceSnapshot } from '../risk/protection';
import { runScan, scanner, startScanner, stopScanner } from '../scanner/engine';
import { strategyNames } from '../strategies/engine';
import { reconciliationStatus } from '../execution/reconciliation';
import { runtimeWorkerStatus } from '../runtime/workers';
import { journalCsv, logsCsv, logsJson, operationalReport } from '../persistence/reporting';
import { persistenceStatus } from '../persistence/store';

export const api = Router();
const ok = (response: any, data: any) => response.json({ success: true, data });

api.get('/health', (_, response) =>
  ok(response, {
    status: 'healthy',
    scannerDefaultOff: true,
    executionMode: env.mode,
    modeValidation: validateMode(),
    time: new Date().toISOString(),
  }),
);

api.get('/status', (_, response) =>
  ok(response, {
    executionMode: env.mode,
    modeValidation: validateMode(),
    demoCredentialsConfigured: demoStatus().configured,
    demoLiveVerification: demoStatus().liveVerification,
    scanner,
    activeSignals: state.signals.length,
    activeTrades: state.trades.length,
    inFlightExecutions: state.executions.filter((row) =>
      ['SUBMITTING', 'SUBMITTED', 'PARTIALLY_FILLED', 'FILLED', 'PROTECTION_PENDING', 'ERROR', 'CLOSING'].includes(row.state),
    ).length,
    pauseNewEntries: state.pauseNewEntries,
    emergencyStop: state.emergencyStop,
    symbolBlocks: state.symbolBlocks,
    lastReconciliationAt: state.lastReconciliationAt,
    lastReconciliationError: state.lastReconciliationError,
    reconciliation: reconciliationStatus(),
    workers: runtimeWorkerStatus(),
    executionTelemetry: state.executionTelemetry,
    demoAcceptance: demoAcceptanceReadiness(),
    risk: riskTelemetry(),
    recovery: state.recoveryStatus,
    persistence: persistenceStatus,
  }),
);

api.get('/scanner/status', (_, response) => ok(response, scanner));
api.post('/scanner/start', (_, response) => ok(response, startScanner()));
api.post('/scanner/stop', (_, response) => ok(response, stopScanner()));
api.post('/scanner/run', async (_, response) => {
  try {
    ok(response, await runScan());
  } catch (error) {
    response.status(502).json({ success: false, error: safeErrorMessage(error) });
  }
});

api.get('/signals', (_, response) => ok(response, state.signals));
api.get('/entries', (_, response) => ok(response, state.queue));

api.post('/entries/:id/validate', async (request, response) => {
  try {
    const queue = state.queue.find((row) => row.id === request.params.id);
    const signal = queue && state.signals.find((row) => row.id === queue.signalId);
    if (!queue || !signal) return response.status(404).json({ success: false, error: 'Queue item or signal not found' });
    if (['PROTECTED', 'REJECTED', 'CANCELLED', 'CLOSING', 'CLOSED'].includes(queue.state)) {
      return response.status(409).json({ success: false, error: `Queue is already ${queue.state}` });
    }
    const capital =
      env.mode === 'BYBIT_DEMO' && demoStatus().configured
        ? await createDemoClient().getAvailableBalance()
        : state.paperAccount.availableBalance;
    updateBalanceSnapshot(capital);
    const validation = validate(signal, capital, signal.instrument);
    queue.validation = validation;
    queue.validatedAt = validation.ok ? new Date().toISOString() : undefined;
    queue.reason = validation.ok ? undefined : validation.reason;
    queue.updatedAt = new Date().toISOString();
    save();
    log('ENTRY_VALIDATION', validation.ok ? 'Entry validation passed' : 'Entry validation rejected', {
      symbol: signal.symbol,
      queueId: queue.id,
      reason: validation.reason,
    }, validation.ok ? 'INFO' : 'WARNING');
    ok(response, { queue, validation });
  } catch (error) {
    response.status(409).json({ success: false, error: safeErrorMessage(error) });
  }
});

api.post('/entries/:id/execute', async (request, response) => {
  try {
    const queue = state.queue.find((row) => row.id === request.params.id);
    const signal = queue && state.signals.find((row) => row.id === queue.signalId);
    if (!queue || !signal) throw new Error('Queue item or signal not found');
    const existing = state.trades.find((row) => row.queueId === queue.id || row.orderLinkId === queue.orderLinkId);
    if (existing) return ok(response, existing);
    const modeValidation = validateMode();
    if (!modeValidation.valid) throw new Error(`Execution blocked: ${modeValidation.reason}`);
    if (env.mode === 'DISABLED') throw new Error('Execution mode is DISABLED');
    if (!queue.validation?.ok || !queue.validatedAt) throw new Error('Queue item must pass validation first');

    const marketValidation = await revalidateSignalMarket(signal);
    if (!marketValidation.ok) {
      queue.reason = marketValidation.reason;
      queue.updatedAt = new Date().toISOString();
      save();
      throw new Error(marketValidation.reason);
    }

    const capital =
      env.mode === 'BYBIT_DEMO'
        ? await createDemoClient().getAvailableBalance()
        : state.paperAccount.availableBalance;
    updateBalanceSnapshot(capital);
    const freshRisk = validate(signal, capital, signal.instrument);
    if (!freshRisk.ok) throw new Error(freshRisk.reason || 'Fresh risk validation failed');
    queue.validation = freshRisk;
    save();

    if (env.mode === 'LOCAL_PAPER') {
      return ok(response, executePaper(queue, signal, freshRisk));
    }
    if (env.mode === 'BYBIT_DEMO') {
      if (!demoStatus().configured) throw new Error('Bybit Demo credentials are not configured');
      return ok(response, await executeDemoQueue(queue, signal, freshRisk, createDemoClient()));
    }
    throw new Error('Unsupported execution mode');
  } catch (error) {
    response.status(409).json({ success: false, error: safeErrorMessage(error) });
  }
});

api.post('/reconciliation/run', async (_, response) => {
  try {
    if (env.mode !== 'BYBIT_DEMO') throw new Error('Reconciliation endpoint requires BYBIT_DEMO mode');
    if (!demoStatus().configured) throw new Error('Bybit Demo credentials are not configured');
    await reconcileDemo(createDemoClient());
    ok(response, { lastReconciliationAt: state.lastReconciliationAt });
  } catch (error) {
    response.status(409).json({ success: false, error: safeErrorMessage(error) });
  }
});

api.get('/trades/active', (_, response) => ok(response, state.trades));
api.post('/trades/:id/close', async (request, response) => {
  try {
    const trade = state.trades.find((row) => row.id === request.params.id);
    if (!trade) return response.status(404).json({ success: false, error: 'Trade not found' });
    if (trade.mode === 'BYBIT_DEMO') {
      if (!demoStatus().configured) throw new Error('Bybit Demo credentials are not configured');
      await manualCloseDemoTrade(trade, createDemoClient());
    } else {
      incrementExecutionTelemetry('closeAttempts');
      closeTradeToJournal(trade, trade.currentPrice, 'MANUAL_CLOSE');
      log('PAPER_MANUAL_CLOSE', 'Local Paper trade fully closed', { tradeId: trade.id, symbol: trade.symbol });
    }
    ok(response, trade);
  } catch (error) {
    response.status(409).json({ success: false, error: safeErrorMessage(error) });
  }
});

api.get('/journal', (_, response) => ok(response, state.journal));
api.get('/logs', (_, response) => ok(response, state.logs));

api.get('/reporting/operational', (_, response) => ok(response, operationalReport()));
api.get('/exports/journal.csv', (_, response) => {
  response.type('text/csv').setHeader('Content-Disposition', 'attachment; filename="journal.csv"');
  response.send(journalCsv());
});
api.get('/exports/logs.csv', (_, response) => {
  response.type('text/csv').setHeader('Content-Disposition', 'attachment; filename="logs.csv"');
  response.send(logsCsv());
});
api.get('/exports/logs.json', (_, response) => {
  response.type('application/json').setHeader('Content-Disposition', 'attachment; filename="logs.json"');
  response.send(logsJson());
});


api.get('/strategies/performance', (request, response) => {
  const mode = String(request.query.mode || 'ALL');
  const rows = Object.entries(strategyNames).map(([id, name]) => {
    const trades = state.journal.filter(
      (trade) => trade.strategy === id && (mode === 'ALL' || trade.mode === mode),
    );
    const wins = trades.filter((trade) => trade.netPnl > 0);
    const losses = trades.filter((trade) => trade.netPnl < 0);
    const grossProfit = wins.reduce((sum, trade) => sum + trade.netPnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.netPnl, 0));
    const recent = trades.slice().sort((a, b) => b.closedAt.localeCompare(a.closedAt));
    let streak = 'N/A';
    if (recent.length) {
      const winning = recent[0].netPnl > 0;
      const count = recent.findIndex((trade) => (trade.netPnl > 0) !== winning);
      streak = `${count < 0 ? recent.length : count} ${winning ? 'WIN' : 'LOSS'}`;
    }
    return {
      id,
      name,
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      breakEven: trades.length - wins.length - losses.length,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      netPnl: trades.reduce((sum, trade) => sum + trade.netPnl, 0),
      averageRR: trades.length ? trades.reduce((sum, trade) => sum + trade.achievedRR, 0) / trades.length : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      aPlusTrades: trades.filter((trade) => trade.grade === 'A+').length,
      aTrades: trades.filter((trade) => trade.grade === 'A').length,
      currentStreak: streak,
      lastTrade: recent[0]?.closedAt || null,
      status: trades.length < 3 ? 'Insufficient Data' : 'Available',
    };
  });
  ok(response, rows);
});

api.post('/safety/:action', (request, response) => {
  const action = request.params.action;
  if (action === 'pause') {
    state.pauseNewEntries = true;
    save();
    log('NEW_ENTRIES_PAUSED', 'New entries explicitly paused by operator');
  } else if (action === 'resume') {
    if (state.emergencyStop) return response.status(409).json({ success: false, error: 'Emergency stop requires explicit emergency-clear' });
    state.pauseNewEntries = false;
    save();
    log('NEW_ENTRIES_RESUMED', 'New entries explicitly resumed by operator');
  } else if (action === 'emergency-stop') {
    stopScanner();
    applyEmergencyStop();
  } else if (action === 'emergency-clear') {
    clearEmergencyStop();
  } else {
    return response.status(400).json({ success: false, error: 'Unknown safety action' });
  }
  ok(response, {
    pauseNewEntries: state.pauseNewEntries,
    emergencyStop: state.emergencyStop,
    risk: riskTelemetry(),
  });
});

api.get('/bybit-demo/status', (_, response) => ok(response, demoStatus()));
api.get('/mode-validation', (_, response) => ok(response, validateMode()));

api.post('/bybit-demo/readiness/verify', async (_, response) => {
  try {
    ok(response, await createDemoClient().checkCredentialReadiness());
  } catch (error) {
    response.status(409).json({ success: false, error: safeErrorMessage(error) });
  }
});

api.get('/bybit-demo/acceptance', (_, response) => ok(response, demoAcceptanceReadiness()));
api.post('/bybit-demo/acceptance/run', async (request, response) => {
  try {
    const queueId = String(request.body?.queueId || '');
    if (!queueId) throw new Error('queueId is required');
    const confirmation = request.header('x-bbot-demo-acceptance');
    ok(response, await runDemoAcceptance(queueId, confirmation));
  } catch (error) {
    response.status(409).json({ success: false, error: safeErrorMessage(error) });
  }
});

