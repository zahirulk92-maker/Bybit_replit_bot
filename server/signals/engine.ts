import crypto from 'node:crypto';
import { log, save, state } from '../persistence/store';
import type { Candidate, Signal, StrategyId } from '../types/domain';

function activeExecutionForSymbol(symbol: string): boolean {
  return state.queue.some(
    (queue) =>
      queue.symbol === symbol &&
      !['REJECTED', 'CANCELLED', 'ERROR', 'CLOSED'].includes(queue.state),
  );
}

function expireSignals(): void {
  const now = Date.now();
  const expiredIds = new Set(
    state.signals
      .filter((signal) => new Date(signal.expiresAt).getTime() <= now)
      .map((signal) => signal.id),
  );
  if (!expiredIds.size) return;
  state.signals = state.signals.filter((signal) => !expiredIds.has(signal.id));
  for (const queue of state.queue) {
    if (expiredIds.has(queue.signalId) && queue.state === 'CREATED') {
      queue.state = 'CANCELLED';
      queue.reason = 'Signal expired';
      queue.updatedAt = new Date().toISOString();
    }
  }
}

export function acceptCandidates(candidates: Candidate[]): Signal[] {
  expireSignals();
  if (state.emergencyStop || state.pauseNewEntries) {
    log('SIGNAL_BLOCKED', state.emergencyStop ? 'Emergency stop blocks new signals and queues' : 'Pause blocks new queues', { emergencyStop: state.emergencyStop, pauseNewEntries: state.pauseNewEntries }, 'WARNING');
    return [];
  }
  const accepted: Signal[] = [];
  const bySymbol = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    if (candidate.score < 85 || candidate.rr < 2) continue;
    const rows = bySymbol.get(candidate.symbol) ?? [];
    rows.push(candidate);
    bySymbol.set(candidate.symbol, rows);
  }

  for (const [symbol, rows] of bySymbol) {
    if (state.signals.length >= 20) break;
    if (
      state.signals.some((signal) => signal.symbol === symbol) ||
      state.trades.some((trade) => trade.symbol === symbol) ||
      activeExecutionForSymbol(symbol) ||
      state.symbolBlocks[symbol]
    ) {
      continue;
    }
    const sorted = rows.sort((a, b) =>
      b.score - a.score ||
      b.rr - a.rr ||
      b.marketQuality.liquidityScore - a.marketQuality.liquidityScore ||
      b.triggerCandle - a.triggerCandle ||
      a.strategy.localeCompare(b.strategy)
    );
    const best = sorted[0];
    const triggerKey = `${symbol}:${best.triggerCandle}`;
    if (state.processedTriggerKeys.includes(triggerKey)) continue;
    const now = Date.now();
    const confluenceStrategies = [...new Set(sorted.map((row) => row.strategy))] as StrategyId[];
    const signal: Signal = {
      ...best,
      id: crypto.randomUUID(),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 30 * 60_000).toISOString(),
      confluenceStrategies,
    };
    const queueId = crypto.randomUUID();
    state.signals.push(signal);
    state.queue.push({
      id: queueId,
      signalId: signal.id,
      symbol,
      state: 'CREATED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      idempotencyKey: `${signal.id}:${best.triggerCandle}`,
      orderLinkId: `bbot-${crypto.createHash('sha256').update(`${signal.id}:${best.triggerCandle}`).digest('hex').slice(0, 24)}`,
      attempts: 0,
      confirmations: {
        orderSubmitted: false,
        fillConfirmed: false,
        positionConfirmed: false,
        stopLossConfirmed: false,
        takeProfitConfirmed: false,
      },
    });
    state.processedTriggerKeys.push(triggerKey);
    state.processedTriggerKeys = state.processedTriggerKeys.slice(-5_000);
    accepted.push(signal);
    log('SIGNAL_CREATED', `${signal.grade} signal created for ${symbol}`, {
      strategy: signal.strategy,
      score: signal.score,
      confluenceStrategies,
    });
  }

  state.signals.sort((a, b) => {
    if (a.grade !== b.grade) return a.grade === 'A+' ? -1 : 1;
    return b.score - a.score ||
      b.rr - a.rr ||
      b.marketQuality.liquidityScore - a.marketQuality.liquidityScore ||
      b.triggerCandle - a.triggerCandle ||
      a.symbol.localeCompare(b.symbol);
  });
  save();
  return accepted;
}
