import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, validateMode } from './config/env';
import { log, safeErrorMessage } from './persistence/store';
import { recoverPersistedState } from './runtime/recovery';
import { startRuntimeWorkers, stopRuntimeWorkers } from './runtime/workers';
import { api } from './routes/api';
import { stopScanner } from './scanner/engine';
import { startupReadiness } from './runtime/startup';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const startup = startupReadiness({
  modeValidation: validateMode(),
  production: process.env.NODE_ENV === 'production',
  productionIndexExists: fs.existsSync(path.join(dist, 'index.html')),
});
if (!startup.valid) {
  console.error(`STARTUP_BLOCKED: ${startup.reason}`);
  process.exit(1);
}

recoverPersistedState();
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api', api);

if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((request, response, next) => {
    if (request.method === 'GET' && !request.path.startsWith('/api')) {
      return response.sendFile(path.join(dist, 'index.html'));
    }
    return next();
  });
}

const server = app.listen(env.port, '0.0.0.0', () => {
  log('SERVER_START', 'Server started with scanner OFF', {
    port: env.port,
    executionMode: env.mode,
  });
  startRuntimeWorkers();
  console.log(`Bybit Ops listening on ${env.port}; scanner OFF; mode ${env.mode}`);
});

let shuttingDown = false;
async function gracefulShutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    log('SERVER_SHUTDOWN', 'Graceful shutdown started', { signal });
  } catch {
    // The process must still shut down if persistence is unavailable.
  }
  stopScanner();
  await stopRuntimeWorkers();
  const hardStop = setTimeout(() => process.exit(exitCode || 1), env.workerShutdownGraceMs + 2_000);
  hardStop.unref();
  server.close(() => {
    clearTimeout(hardStop);
    process.exit(exitCode);
  });
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (error) => {
  try {
    log('PROCESS_UNHANDLED_REJECTION', 'Unhandled rejection isolated at process boundary', {
      error: safeErrorMessage(error),
    }, 'ERROR');
  } catch {
    // Do not expose raw error details to stdout.
  }
});
process.on('uncaughtException', (error) => {
  try {
    log('PROCESS_UNCAUGHT_EXCEPTION', 'Uncaught exception triggered graceful shutdown', {
      error: safeErrorMessage(error),
    }, 'ERROR');
  } catch {
    // Best-effort persistence only.
  }
  void gracefulShutdown('UNCAUGHT_EXCEPTION', 1);
});
