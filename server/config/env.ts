import 'dotenv/config';
import type { ExecutionMode } from '../types/domain';

function numberValue(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function integerValue(name: string, fallback: number): number {
  return Math.max(1, Math.floor(numberValue(name, fallback)));
}

function modeValue(value: string | undefined): ExecutionMode | string {
  return value?.trim().toUpperCase() || 'DISABLED';
}

export const env = {
  port: integerValue('PORT', 3001),
  mode: modeValue(process.env.TRADING_MODE) as ExecutionMode,
  paperEnabled: process.env.LOCAL_PAPER_ENABLED === 'true',
  publicUrl: process.env.BYBIT_PUBLIC_API_URL || 'https://api.bybit.com',
  demoUrl: process.env.BYBIT_DEMO_API_URL || 'https://api-demo.bybit.com',
  demoKey: process.env.BYBIT_DEMO_API_KEY || '',
  demoSecret: process.env.BYBIT_DEMO_API_SECRET || '',
  demoAcceptanceEnabled: process.env.BYBIT_DEMO_ACCEPTANCE_ENABLED === 'true',
  demoAcceptanceSymbol: (process.env.BYBIT_DEMO_ACCEPTANCE_SYMBOL || '').trim().toUpperCase(),
  paperBalance: numberValue('PAPER_STARTING_BALANCE', 10_000),
  requestTimeoutMs: integerValue('BYBIT_REQUEST_TIMEOUT_MS', 10_000),
  reconciliationIntervalMs: integerValue('RECONCILIATION_INTERVAL_MS', 15_000),
  lifecycleIntervalMs: integerValue('LIFECYCLE_INTERVAL_MS', 10_000),
  workerRetryAttempts: integerValue('WORKER_RETRY_ATTEMPTS', 3),
  workerBackoffBaseMs: integerValue('WORKER_BACKOFF_BASE_MS', 500),
  workerBackoffMaxMs: integerValue('WORKER_BACKOFF_MAX_MS', 5_000),
  workerShutdownGraceMs: integerValue('WORKER_SHUTDOWN_GRACE_MS', 10_000),
  scannerConcurrency: integerValue('SCANNER_CONCURRENCY', 4),
  scannerDepthShortlist: integerValue('SCANNER_DEPTH_SHORTLIST', 80),
  feeRate: numberValue('EXECUTION_FEE_RATE', 0.0006),
  slippageRate: numberValue('EXECUTION_SLIPPAGE_RATE', 0.0002),
  maxRiskPerTradePct: numberValue('MAX_RISK_PER_TRADE_PCT', 1),
  maxAggregateOpenRiskPct: numberValue('MAX_AGGREGATE_OPEN_RISK_PCT', 5),
  maxDailyRealizedLoss: numberValue('MAX_DAILY_REALIZED_LOSS', 300),
  maxDailyRealizedProfit: numberValue('MAX_DAILY_REALIZED_PROFIT', 500),
  maxConsecutiveLosses: integerValue('MAX_CONSECUTIVE_LOSSES', 3),
  balanceStaleMs: integerValue('BALANCE_STALE_MS', 60_000),
  logMaxRecords: integerValue('LOG_MAX_RECORDS', 2_000),
};

export function validateModeConfiguration(input: {
  mode: string;
  paperEnabled: boolean;
  demoKey: string;
  demoSecret: string;
}): { valid: boolean; reason?: string } {
  if (!['DISABLED', 'LOCAL_PAPER', 'BYBIT_DEMO'].includes(input.mode)) {
    return { valid: false, reason: `Unsupported TRADING_MODE ${input.mode}` };
  }
  if (input.mode === 'LOCAL_PAPER' && !input.paperEnabled) {
    return { valid: false, reason: 'LOCAL_PAPER requires LOCAL_PAPER_ENABLED=true' };
  }
  if (input.mode === 'BYBIT_DEMO' && (!input.demoKey || !input.demoSecret)) {
    return { valid: false, reason: 'BYBIT_DEMO credentials are not configured' };
  }
  return { valid: true };
}

export function validateMode(): { valid: boolean; reason?: string } {
  return validateModeConfiguration(env);
}

export function validateDemoAcceptance(): { valid: boolean; reason?: string } {
  if (!env.demoAcceptanceEnabled) {
    return { valid: false, reason: 'Bybit Demo acceptance mode is not enabled' };
  }
  if (env.mode !== 'BYBIT_DEMO') {
    return { valid: false, reason: 'Demo acceptance requires TRADING_MODE=BYBIT_DEMO' };
  }
  if (!env.demoAcceptanceSymbol || !/^[A-Z0-9]+USDT$/.test(env.demoAcceptanceSymbol)) {
    return { valid: false, reason: 'A single valid BYBIT_DEMO_ACCEPTANCE_SYMBOL is required' };
  }
  if (!env.demoKey || !env.demoSecret) {
    return { valid: false, reason: 'Bybit Demo credentials are not configured' };
  }
  return { valid: true };
}
