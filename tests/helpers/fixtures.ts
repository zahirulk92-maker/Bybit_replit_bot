import crypto from 'node:crypto';
import type {
  Candle,
  DemoOrder,
  DemoPosition,
  InstrumentMetadata,
  QueueItem,
  RiskValidation,
  Signal,
  StrategyContext,
} from '../../server/types/domain';

export const metadata: InstrumentMetadata = {
  symbol: 'TESTUSDT',
  tickSize: 0.01,
  quantityStep: 0.001,
  minimumQuantity: 0.001,
  minimumNotional: 5,
  maximumQuantity: 10_000,
};

export function candleSeries(
  count: number,
  start: number,
  step: number,
  intervalMs: number,
): Candle[] {
  const end = Date.now() - intervalMs * 2;
  return Array.from({ length: count }, (_, index) => {
    const close = start + index * step;
    const open = close - step * 0.45;
    return {
      start: end - (count - index) * intervalMs,
      open,
      high: Math.max(open, close) + Math.max(Math.abs(step) * 0.8, 0.08),
      low: Math.min(open, close) - Math.max(Math.abs(step) * 0.8, 0.08),
      close,
      volume: 100 + index,
      turnover: (100 + index) * close,
      closed: true,
    };
  });
}

export function makeContext(): StrategyContext {
  const candles1h = candleSeries(80, 90, 0.25, 60 * 60_000);
  const candles15m = candleSeries(60, 100, 0.1, 15 * 60_000);
  const candles5m = candleSeries(60, 104, 0.04, 5 * 60_000);
  const price = candles5m.at(-1)!.close;
  return {
    symbol: metadata.symbol,
    candles1h,
    candles15m,
    candles5m,
    ticker: {
      symbol: metadata.symbol,
      lastPrice: price,
      volume24h: 1_000_000,
      turnover24h: 100_000_000,
      bid1Price: price - 0.01,
      ask1Price: price + 0.01,
      spreadBps: 1,
      price24hPcnt: 0.025,
    },
    orderBook: {
      symbol: metadata.symbol,
      bids: [{ price: price - 0.01, quantity: 150 }],
      asks: [{ price: price + 0.01, quantity: 100 }],
      bidDepth: 15_000,
      askDepth: 10_000,
      depthRatio: 1.5,
      capturedAt: new Date().toISOString(),
    },
    instrument: metadata,
    capturedAt: new Date().toISOString(),
    marketQuality: {
      turnover24h: 100_000_000, volume24h: 1_000_000, spreadBps: 1,
      bidDepth: 15_000, askDepth: 10_000, totalDepth: 25_000, depthRatio: 1.5,
      liquidityScore: 90, volatilityPct: 0.5,
      freshnessMs: { '1h': 0, '15m': 0, '5m': 0 },
    },
  };
}

export function makeSignal(overrides: Partial<Signal> = {}): Signal {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    symbol: metadata.symbol,
    side: 'LONG',
    strategy: 'PULLBACK_ENTRY',
    entry: 100,
    stopLoss: 99,
    tp1: 102,
    tp2: 102.5,
    tp3: 103,
    takeProfit: 102,
    rr: 2,
    score: 90,
    grade: 'A+',
    confirmations: ['test'],
    rejectionReasons: [],
    evidence: [],
    snapshot: {
      trend1h: 'UP',
      setup15m: 'VALID',
      entry5m: 'VALID',
      spreadBps: 1,
      depthRatio: 1.5,
      capturedAt: new Date().toISOString(),
    },
    instrument: metadata,
    triggerCandle: now - 5 * 60_000,
    marketQuality: {
      turnover24h: 100_000_000, volume24h: 1_000_000, spreadBps: 1,
      bidDepth: 15_000, askDepth: 10_000, totalDepth: 25_000, depthRatio: 1.5,
      liquidityScore: 90, volatilityPct: 0.5,
      freshnessMs: { '1h': 0, '15m': 0, '5m': 0 },
    },
    signalEvidence: {
      timeframeAlignment: 'UP / VALID / VALID', entryReason: 'test',
      stopReason: 'test invalidation', targetReason: '2R/2.5R/3R',
      scoreBreakdown: { raw: 90, passedRules: 5, totalRules: 5, capped: false },
      candleTimestamps: { '1h': now - 3_600_000, '15m': now - 900_000, '5m': now - 300_000 },
    },
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30 * 60_000).toISOString(),
    confluenceStrategies: ['PULLBACK_ENTRY'],
    ...overrides,
  };
}

export function makeValidation(overrides: Partial<RiskValidation> = {}): RiskValidation {
  return {
    ok: true,
    quantity: 1,
    plannedRisk: 1.2,
    riskBudget: 100,
    feesEstimate: 0.12,
    slippageEstimate: 0.02,
    notional: 100,
    roundedEntry: 100,
    roundedStopLoss: 99,
    roundedTp1: 102,
    roundedTp2: 102.5,
    roundedTp3: 103,
    ...overrides,
  };
}

