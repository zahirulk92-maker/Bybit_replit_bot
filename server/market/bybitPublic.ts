import { env } from '../config/env';
import { exponentialDelay, sleep } from '../runtime/retry';
import type {
  Candle,
  InstrumentMetadata,
  OrderBookSnapshot,
  Ticker,
} from '../types/domain';

export class MarketDataError extends Error {
  constructor(
    message: string,
    public readonly code: 'TIMEOUT' | 'RATE_LIMIT' | 'HTTP' | 'BYBIT' | 'NETWORK',
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'MarketDataError';
  }
}

async function request<T>(path: string, timeoutMs = env.requestTimeoutMs): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= env.workerRetryAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(env.publicUrl + path, { signal: controller.signal });
      if (response.status === 429) {
        throw new MarketDataError('Bybit public API rate limit reached', 'RATE_LIMIT', true);
      }
      if (!response.ok) {
        throw new MarketDataError(
          `Bybit public API HTTP ${response.status}`,
          'HTTP',
          response.status >= 500,
        );
      }
      const payload = (await response.json()) as {
        retCode: number;
        retMsg: string;
        result: T;
      };
      if (payload.retCode !== 0) {
        const retryable = [10000, 10006, 10016, 429].includes(payload.retCode);
        throw new MarketDataError(
          payload.retMsg ? `Bybit public API error: ${payload.retMsg}` : 'Bybit public API error',
          payload.retCode === 10006 || payload.retCode === 429 ? 'RATE_LIMIT' : 'BYBIT',
          retryable,
        );
      }
      return payload.result;
    } catch (error) {
      lastError = error;
      const normalized =
        error instanceof MarketDataError
          ? error
          : error instanceof Error && error.name === 'AbortError'
            ? new MarketDataError('Bybit public API timeout', 'TIMEOUT', true)
            : new MarketDataError('Bybit public API network failure', 'NETWORK', true);
      if (!normalized.retryable || attempt === env.workerRetryAttempts) throw normalized;
      await sleep(exponentialDelay(attempt, env.workerBackoffBaseMs, env.workerBackoffMaxMs));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Bybit public API request failed');
}

let metadataCache: { expiresAt: number; rows: InstrumentMetadata[] } | null = null;

export async function instruments(forceRefresh = false): Promise<InstrumentMetadata[]> {
  if (!forceRefresh && metadataCache && metadataCache.expiresAt > Date.now()) {
    return metadataCache.rows;
  }
  const rawRows: Array<Record<string, any>> = [];
  let cursor = '';
  for (let page = 0; page < 10; page += 1) {
    const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const result = await request<{
      list?: Array<Record<string, any>>;
      nextPageCursor?: string;
    }>(`/v5/market/instruments-info?category=linear&limit=1000${suffix}`);
    rawRows.push(...(result.list ?? []));
    const next = String(result.nextPageCursor ?? '');
    if (!next || next === cursor) break;
    cursor = next;
  }
  const bySymbol = new Map<string, InstrumentMetadata>();
  for (const item of rawRows) {
    if (
      item.status !== 'Trading' ||
      item.quoteCoin !== 'USDT' ||
      item.contractType !== 'LinearPerpetual'
    ) {
      continue;
    }
    const metadata: InstrumentMetadata = {
      symbol: String(item.symbol),
      tickSize: Number(item.priceFilter?.tickSize ?? 0),
      quantityStep: Number(item.lotSizeFilter?.qtyStep ?? 0),
      minimumQuantity: Number(item.lotSizeFilter?.minOrderQty ?? 0),
      minimumNotional: Number(item.lotSizeFilter?.minNotionalValue ?? 0),
      maximumQuantity:
        Number(item.lotSizeFilter?.maxMktOrderQty ?? item.lotSizeFilter?.maxMarketOrderQty ?? item.lotSizeFilter?.maxOrderQty ?? 0) || undefined,
      priceScale: Number(item.priceScale ?? 0) || undefined,
      quantityScale: Number(String(item.lotSizeFilter?.qtyStep ?? '').split('.')[1]?.length ?? 0) || undefined,
    };
    if (
      metadata.symbol &&
      metadata.tickSize > 0 &&
      metadata.quantityStep > 0 &&
      metadata.minimumQuantity > 0
    ) {
      bySymbol.set(metadata.symbol, metadata);
    }
  }
  const rows = [...bySymbol.values()];
  metadataCache = { rows, expiresAt: Date.now() + 30 * 60_000 };
  return rows;
}

export async function getInstrumentMetadata(
  symbol: string,
  forceRefresh = false,
): Promise<InstrumentMetadata> {
  const row = (await instruments(forceRefresh)).find((item) => item.symbol === symbol);
  if (!row) throw new MarketDataError(`Instrument metadata unavailable for ${symbol}`, 'BYBIT', false);
  return row;
}

export async function tickers(): Promise<Ticker[]> {
  const result = await request<{ list?: Array<Record<string, string>> }>(
    '/v5/market/tickers?category=linear',
  );
  return (result.list ?? []).map((item) => {
    const bid = Number(item.bid1Price);
    const ask = Number(item.ask1Price);
    const middle = (ask + bid) / 2;
    return {
      symbol: item.symbol,
      lastPrice: Number(item.lastPrice),
      volume24h: Number(item.volume24h),
      turnover24h: Number(item.turnover24h),
      bid1Price: bid,
      ask1Price: ask,
      spreadBps: middle > 0 ? ((ask - bid) / middle) * 10_000 : 999,
      price24hPcnt: Number(item.price24hPcnt ?? 0),
    };
  });
}

export async function candles(
  symbol: string,
  interval: '5' | '15' | '60',
  limit = 200,
): Promise<Candle[]> {
  const result = await request<{ list?: string[][] }>(
    `/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`,
  );
  const intervalMs = Number(interval) * 60_000;
  const now = Date.now();
  return (result.list ?? [])
    .map((row) => ({
      start: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      turnover: Number(row[6]),
      closed: Number(row[0]) + intervalMs <= now,
    }))
    .filter((row) => row.closed)
    .sort((a, b) => a.start - b.start);
}

export async function orderbook(symbol: string): Promise<OrderBookSnapshot> {
  const result = await request<{ b?: string[][]; a?: string[][]; ts?: number }>(
    `/v5/market/orderbook?category=linear&symbol=${encodeURIComponent(symbol)}&limit=50`,
  );
  const bids = (result.b ?? []).map(([price, quantity]) => ({
    price: Number(price),
    quantity: Number(quantity),
  }));
  const asks = (result.a ?? []).map(([price, quantity]) => ({
    price: Number(price),
    quantity: Number(quantity),
  }));
  const bidDepth = bids.slice(0, 10).reduce((sum, level) => sum + level.price * level.quantity, 0);
  const askDepth = asks.slice(0, 10).reduce((sum, level) => sum + level.price * level.quantity, 0);
  return {
    symbol,
    bids,
    asks,
    bidDepth,
    askDepth,
    depthRatio: askDepth > 0 ? bidDepth / askDepth : 0,
    capturedAt: new Date(result.ts ?? Date.now()).toISOString(),
  };
}

export function clearMarketCachesForTests(): void {
  metadataCache = null;
}
