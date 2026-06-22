import crypto from 'node:crypto';
import { env, validateDemoAcceptance } from '../config/env';
import { exponentialDelay, sleep } from '../runtime/retry';
import type {
  DemoCredentialReadiness,
  DemoExchangeAdapter,
  DemoOrder,
  DemoPosition,
} from '../types/domain';

export type DemoApiErrorCode =
  | 'CREDENTIALS_MISSING'
  | 'AUTHENTICATION'
  | 'TIME_DRIFT'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'HTTP'
  | 'EXCHANGE_REJECTED'
  | 'NETWORK'
  | 'INVALID_RESPONSE';

export class DemoApiError extends Error {
  constructor(
    message: string,
    public readonly code: DemoApiErrorCode,
    public readonly retryable: boolean,
    public readonly exchangeCode?: number,
  ) {
    super(message);
    this.name = 'DemoApiError';
  }
}

interface ClientOptions {
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  retryAttempts?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
}

interface SignedRequestOptions {
  /** Order creation is deliberately not retried after an unknown network outcome. */
  retryUnknownOutcome?: boolean;
}

function stableQuery(params: Record<string, unknown>): string {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, String(value)]);
  return new URLSearchParams(pairs).toString();
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeExchangeError(retCode: number, retMsg: string): DemoApiError {
  if ([10003, 10004, 10005, 10007, 10010, -2015, 33004].includes(retCode)) {
    return new DemoApiError('Bybit Demo authentication or permission check failed', 'AUTHENTICATION', false, retCode);
  }
  if (retCode === 10002) {
    return new DemoApiError('Bybit Demo request timestamp is outside the receive window', 'TIME_DRIFT', true, retCode);
  }
  if (retCode === 10006 || retCode === 429) {
    return new DemoApiError('Bybit Demo API rate limit reached', 'RATE_LIMIT', true, retCode);
  }
  const retryable = [10000, 10016].includes(retCode);
  return new DemoApiError(
    retMsg ? `Bybit Demo request rejected: ${retMsg}` : 'Bybit Demo request rejected',
    'EXCHANGE_REJECTED',
    retryable,
    retCode,
  );
}

