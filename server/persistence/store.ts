import fs from 'node:fs';
import path from 'node:path';
import type {
  ExecutionRecord,
  ExecutionTelemetry,
  JournalRecord,
  PaperAccount,
  QueueItem,
  Signal,
  Trade,
  RiskProtectionState,
} from '../types/domain';
import { env } from '../config/env';

export const CURRENT_STATE_VERSION = 6 as const;

export interface Log {
  time: string;
  level: 'INFO' | 'WARNING' | 'ERROR';
  category: string;
  eventCode: string;
  /** Backward-compatible alias retained for existing API consumers. */
  event: string;
  symbol?: string;
  executionId?: string;
  tradeId?: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface RecoveryStatus {
  source: 'PRIMARY' | 'BACKUP' | 'INITIAL';
  migratedFromVersion: number | null;
  corruptPrimaryQuarantined: string | null;
  lastRecoveryAt: string;
  warning: string | null;
}

export interface PersistenceStatus {
  path: string;
  backupPath: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  writeCount: number;
}

export interface RuntimeState {
  version: 6;
  signals: Signal[];
  queue: QueueItem[];
  executions: ExecutionRecord[];
  trades: Trade[];
  journal: JournalRecord[];
  logs: Log[];
  pauseNewEntries: boolean;
  emergencyStop: boolean;
  symbolBlocks: Record<string, string>;
  processedTriggerKeys: string[];
  paperAccount: PaperAccount;
  lastReconciliationAt: string | null;
  lastReconciliationError: string | null;
  positionMissingCounts: Record<string, number>;
  executionTelemetry: ExecutionTelemetry;
  riskProtection: RiskProtectionState;
  recoveryStatus: RecoveryStatus;
}

const file = path.resolve(
  process.env.RUNTIME_STATE_FILE ||
    (process.env.NODE_ENV === 'test' ? `data/test-runtime-${process.pid}.json` : 'data/runtime.json'),
);
const backupFile = `${file}.bak`;

export const persistenceStatus: PersistenceStatus = {
  path: file,
  backupPath: backupFile,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null,
  writeCount: 0,
};

function nowIso(): string {
  return new Date().toISOString();
}

function initialState(recovery?: Partial<RecoveryStatus>): RuntimeState {
  const now = nowIso();
  return {
    version: CURRENT_STATE_VERSION,
    signals: [], queue: [], executions: [], trades: [], journal: [], logs: [],
    pauseNewEntries: false, emergencyStop: false, symbolBlocks: {}, processedTriggerKeys: [],
    paperAccount: { startingBalance: env.paperBalance, availableBalance: env.paperBalance, realizedPnl: 0 },
    lastReconciliationAt: null, lastReconciliationError: null, positionMissingCounts: {},
    riskProtection: {
      day: now.slice(0, 10), dailyBoundaryResetAt: now, availableBalance: env.paperBalance,
      balanceUpdatedAt: now, blockedEntries: 0, blockLogKeys: [], emergencyActivatedAt: null,
      emergencyReason: null,
    },
    executionTelemetry: {
      queuedExecutions: 0, submitting: 0, submitted: 0, partialFills: 0, protectedTrades: 0,
      protectionFailures: 0, reconciliationRetries: 0, duplicateSubmissionsBlocked: 0,
      closeAttempts: 0, closeFailures: 0, finalizedTrades: 0,
    },
    recoveryStatus: {
      source: 'INITIAL', migratedFromVersion: null, corruptPrimaryQuarantined: null,
      lastRecoveryAt: now, warning: null, ...recovery,
    },
  };
}

export function migrateState(input: Record<string, unknown>): RuntimeState {
  const rawVersion = Number(input.version ?? 1);
  if (!Number.isInteger(rawVersion) || rawVersion < 1) throw new Error('Invalid persisted state version');
  if (rawVersion > CURRENT_STATE_VERSION) {
    throw new Error(`Unsupported future persisted state version ${rawVersion}; current version is ${CURRENT_STATE_VERSION}`);
  }
  const base = initialState({ migratedFromVersion: rawVersion < CURRENT_STATE_VERSION ? rawVersion : null });
  const source = input as unknown as Partial<RuntimeState>;
  return {
    ...base,
    ...source,
    version: CURRENT_STATE_VERSION,
    signals: Array.isArray(source.signals) ? source.signals : [],
    queue: Array.isArray(source.queue) ? source.queue : [],
    executions: Array.isArray(source.executions) ? source.executions : [],
    trades: Array.isArray(source.trades) ? source.trades.map((trade) => ({
      ...trade,
      initialQuantity: trade.initialQuantity ?? trade.quantity,
      remainingQuantity: trade.remainingQuantity ?? trade.quantity,
      targetPolicy: trade.targetPolicy ?? 'FULL_CLOSE_TP1',
      tpStatus: trade.tpStatus ?? { tp1: 'PENDING', tp2: 'PENDING', tp3: 'PENDING' },
      stopStatus: trade.stopStatus ?? 'ACTIVE',
    })) : [],
    journal: Array.isArray(source.journal) ? source.journal.map((row) => ({ ...row, slippage: row.slippage ?? 0 })) : [],
    logs: Array.isArray(source.logs) ? source.logs.map((row) => ({
      ...row,
      category: row.category ?? inferCategory(row.eventCode ?? row.event ?? 'LEGACY_EVENT'),
      eventCode: row.eventCode ?? row.event ?? 'LEGACY_EVENT',
      event: row.event ?? row.eventCode ?? 'LEGACY_EVENT',
    })) : [],
    symbolBlocks: source.symbolBlocks ?? {},
    processedTriggerKeys: Array.isArray(source.processedTriggerKeys) ? source.processedTriggerKeys : [],
    paperAccount: { ...base.paperAccount, ...(source.paperAccount ?? {}) },
    positionMissingCounts: source.positionMissingCounts ?? {},
    executionTelemetry: { ...base.executionTelemetry, ...(source.executionTelemetry ?? {}) },
    riskProtection: {
      ...base.riskProtection,
      ...(source.riskProtection ?? {}),
      blockLogKeys: source.riskProtection?.blockLogKeys ?? [],
    },
    recoveryStatus: {
      ...base.recoveryStatus,
      ...(source.recoveryStatus ?? {}),
      migratedFromVersion: rawVersion < CURRENT_STATE_VERSION ? rawVersion : source.recoveryStatus?.migratedFromVersion ?? null,
      lastRecoveryAt: nowIso(),
    },
  };
}

function readAndMigrate(target: string): RuntimeState {
  const parsed = JSON.parse(fs.readFileSync(target, 'utf8')) as Record<string, unknown>;
  return migrateState(parsed);
}

function quarantine(target: string): string | null {
  if (!fs.existsSync(target)) return null;
  const quarantinePath = `${target}.corrupt-${Date.now()}`;
  fs.renameSync(target, quarantinePath);
  return quarantinePath;
}

export function loadStateFromDisk(target = file): RuntimeState {
  const backup = `${target}.bak`;
  if (!fs.existsSync(target) && !fs.existsSync(backup)) return initialState();
  try {
    const loaded = readAndMigrate(target);
    loaded.recoveryStatus.source = 'PRIMARY';
    return loaded;
  } catch (primaryError) {
    if (primaryError instanceof Error && primaryError.message.startsWith('Unsupported future')) throw primaryError;
    const quarantined = quarantine(target);
    try {
      const recovered = readAndMigrate(backup);
      recovered.recoveryStatus = {
        ...recovered.recoveryStatus,
        source: 'BACKUP',
        corruptPrimaryQuarantined: quarantined,
        lastRecoveryAt: nowIso(),
        warning: 'Primary state was corrupt; restored last known valid backup',
      };
      return recovered;
    } catch (backupError) {
      if (backupError instanceof Error && backupError.message.startsWith('Unsupported future')) throw backupError;
      const backupQuarantine = quarantine(backup);
      return initialState({
        source: 'INITIAL',
        corruptPrimaryQuarantined: quarantined,
        warning: `No valid persisted state was available${backupQuarantine ? '; corrupt backup quarantined' : ''}. Started fail-safe with empty trading state.`,
      });
    }
  }
}

export const state = loadStateFromDisk();

function fsyncDirectory(directory: string): void {
  const descriptor = fs.openSync(directory, 'r');
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

export function atomicWriteState(target: string, value: RuntimeState): void {
  const directory = path.dirname(target);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  const backup = `${target}.bak`;
  const backupTemporary = `${backup}.${process.pid}.tmp`;
  fs.mkdirSync(directory, { recursive: true });
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, 'w', 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(value, null, 2), 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor); descriptor = undefined;
    if (fs.existsSync(target)) {
      fs.copyFileSync(target, backupTemporary);
      const backupDescriptor = fs.openSync(backupTemporary, 'r');
      try { fs.fsyncSync(backupDescriptor); } finally { fs.closeSync(backupDescriptor); }
      fs.renameSync(backupTemporary, backup);
    }
    fs.renameSync(temporary, target);
    fsyncDirectory(directory);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
    fs.rmSync(backupTemporary, { force: true });
    throw error;
  }
}

