import { candles, tickers } from '../market/bybitPublic';
import { detectTrend } from '../strategies/common';
import type { Signal } from '../types/domain';

export async function revalidateSignalMarket(signal: Signal): Promise<{ ok: boolean; reason?: string }> {
  if (new Date(signal.expiresAt).getTime() <= Date.now()) {
    return { ok: false, reason: 'Signal expired before execution' };
  }
  const [tickerRows, candles1h, candles5m] = await Promise.all([
    tickers(),
    candles(signal.symbol, '60', 80),
    candles(signal.symbol, '5', 40),
  ]);
  const ticker = tickerRows.find((row) => row.symbol === signal.symbol);
  if (!ticker || ticker.lastPrice <= 0) return { ok: false, reason: 'Fresh market price unavailable' };
  const drift = Math.abs(ticker.lastPrice - signal.entry) / signal.entry;
  if (drift > 0.005) return { ok: false, reason: `Entry-zone drift ${(drift * 100).toFixed(2)}% exceeds 0.50%` };
  const trend = detectTrend(candles1h);
  if ((signal.side === 'LONG' && trend !== 'UP') || (signal.side === 'SHORT' && trend !== 'DOWN')) {
    return { ok: false, reason: '1H trend no longer supports the signal' };
  }
  const last5m = candles5m.at(-1);
  if (!last5m) return { ok: false, reason: 'Fresh closed 5M candle unavailable' };
  const confirmed = signal.side === 'LONG' ? last5m.close > last5m.open : last5m.close < last5m.open;
  if (!confirmed) return { ok: false, reason: 'Fresh 5M entry confirmation failed' };
  return { ok: true };
}
