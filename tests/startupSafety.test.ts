import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModeConfiguration } from '../server/config/env';
import { startupReadiness } from '../server/runtime/startup';

test('startup blocks unsupported modes and disabled Local Paper configuration', () => {
  assert.deepEqual(
    validateModeConfiguration({ mode: 'UNKNOWN', paperEnabled: false, demoKey: '', demoSecret: '' }),
    { valid: false, reason: 'Unsupported TRADING_MODE UNKNOWN' },
  );
  assert.deepEqual(
    validateModeConfiguration({ mode: 'LOCAL_PAPER', paperEnabled: false, demoKey: '', demoSecret: '' }),
    { valid: false, reason: 'LOCAL_PAPER requires LOCAL_PAPER_ENABLED=true' },
  );
});

test('startup blocks Bybit Demo without both backend credentials', () => {
  assert.equal(
    validateModeConfiguration({ mode: 'BYBIT_DEMO', paperEnabled: false, demoKey: 'key', demoSecret: '' }).valid,
    false,
  );
  assert.equal(
    validateModeConfiguration({ mode: 'BYBIT_DEMO', paperEnabled: false, demoKey: 'key', demoSecret: 'secret' }).valid,
    true,
  );
});

test('production startup requires built frontend assets', () => {
  assert.deepEqual(
    startupReadiness({
      modeValidation: { valid: true },
      production: true,
      productionIndexExists: false,
    }),
    {
      valid: false,
      reason: 'Production frontend assets are missing. Run npm run build before npm start.',
    },
  );
  assert.equal(
    startupReadiness({
      modeValidation: { valid: true },
      production: true,
      productionIndexExists: true,
    }).valid,
    true,
  );
});
