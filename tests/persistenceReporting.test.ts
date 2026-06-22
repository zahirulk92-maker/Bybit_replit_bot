import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { env } from '../server/config/env';
import {
  CURRENT_STATE_VERSION,
  atomicWriteState,
  loadStateFromDisk,
  log,
  migrateState,
  resetStateForTests,
  state,
} from '../server/persistence/store';
import { journalCsv, logsCsv, logsJson, operationalReport } from '../server/persistence/reporting';
import { recoverPersistedState } from '../server/runtime/recovery';

function temporaryStatePath(): { directory: string; file: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bbot-persistence-'));
  return { directory, file: path.join(directory, 'runtime.json') };
}

test('atomic write creates valid primary and preserves last valid backup', () => {
  const target = temporaryStatePath();
  const first = migrateState({ version: 5, emergencyStop: true, signals: [] });
  atomicWriteState(target.file, first);
  const second = migrateState({ version: 6, emergencyStop: false, pauseNewEntries: true });
  atomicWriteState(target.file, second);

  assert.equal(loadStateFromDisk(target.file).pauseNewEntries, true);
  assert.equal(loadStateFromDisk(`${target.file}.bak`).emergencyStop, true);
  assert.equal(fs.readdirSync(target.directory).some((name) => name.endsWith('.tmp')), false);
  fs.rmSync(target.directory, { recursive: true, force: true });
});

test('corrupt primary is quarantined and restored from valid backup', () => {
  const target = temporaryStatePath();
  const backup = migrateState({ version: 5, emergencyStop: true });
  fs.writeFileSync(`${target.file}.bak`, JSON.stringify(backup));
  fs.writeFileSync(target.file, '{interrupted');

  const recovered = loadStateFromDisk(target.file);
  assert.equal(recovered.emergencyStop, true);
  assert.equal(recovered.recoveryStatus.source, 'BACKUP');
  assert.match(recovered.recoveryStatus.warning ?? '', /restored/i);
  assert.equal(fs.readdirSync(target.directory).some((name) => name.includes('.corrupt-')), true);
  fs.rmSync(target.directory, { recursive: true, force: true });
});

test('corrupt primary and backup fail safe with empty non-fabricated state', () => {
  const target = temporaryStatePath();
  fs.writeFileSync(target.file, 'broken');
  fs.writeFileSync(`${target.file}.bak`, 'also-broken');
  const recovered = loadStateFromDisk(target.file);
  assert.equal(recovered.recoveryStatus.source, 'INITIAL');
  assert.equal(recovered.signals.length, 0);
  assert.equal(recovered.trades.length, 0);
  assert.equal(recovered.journal.length, 0);
  assert.equal(recovered.paperAccount.realizedPnl, 0);
  fs.rmSync(target.directory, { recursive: true, force: true });
});

test('schema migration preserves old and unknown compatible fields', () => {
  const migrated = migrateState({
    version: 5,
    emergencyStop: true,
    pauseNewEntries: true,
    customCompatibleField: { retained: true },
    riskProtection: { day: '2026-06-23', blockedEntries: 7 },
  });
  assert.equal(migrated.version, CURRENT_STATE_VERSION);
  assert.equal(migrated.emergencyStop, true);
  assert.equal(migrated.pauseNewEntries, true);
  assert.equal(migrated.riskProtection.blockedEntries, 7);
  assert.deepEqual((migrated as unknown as Record<string, unknown>).customCompatibleField, { retained: true });
  assert.equal(migrated.recoveryStatus.migratedFromVersion, 5);
});

test('unsupported future schema version is rejected', () => {
  assert.throws(() => migrateState({ version: CURRENT_STATE_VERSION + 1 }), /Unsupported future/);
});

test('restart recovery keeps emergency and pause while forcing scanner off', () => {
  resetStateForTests();
  state.emergencyStop = true;
  state.pauseNewEntries = true;
  recoverPersistedState();
  assert.equal(state.emergencyStop, true);
  assert.equal(state.pauseNewEntries, true);
  const report = operationalReport();
  assert.equal(report.runtime.emergencyStop, true);
  assert.equal(report.scanner.enabled, false);
});

test('structured logs redact secrets and retention preserves newest records', () => {
  resetStateForTests();
  const previousLimit = env.logMaxRecords;
  env.logMaxRecords = 3;
  try {
    log('EXCHANGE_TEST_1', 'authorization=top-secret', { symbol: 'BTCUSDT', apiKey: 'abc', signature: 'f'.repeat(64) });
    const redacted = logsJson();
    assert.doesNotMatch(redacted, /top-secret|"abc"|f{64}/);
    assert.match(redacted, /\[REDACTED\]/);
    log('EXCHANGE_TEST_2', 'second');
    log('EXCHANGE_TEST_3', 'third');
    log('EXCHANGE_TEST_4', 'fourth');
    assert.equal(state.logs.length, 3);
    assert.equal(state.logs[0].eventCode, 'EXCHANGE_TEST_2');
  } finally {
    env.logMaxRecords = previousLimit;
  }
});

test('journal and log CSV exports use deterministic columns and valid escaping', () => {
  resetStateForTests();
  state.journal.push({
    id: 'trade-1', mode: 'LOCAL_PAPER', symbol: 'BTCUSDT', side: 'LONG', strategy: 'MOMENTUM_BREAKOUT',
    grade: 'A', score: 86, entry: 100, exit: 102, currentPrice: 102, stopLoss: 99, tp1: 102, tp2: 102.5,
    tp3: 103, takeProfit: 102, quantity: 1, initialQuantity: 1, remainingQuantity: 0,
    targetPolicy: 'FULL_CLOSE_TP1', tpStatus: { tp1: 'HIT', tp2: 'SKIPPED', tp3: 'SKIPPED' },
    stopStatus: 'ACTIVE', plannedRisk: 1, rr: 2, status: 'ACTIVE', protectionSource: 'LOCAL_ENGINE',
    protectionConfirmedAt: '2026-06-23T00:00:00.000Z', openedAt: '2026-06-23T00:00:00.000Z',
    updatedAt: '2026-06-23T00:05:00.000Z', unrealizedPnl: 0, signalId: 'signal-1', queueId: 'queue-1',
    executionId: 'execution-1', orderLinkId: 'order-1', grossPnl: 2, fees: 0.1, slippage: 0.02,
    netPnl: 1.88, achievedRR: 1.88, closeReason: 'TAKE_PROFIT', closedAt: '2026-06-23T00:05:00.000Z',
  });
  log('JOURNAL_EXPORT_TEST', 'message with comma, quote " and newline\nvalue');
  const journal = journalCsv();
  const logs = logsCsv();
  assert.equal(journal.split('\r\n')[0], 'id,mode,symbol,side,strategy,grade,score,entry,exit,quantity,plannedRisk,rr,achievedRR,grossPnl,fees,slippage,netPnl,closeReason,openedAt,closedAt,signalId,queueId,executionId,exchangeOrderId,orderLinkId');
  assert.match(journal, /LOCAL_PAPER/);
  assert.match(logs, /"message with comma, quote "" and newline\nvalue"/);
});