export class BybitDemoClient implements DemoExchangeAdapter {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly retryAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private timeOffsetMs = 0;
  private lastTimeSyncAt = 0;
  private readonly recvWindow = 5_000;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? env.demoUrl;
    this.apiKey = options.apiKey ?? env.demoKey;
    this.apiSecret = options.apiSecret ?? env.demoSecret;
    this.timeoutMs = options.timeoutMs ?? env.requestTimeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.retryAttempts = Math.max(1, options.retryAttempts ?? env.workerRetryAttempts);
    this.backoffBaseMs = options.backoffBaseMs ?? env.workerBackoffBaseMs;
    this.backoffMaxMs = options.backoffMaxMs ?? env.workerBackoffMaxMs;
  }

  configured(): boolean {
    return Boolean(this.apiKey && this.apiSecret);
  }

  private requireCredentials(): void {
    if (!this.configured()) {
      throw new DemoApiError(
        'Bybit Demo credentials are not configured',
        'CREDENTIALS_MISSING',
        false,
      );
    }
  }

  async synchronizeTime(force = false): Promise<number> {
    if (!force && this.lastTimeSyncAt > this.now() - 30_000) return this.timeOffsetMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/v5/market/time`, {
        signal: controller.signal,
      });
      if (response.status === 429) {
        throw new DemoApiError('Bybit Demo time endpoint rate limited', 'RATE_LIMIT', true);
      }
      if (!response.ok) {
        throw new DemoApiError(
          `Bybit Demo time endpoint HTTP ${response.status}`,
          response.status === 401 ? 'AUTHENTICATION' : 'HTTP',
          response.status >= 500 || response.status === 429,
        );
      }
      const payload = (await response.json()) as {
        retCode: number;
        retMsg: string;
        time?: number;
        result?: { timeSecond?: string; timeNano?: string };
      };
      if (payload.retCode !== 0) throw normalizeExchangeError(payload.retCode, payload.retMsg);
      const serverTime = payload.time ?? Number(payload.result?.timeSecond ?? 0) * 1000;
      if (!Number.isFinite(serverTime) || serverTime <= 0) {
        throw new DemoApiError('Invalid Bybit Demo server time response', 'INVALID_RESPONSE', false);
      }
      this.timeOffsetMs = serverTime - this.now();
      this.lastTimeSyncAt = this.now();
      return this.timeOffsetMs;
    } catch (error) {
      if (error instanceof DemoApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DemoApiError('Bybit Demo server-time request timed out', 'TIMEOUT', true);
      }
      throw new DemoApiError('Bybit Demo server-time network failure', 'NETWORK', true);
    } finally {
      clearTimeout(timer);
    }
  }

  private signature(timestamp: string, payload: string): string {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(`${timestamp}${this.apiKey}${this.recvWindow}${payload}`)
      .digest('hex');
  }

  private async signedRequestOnce<T>(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const query = method === 'GET' ? stableQuery(params) : '';
    const body = method === 'POST' ? JSON.stringify(params) : '';
    const signingPayload = method === 'GET' ? query : body;
    const timestamp = String(this.now() + this.timeOffsetMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl}${path}${query ? `?${query}` : ''}`,
        {
          method,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-BAPI-API-KEY': this.apiKey,
            'X-BAPI-TIMESTAMP': timestamp,
            'X-BAPI-RECV-WINDOW': String(this.recvWindow),
            'X-BAPI-SIGN': this.signature(timestamp, signingPayload),
          },
          body: method === 'POST' ? body : undefined,
        },
      );
      if (response.status === 429) {
        throw new DemoApiError('Bybit Demo API rate limit reached', 'RATE_LIMIT', true);
      }
      if (response.status === 401) {
        throw new DemoApiError('Bybit Demo authentication failed', 'AUTHENTICATION', false);
      }
      if (!response.ok) {
        throw new DemoApiError(
          `Bybit Demo API HTTP ${response.status}`,
          'HTTP',
          response.status >= 500,
        );
      }
      const payloadBody = (await response.json()) as {
        retCode: number;
        retMsg: string;
        result: T;
      };
      if (payloadBody.retCode !== 0) {
        throw normalizeExchangeError(payloadBody.retCode, payloadBody.retMsg);
      }
      return payloadBody.result;
    } catch (error) {
      if (error instanceof DemoApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DemoApiError('Bybit Demo API request timed out', 'TIMEOUT', true);
      }
      throw new DemoApiError('Bybit Demo API network failure', 'NETWORK', true);
    } finally {
      clearTimeout(timer);
    }
  }

  private async signedRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, unknown> = {},
    options: SignedRequestOptions = {},
  ): Promise<T> {
    this.requireCredentials();
    await this.synchronizeTime();
    const safeToRetryUnknown = options.retryUnknownOutcome ?? method === 'GET';
    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      try {
        return await this.signedRequestOnce<T>(method, path, params);
      } catch (error) {
        if (!(error instanceof DemoApiError)) throw error;
        if (error.code === 'TIME_DRIFT' && attempt < this.retryAttempts) {
          this.lastTimeSyncAt = 0;
          await this.synchronizeTime(true);
          continue;
        }
        const unknownOutcome = ['TIMEOUT', 'NETWORK', 'HTTP'].includes(error.code);
        const mayRetry = error.retryable && (!unknownOutcome || safeToRetryUnknown);
        if (!mayRetry || attempt >= this.retryAttempts) throw error;
        await sleep(exponentialDelay(attempt, this.backoffBaseMs, this.backoffMaxMs));
      }
    }
    throw new DemoApiError('Bybit Demo request retry budget exhausted', 'NETWORK', true);
  }

  async checkCredentialReadiness(): Promise<DemoCredentialReadiness> {
    if (!this.configured()) {
      return {
        status: 'MISSING',
        configured: false,
        verifiedAt: null,
        message: 'Bybit Demo credentials are not configured',
      };
    }
    try {
      await this.synchronizeTime(true);
      const availableBalance = await this.getAvailableBalance();
      return {
        status: 'READY',
        configured: true,
        verifiedAt: new Date().toISOString(),
        availableBalance,
        message: 'Bybit Demo credentials and wallet access verified',
      };
    } catch (error) {
      const normalized = error instanceof DemoApiError ? error : undefined;
      return {
        status: normalized?.code === 'AUTHENTICATION' ? 'INVALID' : 'UNAVAILABLE',
        configured: true,
        verifiedAt: new Date().toISOString(),
        errorCode: normalized?.code ?? 'UNKNOWN',
        message:
          normalized?.code === 'AUTHENTICATION'
            ? 'Bybit Demo credentials were rejected or lack permission'
            : 'Bybit Demo readiness could not be verified',
      };
    }
  }

  async getAvailableBalance(): Promise<number> {
    const result = await this.signedRequest<{ list?: Array<Record<string, string>> }>(
      'GET',
      '/v5/account/wallet-balance',
      { accountType: 'UNIFIED' },
    );
    return toNumber(result.list?.[0]?.totalAvailableBalance);
  }

  private normalizeOrder(raw: Record<string, unknown>): DemoOrder {
    return {
      orderId: String(raw.orderId ?? ''),
      orderLinkId: String(raw.orderLinkId ?? ''),
      symbol: String(raw.symbol ?? ''),
      side: raw.side === 'Sell' ? 'Sell' : 'Buy',
      status: String(raw.orderStatus ?? raw.status ?? ''),
      quantity: toNumber(raw.qty),
      cumulativeFilledQuantity: toNumber(raw.cumExecQty),
      averagePrice: toNumber(raw.avgPrice),
    };
  }

  async findOrderByLinkId(symbol: string, orderLinkId: string): Promise<DemoOrder | null> {
    const query = { category: 'linear', symbol, orderLinkId };
    const realtime = await this.signedRequest<{ list?: Array<Record<string, unknown>> }>(
      'GET',
      '/v5/order/realtime',
      query,
    );
    const row = realtime.list?.[0];
    if (row) return this.normalizeOrder(row);
    const history = await this.signedRequest<{ list?: Array<Record<string, unknown>> }>(
      'GET',
      '/v5/order/history',
      query,
    );
    return history.list?.[0] ? this.normalizeOrder(history.list[0]) : null;
  }

  async placeMarketOrder(input: {
    symbol: string;
    side: 'Buy' | 'Sell';
    quantity: number;
    orderLinkId: string;
  }): Promise<DemoOrder> {
    const result = await this.signedRequest<Record<string, unknown>>(
      'POST',
      '/v5/order/create',
      {
        category: 'linear',
        symbol: input.symbol,
        side: input.side,
        orderType: 'Market',
        qty: String(input.quantity),
        timeInForce: 'IOC',
        positionIdx: 0,
        orderLinkId: input.orderLinkId,
        reduceOnly: false,
      },
      { retryUnknownOutcome: false },
    );
    return {
      orderId: String(result.orderId ?? ''),
      orderLinkId: String(result.orderLinkId ?? input.orderLinkId),
      symbol: input.symbol,
      side: input.side,
      status: 'Created',
      quantity: input.quantity,
      cumulativeFilledQuantity: 0,
      averagePrice: 0,
    };
  }

  async cancelOrder(symbol: string, orderId: string): Promise<void> {
    await this.signedRequest('POST', '/v5/order/cancel', {
      category: 'linear',
      symbol,
      orderId,
    }, { retryUnknownOutcome: true });
  }

  async getPosition(symbol: string): Promise<DemoPosition | null> {
    const result = await this.signedRequest<{ list?: Array<Record<string, unknown>> }>(
      'GET',
      '/v5/position/list',
      { category: 'linear', symbol },
    );
    const raw = result.list?.find((item) => toNumber(item.size) > 0);
    if (!raw) return null;
    return {
      symbol: String(raw.symbol ?? symbol),
      side: raw.side === 'Sell' ? 'Sell' : raw.side === 'Buy' ? 'Buy' : '',
      size: toNumber(raw.size),
      averagePrice: toNumber(raw.avgPrice),
      markPrice: toNumber(raw.markPrice),
      stopLoss: toNumber(raw.stopLoss),
      takeProfit: toNumber(raw.takeProfit),
      unrealizedPnl: toNumber(raw.unrealisedPnl),
      positionIdx: toNumber(raw.positionIdx),
    };
  }

  async setProtection(input: {
    symbol: string;
    stopLoss: number;
    takeProfit: number;
    positionIdx: number;
  }): Promise<void> {
    await this.signedRequest('POST', '/v5/position/trading-stop', {
      category: 'linear',
      symbol: input.symbol,
      tpslMode: 'Full',
      positionIdx: input.positionIdx,
      stopLoss: String(input.stopLoss),
      takeProfit: String(input.takeProfit),
      slTriggerBy: 'MarkPrice',
      tpTriggerBy: 'MarkPrice',
      slOrderType: 'Market',
      tpOrderType: 'Market',
    }, { retryUnknownOutcome: true });
  }

  async closePosition(input: {
    symbol: string;
    side: 'Buy' | 'Sell';
    quantity: number;
    orderLinkId: string;
    positionIdx: number;
  }): Promise<DemoOrder> {
    const closeSide = input.side === 'Buy' ? 'Sell' : 'Buy';
    const result = await this.signedRequest<Record<string, unknown>>(
      'POST',
      '/v5/order/create',
      {
        category: 'linear',
        symbol: input.symbol,
        side: closeSide,
        orderType: 'Market',
        qty: String(input.quantity),
        timeInForce: 'IOC',
        positionIdx: input.positionIdx,
        orderLinkId: input.orderLinkId,
        reduceOnly: true,
      },
      { retryUnknownOutcome: false },
    );
    return {
      orderId: String(result.orderId ?? ''),
      orderLinkId: String(result.orderLinkId ?? input.orderLinkId),
      symbol: input.symbol,
      side: closeSide,
      status: 'Created',
      quantity: input.quantity,
      cumulativeFilledQuantity: 0,
      averagePrice: 0,
    };
  }
}

export function createDemoClient(): BybitDemoClient {
  return new BybitDemoClient();
}

export function demoStatus(): {
  configured: boolean;
  endpoint: string;
  liveVerification: 'PENDING';
  acceptance: { enabled: boolean; symbol: string | null; ready: boolean; reason?: string };
} {
  const acceptance = validateDemoAcceptance();
  return {
    configured: Boolean(env.demoKey && env.demoSecret),
    endpoint: env.demoUrl,
    liveVerification: 'PENDING',
    acceptance: {
      enabled: env.demoAcceptanceEnabled,
      symbol: env.demoAcceptanceSymbol || null,
      ready: acceptance.valid,
      reason: acceptance.reason,
    },
  };
}