export function save(): void {
  try {
    atomicWriteState(file, state);
    persistenceStatus.lastSuccessAt = nowIso();
    persistenceStatus.lastFailureAt = null;
    persistenceStatus.lastError = null;
    persistenceStatus.writeCount += 1;
  } catch (error) {
    persistenceStatus.lastFailureAt = nowIso();
    persistenceStatus.lastError = safeErrorMessage(error);
    throw error;
  }
}

function redactString(value: string): string {
  return value
    .replace(/(X-BAPI-(?:API-KEY|SIGN|TIMESTAMP|RECV-WINDOW)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|secret|signature|authorization|cookie)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\b[A-Fa-f0-9]{64}\b/g, '[REDACTED_HASH]');
}

function sanitizeValue(value: unknown, key = ''): unknown {
  if (/secret|api.?key|signature|authorization|cookie|x-bapi/i.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeValue(v, k)]));
  }
  return value;
}

function inferCategory(eventCode: string): string {
  const prefix = eventCode.split('_')[0];
  const known: Record<string, string> = {
    SCANNER: 'SCANNER', SIGNAL: 'SIGNAL', ENTRY: 'EXECUTION', DEMO: 'EXCHANGE', PAPER: 'EXECUTION',
    RESTART: 'RECOVERY', RECONCILIATION: 'RECONCILIATION', RISK: 'RISK', EMERGENCY: 'SAFETY',
    NEW: 'SAFETY', PERSISTENCE: 'PERSISTENCE', JOURNAL: 'JOURNAL', WORKER: 'WORKER', EXCHANGE: 'EXCHANGE',
  };
  return known[prefix] ?? 'SYSTEM';
}

