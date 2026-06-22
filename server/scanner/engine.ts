import { env } from '../config/env';
import { candles, instruments, orderbook, tickers } from '../market/bybitPublic';
import { log, state } from '../persistence/store';
import { acceptCandidates } from '../signals/engine';
import { evaluateStrategies } from '../strategies/engine';
import type {
  Candidate,
  Candle,
  InstrumentMetadata,
  OrderBookSnapshot,
  Signal,
  StrategyContext,
  StrategyEvaluation,
  Ticker,
  MarketQualityMetrics,
} from '../types/domain';

export const scanner = {
  enabled: false,
  running: false,
  lastScanAt: null as string | null,
  nextScanAt: null as string | null,
  eligibleSymbols: 0,
  depthQualifiedSymbols: 0,
  rankedSymbols: 0,
  evaluatedSymbols: 0,
  symbolFailures: 0,
  closedCandleViolations: 0,
  lastError: null as string | null,
  symbolsDiscovered: 0,
  symbolsShortlisted: 0,
  rejectedSetups: 0,
  acceptedSignals: 0,
  apiFailures: 0,
  staleCandleViolations: 0,
  scanDurationMs: 0,
};

export interface ScannerDependencies {
  instruments: () => Promise<InstrumentMetadata[]>;
  tickers: () => Promise<Ticker[]>;
  candles: (symbol: string, interval: '5' | '15' | '60', limit?: number) => Promise<Candle[]>;
  orderbook: (symbol: string) => Promise<OrderBookSnapshot>;
  evaluate: (context: StrategyContext) => StrategyEvaluation[];
  accept: (candidates: Candidate[]) => Signal[];
}

export interface ScanOptions {
  marketLimit?: number;
  depthShortlist?: number;
  concurrency?: number;
}

const productionDependencies: ScannerDependencies = {
  instruments,
  tickers,
  candles,
  orderbook,
  evaluate: evaluateStrategies,
  accept: acceptCandidates,
};

let timer: NodeJS.Timeout | undefined;

export function baseMarketScore(row: Ticker): number {
  const liquidity = Math.log10(Math.max(row.turnover24h, 1)) * 5;
  const volume = Math.log10(Math.max(row.volume24h, 1)) * 2;
  const spread = Math.max(0, 20 - row.spreadBps * 2);
  const absoluteMomentum = Math.abs(row.price24hPcnt) * 100;
  const momentumQuality = absoluteMomentum >= 0.5 && absoluteMomentum <= 12 ? 8 : 2;
  const volatilityQuality = absoluteMomentum <= 20 ? 6 : 0;
  return liquidity + volume + spread + momentumQuality + volatilityQuality;
}

export function depthMarketScore(book: OrderBookSnapshot): number {
  const totalDepth = Math.max(book.bidDepth + book.askDepth, 1);
  const depth = Math.log10(totalDepth) * 4;
  const ratio = book.depthRatio > 0 ? Math.min(book.depthRatio, 1 / book.depthRatio) : 0;
  return depth + ratio * 8;
}

async function mapWithConcurrency<T, R>(
  rows: T[],
  concurrency: number,
  worker: (row: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(rows.length);
  let cursor = 0;
  const pool = Array.from({ length: Math.min(Math.max(1, concurrency), rows.length) }, async () => {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(rows[index], index);
    }
  });
  await Promise.all(pool);
  return results;
}

function onlyClosed(candlesRows: Candle[]): boolean {
  return candleSeriesValid(candlesRows);
}

function lastCandleFreshness(rows: Candle[], intervalMs: number, now = Date.now()): number {
  const last = rows.at(-1);
  return last ? Math.max(0, now - (last.start + intervalMs)) : Number.POSITIVE_INFINITY;
}

function candleSeriesValid(rows: Candle[]): boolean {
  return rows.length > 0 && rows.every((row) =>
    row.closed && Number.isFinite(row.open) && Number.isFinite(row.high) &&
    Number.isFinite(row.low) && Number.isFinite(row.close) && Number.isFinite(row.volume) &&
    row.high >= Math.max(row.open, row.close) && row.low <= Math.min(row.open, row.close)
  );
}