export function makeQueue(signal: Signal, validation = makeValidation()): QueueItem {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  return {
    id,
    signalId: signal.id,
    symbol: signal.symbol,
    state: 'CREATED',
    createdAt: now,
    updatedAt: now,
    validatedAt: now,
    idempotencyKey: `${signal.id}:${signal.triggerCandle}`,
    orderLinkId: `bbot-${id.replace(/-/g, '').slice(0, 24)}`,
    attempts: 0,
    validation,
    confirmations: {
      orderSubmitted: false,
      fillConfirmed: false,
      positionConfirmed: false,
      stopLossConfirmed: false,
      takeProfitConfirmed: false,
    },
  };
}

export class FakeDemoAdapter {
  placeCalls = 0;
  findCalls = 0;
  cancelCalls = 0;
  protectionCalls = 0;
  closeCalls = 0;
  lastCloseInput: { symbol: string; side: 'Buy' | 'Sell'; quantity: number; orderLinkId: string; positionIdx: number } | null = null;
  timeoutAfterPlace = false;
  partialFill = false;
  protectionWorks = true;
  order: DemoOrder | null = null;
  position: DemoPosition | null = null;
  cancelled = false;

  seedFilled(signal: Signal, queue: QueueItem, quantity = 1): void {
    this.order = {
      orderId: 'order-seeded',
      orderLinkId: queue.orderLinkId,
      symbol: signal.symbol,
      side: signal.side === 'LONG' ? 'Buy' : 'Sell',
      status: 'Filled',
      quantity,
      cumulativeFilledQuantity: quantity,
      averagePrice: signal.entry,
    };
    this.position = {
      symbol: signal.symbol,
      side: signal.side === 'LONG' ? 'Buy' : 'Sell',
      size: quantity,
      averagePrice: signal.entry,
      markPrice: signal.entry,
      stopLoss: 0,
      takeProfit: 0,
      unrealizedPnl: 0,
      positionIdx: 0,
    };
  }

  async getAvailableBalance(): Promise<number> {
    return 10_000;
  }

  async findOrderByLinkId(_symbol?: string, orderLinkId?: string): Promise<DemoOrder | null> {
    this.findCalls += 1;
    if (!this.order || (orderLinkId && this.order.orderLinkId !== orderLinkId)) return null;
    if (this.partialFill && !this.cancelled) {
      return { ...this.order, status: 'PartiallyFilled', cumulativeFilledQuantity: 0.4, averagePrice: 100 };
    }
    if (this.partialFill && this.cancelled) {
      return { ...this.order, status: 'Cancelled', cumulativeFilledQuantity: 0.4, averagePrice: 100 };
    }
    return { ...this.order, status: 'Filled', cumulativeFilledQuantity: this.order.quantity, averagePrice: 100 };
  }

  async placeMarketOrder(input: { symbol: string; side: 'Buy' | 'Sell'; quantity: number; orderLinkId: string }): Promise<DemoOrder> {
    this.placeCalls += 1;
    this.order = {
      orderId: 'order-1',
      orderLinkId: input.orderLinkId,
      symbol: input.symbol,
      side: input.side,
      status: 'Created',
      quantity: input.quantity,
      cumulativeFilledQuantity: 0,
      averagePrice: 0,
    };
    const size = this.partialFill ? 0.4 : input.quantity;
    this.position = {
      symbol: input.symbol,
      side: input.side,
      size,
      averagePrice: 100,
      markPrice: 100,
      stopLoss: 0,
      takeProfit: 0,
      unrealizedPnl: 0,
      positionIdx: 0,
    };
    if (this.timeoutAfterPlace) throw new Error('simulated timeout after exchange acceptance');
    return this.order;
  }

  async cancelOrder(): Promise<void> {
    this.cancelCalls += 1;
    this.cancelled = true;
  }

  async getPosition(): Promise<DemoPosition | null> {
    return this.position ? { ...this.position } : null;
  }

  async setProtection(input: { symbol: string; stopLoss: number; takeProfit: number; positionIdx: number }): Promise<void> {
    this.protectionCalls += 1;
    if (this.protectionWorks && this.position) {
      this.position.stopLoss = input.stopLoss;
      this.position.takeProfit = input.takeProfit;
    }
  }

  async closePosition(input: { symbol: string; side: 'Buy' | 'Sell'; quantity: number; orderLinkId: string; positionIdx: number }): Promise<DemoOrder> {
    this.closeCalls += 1;
    this.lastCloseInput = { ...input };
    this.position = null;
    this.order = {
      orderId: 'close-1',
      orderLinkId: input.orderLinkId,
      symbol: input.symbol,
      side: input.side === 'Buy' ? 'Sell' : 'Buy',
      status: 'Filled',
      quantity: input.quantity,
      cumulativeFilledQuantity: input.quantity,
      averagePrice: 100,
    };
    return this.order;
  }
}
