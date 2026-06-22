import { env } from '../config/env';
import { reconciliationStatus } from '../execution/reconciliation';
import { riskTelemetry } from '../risk/protection';
import { scanner } from '../scanner/engine';
import { persistenceStatus, state } from './store';

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  return [columns.join(','), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','))].join('\r\n') + '\r\n';
}

export function journalCsv(): string {
  const columns = [
    'id','mode','symbol','side','strategy','grade','score','entry','exit','quantity','plannedRisk','rr',
    'achievedRR','grossPnl','fees','slippage','netPnl','closeReason','openedAt','closedAt','signalId',
    'queueId','executionId','exchangeOrderId','orderLinkId',
  ];
  const rows = state.journal.map((row) => ({ ...row, slippage: row.slippage ?? 0 }));
  return toCsv(columns, rows);
}

export function logsCsv(): string {
  const columns = ['time','level','category','eventCode','symbol','executionId','tradeId','message','metadata'];
  const rows = state.logs.map((row) => ({
    time: row.time, level: row.level, category: row.category, eventCode: row.eventCode,
    symbol: row.symbol ?? '', executionId: row.executionId ?? '', tradeId: row.tradeId ?? '',
    message: row.message, metadata: row.meta ? JSON.stringify(row.meta) : '',
  }));
  return toCsv(columns, rows);
}

export function logsJson(): string {
  return JSON.stringify(state.logs, null, 2);
}

export function journalSummary() {
  const rows = state.journal;
  return {
    totalTrades: rows.length,
    localPaperTrades: rows.filter((row) => row.mode === 'LOCAL_PAPER').length,
    bybitDemoTrades: rows.filter((row) => row.mode === 'BYBIT_DEMO').length,
    wins: rows.filter((row) => row.netPnl > 0).length,
    losses: rows.filter((row) => row.netPnl < 0).length,
    netPnl: Number(rows.reduce((sum, row) => sum + row.netPnl, 0).toFixed(8)),
    fees: Number(rows.reduce((sum, row) => sum + row.fees, 0).toFixed(8)),
    slippage: Number(rows.reduce((sum, row) => sum + (row.slippage ?? 0), 0).toFixed(8)),
    lastClosedAt: rows.length ? rows.reduce((latest, row) => row.closedAt > latest ? row.closedAt : latest, rows[0].closedAt) : null,
  };
}

export function operationalReport() {
  return {
    runtime: {
      executionMode: env.mode,
      pauseNewEntries: state.pauseNewEntries,
      emergencyStop: state.emergencyStop,
      activeSignals: state.signals.length,
      queuedEntries: state.queue.filter((row) => !['CLOSED','REJECTED','CANCELLED'].includes(row.state)).length,
      totalQueueRecords: state.queue.length,
      inFlightExecutions: state.executions.filter((row) => !['CLOSED','REJECTED','CANCELLED'].includes(row.state)).length,
      activeTrades: state.trades.length,
    },
    scanner,
    risk: riskTelemetry(),
    executionTelemetry: state.executionTelemetry,
    recovery: state.recoveryStatus,
    persistence: persistenceStatus,
    reconciliation: {
      ...reconciliationStatus(),
      lastAt: state.lastReconciliationAt,
      lastError: state.lastReconciliationError,
    },
    recentWarningsAndErrors: state.logs.filter((row) => row.level !== 'INFO').slice(-50),
    journal: journalSummary(),
  };
}