export function buildMarketQuality(
  ticker: Ticker,
  book: OrderBookSnapshot,
  candles1h: Candle[],
  candles15m: Candle[],
  candles5m: Candle[],
  now = Date.now(),
): MarketQualityMetrics {
  const closes = candles15m.slice(-20).map((row) => row.close);
  const averageClose = closes.reduce((sum, value) => sum + value, 0) / Math.max(closes.length, 1);
  const averageRange = candles15m.slice(-20).reduce((sum, row) => sum + (row.high - row.low), 0) / Math.max(Math.min(candles15m.length, 20), 1);
  const totalDepth = book.bidDepth + book.askDepth;
  const depthBalance = book.depthRatio > 0 ? Math.min(book.depthRatio, 1 / book.depthRatio) : 0;
  const liquidityScore = Math.max(0, Math.min(100,
    Math.log10(Math.max(ticker.turnover24h, 1)) * 8 +
    Math.log10(Math.max(totalDepth, 1)) * 6 +
    depthBalance * 20 - ticker.spreadBps * 3
  ));
  return {
    turnover24h: ticker.turnover24h,
    volume24h: ticker.volume24h,
    spreadBps: ticker.spreadBps,
    bidDepth: book.bidDepth,
    askDepth: book.askDepth,
    totalDepth,
    depthRatio: book.depthRatio,
    liquidityScore: Number(liquidityScore.toFixed(2)),
    volatilityPct: averageClose > 0 ? Number(((averageRange / averageClose) * 100).toFixed(4)) : 0,
    freshnessMs: {
      '1h': lastCandleFreshness(candles1h, 60 * 60_000, now),
      '15m': lastCandleFreshness(candles15m, 15 * 60_000, now),
      '5m': lastCandleFreshness(candles5m, 5 * 60_000, now),
    },
  };
}

export function marketQualityRejections(quality: MarketQualityMetrics): string[] {
  const reasons: string[] = [];
  if (quality.turnover24h < 1_000_000) reasons.push('24h turnover below liquidity floor');
  if (quality.volume24h <= 0) reasons.push('24h trading volume unavailable');
  if (quality.spreadBps > 10) reasons.push('Abnormal spread above 10 bps');
  if (quality.totalDepth < 10_000) reasons.push('Order-book depth below safety floor');
  if (quality.depthRatio < 0.2 || quality.depthRatio > 5) reasons.push('Order-book imbalance indicates unstable liquidity');
  if (quality.liquidityScore < 55) reasons.push('Liquidity quality score below 55');
  if (quality.volatilityPct < 0.05 || quality.volatilityPct > 5) reasons.push('Volatility outside suitable range');
  if (quality.freshnessMs['1h'] > 125 * 60_000 || quality.freshnessMs['15m'] > 35 * 60_000 || quality.freshnessMs['5m'] > 15 * 60_000) {
    reasons.push('Stale candle data detected');
  }
  return reasons;
}

