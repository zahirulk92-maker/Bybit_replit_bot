import test from 'node:test';
import assert from 'node:assert/strict';
import { BybitDemoClient } from '../server/execution/bybitDemo';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('missing Demo credentials return readiness MISSING without any network request', async () => {
  let calls = 0;
  const client = new BybitDemoClient({
    apiKey: '',
    apiSecret: '',
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({});
    },
  });
  const readiness = await client.checkCredentialReadiness();
  assert.equal(readiness.status, 'MISSING');
  assert.equal(readiness.configured, false);
  assert.equal(calls, 0);
});

test('invalid Demo credentials return normalized INVALID readiness without credential leakage', async () => {
  const secret = 'never-log-this-secret';
  let calls = 0;
  const client = new BybitDemoClient({
    apiKey: 'invalid-key',
    apiSecret: secret,
    retryAttempts: 1,
    fetchImpl: async (input) => {
      calls += 1;
      if (String(input).endsWith('/v5/market/time')) {
        return jsonResponse({ retCode: 0, retMsg: 'OK', time: Date.now(), result: {} });
      }
      return jsonResponse({ retCode: 10003, retMsg: `invalid ${secret}`, result: {} });
    },
  });
  const readiness = await client.checkCredentialReadiness();
  assert.equal(readiness.status, 'INVALID');
  assert.equal(readiness.errorCode, 'AUTHENTICATION');
  assert.doesNotMatch(readiness.message, /never-log-this-secret|invalid-key/);
  assert.equal(calls, 2);
});

test('server-time drift forces resynchronization and bounded retry', async () => {
  let timeCalls = 0;
  let walletCalls = 0;
  const client = new BybitDemoClient({
    apiKey: 'key',
    apiSecret: 'secret',
    retryAttempts: 3,
    backoffBaseMs: 1,
    backoffMaxMs: 1,
    now: () => 1_700_000_000_000,
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith('/v5/market/time')) {
        timeCalls += 1;
        return jsonResponse({ retCode: 0, retMsg: 'OK', time: 1_700_000_000_100 + timeCalls, result: {} });
      }
      walletCalls += 1;
      if (walletCalls === 1) {
        return jsonResponse({ retCode: 10002, retMsg: 'time window', result: {} });
      }
      return jsonResponse({ retCode: 0, retMsg: 'OK', result: { list: [{ totalAvailableBalance: '50' }] } });
    },
  });
  assert.equal(await client.getAvailableBalance(), 50);
  assert.equal(timeCalls, 2);
  assert.equal(walletCalls, 2);
});