export function safeErrorMessage(error: unknown): string {
  return redactString(error instanceof Error ? error.message : String(error));
}

export function log(eventCode: string, message: string, meta?: Record<string, unknown>, level: Log['level'] = 'INFO'): void {
  const sanitized = meta ? sanitizeValue(meta) as Record<string, unknown> : undefined;
  state.logs.push({
    time: nowIso(), level, category: inferCategory(eventCode), eventCode, event: eventCode,
    symbol: typeof sanitized?.symbol === 'string' ? sanitized.symbol : undefined,
    executionId: typeof sanitized?.executionId === 'string' ? sanitized.executionId : undefined,
    tradeId: typeof sanitized?.tradeId === 'string' ? sanitized.tradeId : undefined,
    message: redactString(message), meta: sanitized,
  });
  state.logs = state.logs.slice(-env.logMaxRecords);
  save();
}

export function resetStateForTests(): void {
  Object.assign(state, initialState());
  for (const candidate of [file, backupFile]) {
    try { fs.rmSync(candidate, { force: true }); } catch { /* best effort */ }
  }
}

export function runtimeStatePath(): string { return file; }
export function incrementExecutionTelemetry(
  key: keyof RuntimeState['executionTelemetry'],
  amount = 1,
  persist = true,
): void {
  state.executionTelemetry[key] += amount;
  if (persist) save();
}