export async function runScanWithDependencies(
  dependencies: ScannerDependencies,
  options: ScanOptions = {},
): Promise<typeof scanner> {
  if (scanner.running) throw new Error('Overlapping scan prevented');
  scanner.running = true;
  scanner.lastError = null;
  scanner.evaluatedSymbols = 0;
  scanner.symbolFailures = 0;
  scanner.closedCandleViolations = 0;
  scanner.staleCandleViolations = 0;
  scanner.rejectedSetups = 0;
  scanner.acceptedSignals = 0;
  scanner.apiFailures = 0;
  const scanStartedAt = Date.now();
  const marketLimit = options.marketLimit ?? 50;
  const depthShortlist = Math.max(marketLimit, options.depthShortlist ?? env.scannerDepthShortlist);
  const concurrency = options.concurrency ?? env.scannerConcurrency;

  try {
    const [metadataRows, tickerRows] = await Promise.all([
      dependencies.instruments(),
      dependencies.tickers(),
    ]);
    scanner.eligibleSymbols = metadataRows.length;
    scanner.symbolsDiscovered = metadataRows.length;
    const metadataBySymbol = new Map(metadataRows.map((row) => [row.symbol, row]));
    const tickerShortlist = tickerRows
      .filter(
        (row) =>
          metadataBySymbol.has(row.symbol) &&
          row.lastPrice > 0 &&
          row.bid1Price > 0 &&
          row.ask1Price > 0 &&
          row.turnover24h >= 1_000_000 &&
          row.volume24h > 0 &&
          row.spreadBps <= 10,
      )
      .sort((a, b) => baseMarketScore(b) - baseMarketScore(a) || a.symbol.localeCompare(b.symbol))
      .slice(0, depthShortlist);

    scanner.symbolsShortlisted = tickerShortlist.length;
    const depthRows = await mapWithConcurrency(tickerShortlist, concurrency, async (ticker) => {
      try {
        return { ticker, book: await dependencies.orderbook(ticker.symbol), error: null as string | null };
      } catch (error) {
        scanner.symbolFailures += 1;
        scanner.apiFailures += 1;
        const message = error instanceof Error ? error.message : String(error);
        log('DEPTH_SELECTION_ERROR', `Skipped ${ticker.symbol} during depth ranking`, {
          symbol: ticker.symbol,
          error: message,
        }, 'WARNING');
        return { ticker, book: null, error: message };
      }
    });

    const ranked = depthRows
      .filter((row): row is { ticker: Ticker; book: OrderBookSnapshot; error: null } => Boolean(row.book))
      .sort(
        (a, b) =>
          baseMarketScore(b.ticker) + depthMarketScore(b.book) -
          (baseMarketScore(a.ticker) + depthMarketScore(a.book)) ||
          a.ticker.symbol.localeCompare(b.ticker.symbol),
      )
      .slice(0, marketLimit);
    scanner.depthQualifiedSymbols = depthRows.filter((row) => row.book).length;
    scanner.rankedSymbols = ranked.length;

    const evaluations = await mapWithConcurrency(ranked, concurrency, async ({ ticker, book }) => {
      try {
        const [candles1h, candles15m, candles5m] = await Promise.all([
          dependencies.candles(ticker.symbol, '60'),
          dependencies.candles(ticker.symbol, '15'),
          dependencies.candles(ticker.symbol, '5'),
        ]);
        if (!onlyClosed(candles1h) || !onlyClosed(candles15m) || !onlyClosed(candles5m)) {
          scanner.closedCandleViolations += 1;
          throw new Error('QUALITY: Open, missing, or incomplete candle detected; symbol rejected');
        }
        const marketQuality = buildMarketQuality(ticker, book, candles1h, candles15m, candles5m);
        const qualityRejections = marketQualityRejections(marketQuality);
        if (qualityRejections.includes('Stale candle data detected')) scanner.staleCandleViolations += 1;
        if (qualityRejections.length) {
          scanner.rejectedSetups += 1;
          throw new Error(`QUALITY: ${qualityRejections.join('; ')}`);
        }
        const rows = dependencies.evaluate({
          symbol: ticker.symbol,
          candles1h,
          candles15m,
          candles5m,
          ticker,
          orderBook: book,
          instrument: metadataBySymbol.get(ticker.symbol)!,
          capturedAt: new Date().toISOString(),
          marketQuality,
        });
        scanner.evaluatedSymbols += 1;
        return { ticker, rows, error: null as string | null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const qualityRejection = message.startsWith('QUALITY:');
        if (qualityRejection) scanner.rejectedSetups += 1;
        else {
          scanner.symbolFailures += 1;
          scanner.apiFailures += 1;
        }
        log(qualityRejection ? 'MARKET_QUALITY_REJECTED' : 'SYMBOL_SCAN_ERROR', `Skipped ${ticker.symbol}`, {
          symbol: ticker.symbol,
          error: message,
        }, 'WARNING');
        return { ticker, rows: [] as StrategyEvaluation[], error: message };
      }
    });

    for (const result of evaluations) {
      if (result.error) continue;
      const qualified = result.rows
        .map((evaluation) => evaluation.candidate)
        .filter((candidate): candidate is Candidate => Boolean(candidate));
      scanner.rejectedSetups += result.rows.filter((row) => !row.eligible).length;
      for (const evaluation of result.rows.filter((row) => !row.eligible)) {
        log('STRATEGY_REJECTED', `${evaluation.strategy} rejected ${result.ticker.symbol}`, {
          score: evaluation.score,
          grade: evaluation.grade,
          reasons: evaluation.rejectionReasons.join('; '),
        });
      }
      scanner.acceptedSignals += dependencies.accept(qualified).length;
    }

    scanner.lastScanAt = new Date().toISOString();
    scanner.nextScanAt = scanner.enabled
      ? new Date(Date.now() + 4 * 60 * 60_000).toISOString()
      : null;
    log('SCAN_COMPLETE', 'Full eligible-market scan completed', {
      eligible: scanner.eligibleSymbols,
      depthQualified: scanner.depthQualifiedSymbols,
      ranked: scanner.rankedSymbols,
      evaluated: scanner.evaluatedSymbols,
      failures: scanner.symbolFailures,
      closedCandleViolations: scanner.closedCandleViolations,
      staleCandleViolations: scanner.staleCandleViolations,
      rejectedSetups: scanner.rejectedSetups,
      acceptedSignals: scanner.acceptedSignals,
      apiFailures: scanner.apiFailures,
      durationMs: Date.now() - scanStartedAt,
    });
    scanner.scanDurationMs = Date.now() - scanStartedAt;
    return scanner;
  } catch (error) {
    scanner.lastError = error instanceof Error ? error.message : String(error);
    log('SCAN_ERROR', 'Scanner failed', { error: scanner.lastError }, 'ERROR');
    throw error;
  } finally {
    scanner.scanDurationMs = Date.now() - scanStartedAt;
    scanner.running = false;
  }
}

export function runScan(): Promise<typeof scanner> {
  if (state.emergencyStop) return Promise.reject(new Error('Emergency stop blocks new scans'));
  return runScanWithDependencies(productionDependencies);
}

export function startScanner(): typeof scanner {
  if (state.emergencyStop) { scanner.enabled = false; scanner.nextScanAt = null; return scanner; }
  scanner.enabled = true;
  scanner.nextScanAt = new Date().toISOString();
  void runScan().catch(() => undefined);
  if (timer) clearInterval(timer);
  timer = setInterval(() => void runScan().catch(() => undefined), 4 * 60 * 60_000);
  timer.unref();
  return scanner;
}

export function stopScanner(): typeof scanner {
  scanner.enabled = false;
  scanner.nextScanAt = null;
  if (timer) clearInterval(timer);
  timer = undefined;
  return scanner;
}

export function scannerProductionDependenciesForTests(): ScannerDependencies {
  return productionDependencies;
}
