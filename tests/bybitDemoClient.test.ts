import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { BybitDemoClient, DemoApiError } from '../server/execution/bybitDemo';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('Bybit Demo client synchronizes server time and signs backend-only requests', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const apiKey = 'test-api-key';
  const apiSecret = 'test-api-secret';
  const now = 1_699_999_999_000;
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith('/v5/market/time')) {
      return jsonResponse({ retCode: 0, retMsg: 'OK', time: 1_700_000_000_000, result: {} });
    }
    return jsonResponse({
      retCode: 0,
      retMsg: 'OK',
      result: { list: [{ totalAvailableBalance: '1234.56' }] },
    });
  };
  const client = new BybitDemoClient({
    baseUrl: 'https://api-demo.bybit.com',
    apiKey,
    apiSecret,
    fetchImpl: fakeFetch,
    now: () => now,
  });

  const balance = await client.getAvailableBalance();
  assert.equal(balance, 1234.56);
  assert.equal(requests.length, 2);
  const signed = requests[1];
  assert.match(signed.url, /accountType=UNIFIED/);
  const headers = signed.init?.headers as Record<string, string>;
  const timestamp = '1700000000000';
  const expected = crypto
    .createHmac('sha256', apiSecret)
    .update(`${timestamp}${apiKey}5000accountType=UNIFIED`)
    .digest('hex');
  assert.equal(headers['X-BAPI-TIMESTAMP'], timestamp);
  assert.equal(headers['X-BAPI-API-KEY'], apiKey);
  assert.equal(headers['X-BAPI-SIGN'], expected);
  assert.notEqual(headers['X-BAPI-SIGN'], apiSecret);
});

test('Bybit Demo client normalizes rate-limit errors without exposing credentials', async () => {
  const client = new BybitDemoClient({
    apiKey: 'private-key-value',
    apiSecret: 'private-secret-value',
    fetchImpl: async () => jsonResponse({}, 429),
  });
  await assert.rejects(
    client.getAvailableBalance(),
    (error: unknown) => {
      assert.ok(error instanceof DemoApiError);
      assert.equal(error.code, 'RATE_LIMIT');
      assert.equal(error.retryable, true);
      assert.doesNotMatch(error.message, /private-key-value|private-secret-value/);
      return true;
    },
  );
});
