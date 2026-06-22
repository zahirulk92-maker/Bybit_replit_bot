import { state, safeErrorMessage } from '../server/persistence/store';
import { runScan, scanner } from '../server/scanner/engine';

scanner.enabled = false;

try {
  const result = await runScan();
  const duplicates = state.signals.length - new Set(state.signals.map((signal) => signal.symbol)).size;
  const summary = {
    status: 'PASS',
    scannerEnabled: result.enabled,
    eligibleSymbols: result.eligibleSymbols,
    depthQualifiedSymbols: result.depthQualifiedSymbols,
    rankedSymbols: result.rankedSymbols,
    evaluatedSymbols: result.evaluatedSymbols,
    symbolFailures: result.symbolFailures,
    closedCandleViolations: result.closedCandleViolations,
    activeSignals: state.signals.length,
    duplicateSignalSymbols: duplicates,
  };
  if (summary.scannerEnabled) throw new Error('Scanner acceptance must not enable the scheduled scanner');
  if (summary.rankedSymbols !== 50) throw new Error(`Expected 50 ranked symbols, received ${summary.rankedSymbols}`);
  if (summary.closedCandleViolations !== 0) throw new Error('Open-candle usage detected');
  if (summary.activeSignals > 20) throw new Error('More than 20 signals were accepted');
  if (summary.duplicateSignalSymbols > 0) throw new Error('Duplicate active signal symbols detected');
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: 'BLOCKED',
    reason: safeErrorMessage(error),
    scannerEnabled: scanner.enabled,
    activeSignals: state.signals.length,
    activeTrades: state.trades.length,
  }, null, 2));
  process.exitCode = 2;
}
