# Bybit Insw Bot — Deployment and Handover

## Approved operating boundary

This repository supports only:

- `TRADING_MODE=DISABLED` — default and safest first startup.
- `TRADING_MODE=LOCAL_PAPER` — deterministic local simulation, only when `LOCAL_PAPER_ENABLED=true`.
- `TRADING_MODE=BYBIT_DEMO` — Bybit Demo only, with backend-only credentials.

There is no Binance, Bybit Testnet, Bybit mainnet, Supabase, or real-money execution path. The scanner always starts **OFF** after every process restart. There is no automatic execution-mode fallback.

## 1. Local installation

Requirements: Node.js 20 or newer, npm, outbound HTTPS/DNS access to the configured Bybit hosts, and a writable persistent directory.

```bash
npm ci
cp .env.example .env
npm run replit
```

On Windows PowerShell, copy the file with:

```powershell
Copy-Item .env.example .env
npm run replit
```

Open `http://127.0.0.1:3001`. The production command builds the Vite frontend and serves it from the Express backend. A separate Vite development server is not required.

## 2. Replit deployment

Use exactly one run command:

```bash
npm run replit
```

The repository `.replit` file maps local port `3001` to external port `80`. Do not add a second Vite, frontend, or web workflow. The Express process serves both `/api/*` and the built frontend routes.

Deploy only as a **single application instance**. Multiple instances must not share the same runtime-state file because the JSON persistence layer is single-writer and is not a distributed database.

The deployment must provide writable persistent storage. Set `RUNTIME_STATE_FILE` to a durable path available to the deployed process. If the host does not preserve that path across restart or redeploy, journal, logs, emergency state, queue state, and recovery records can be lost.

This app has no built-in user authentication. Keep the deployment private or place it behind trusted platform access control. Do not expose the operator console or mutation endpoints as an unrestricted public service.

## 3. Required environment variables

Start with `.env.example`. Keep all values in backend environment variables or Replit Secrets; never place credentials in `src/`, browser storage, frontend build variables, Git, logs, screenshots, or support messages.

| Variable | Safe/default value | Purpose |
|---|---:|---|
| `PORT` | `3001` | Backend and frontend HTTP port. Replit may override it. |
| `RUNTIME_STATE_FILE` | `data/runtime.json` | Writable persistent runtime-state path. |
| `TRADING_MODE` | `DISABLED` | `DISABLED`, `LOCAL_PAPER`, or `BYBIT_DEMO`. |
| `LOCAL_PAPER_ENABLED` | `false` | Must be `true` before Local Paper can start. |
| `BYBIT_PUBLIC_API_URL` | `https://api.bybit.com` | Public market-data host. |
| `BYBIT_DEMO_API_URL` | `https://api-demo.bybit.com` | Authenticated Bybit Demo host. |
| `BYBIT_DEMO_API_KEY` | empty | Backend-only Demo API key. |
| `BYBIT_DEMO_API_SECRET` | empty | Backend-only Demo API secret. |
| `BYBIT_DEMO_ACCEPTANCE_ENABLED` | `false` | Explicit live Demo acceptance gate. |
| `BYBIT_DEMO_ACCEPTANCE_SYMBOL` | empty | One approved `...USDT` symbol for acceptance. |
| `BYBIT_REQUEST_TIMEOUT_MS` | `10000` | Exchange request timeout. |
| `RECONCILIATION_INTERVAL_MS` | `15000` | Demo reconciliation interval. |
| `LIFECYCLE_INTERVAL_MS` | `10000` | Local Paper lifecycle interval. |
| `WORKER_RETRY_ATTEMPTS` | `3` | Bounded worker attempts. |
| `WORKER_BACKOFF_BASE_MS` | `500` | Retry base delay. |
| `WORKER_BACKOFF_MAX_MS` | `5000` | Retry maximum delay. |
| `WORKER_SHUTDOWN_GRACE_MS` | `10000` | Graceful-shutdown wait. |
| `SCANNER_CONCURRENCY` | `4` | Bounded scanner concurrency. |
| `SCANNER_DEPTH_SHORTLIST` | `80` | Depth-ranking shortlist. |
| `PAPER_STARTING_BALANCE` | `10000` | Local Paper starting balance. |
| `EXECUTION_FEE_RATE` | `0.0006` | Existing fee model. |
| `EXECUTION_SLIPPAGE_RATE` | `0.0002` | Existing slippage model. |
| `MAX_RISK_PER_TRADE_PCT` | `1` | Maximum per-trade risk. |
| `MAX_AGGREGATE_OPEN_RISK_PCT` | `5` | Aggregate open-risk limit. |
| `MAX_DAILY_REALIZED_LOSS` | `300` | Daily loss circuit breaker. |
| `MAX_DAILY_REALIZED_PROFIT` | `500` | Daily profit circuit breaker. |
| `MAX_CONSECUTIVE_LOSSES` | `3` | Consecutive-loss circuit breaker. |
| `BALANCE_STALE_MS` | `60000` | Balance freshness limit. |
| `LOG_MAX_RECORDS` | `2000` | Structured-log retention. |

Invalid execution configuration blocks production startup with a `STARTUP_BLOCKED` message. It never falls back to another mode.

## 4. Safe first startup

1. Keep `TRADING_MODE=DISABLED`.
2. Keep `LOCAL_PAPER_ENABLED=false`.
3. Keep Demo credentials empty.
4. Run `npm run replit`.
5. Verify `GET /api/health` and `GET /api/status`.
6. Confirm `scanner.enabled=false`, `pauseNewEntries=false` unless recovered, and the expected emergency-stop state.
7. Review persistence paths in `/api/status` before operating.

## 5. Scanner controls

- **Start Scanner**: enables scheduled scans and performs an immediate cycle.
- **Stop Scanner**: blocks future scheduled scans and new scanner cycles; existing trade management continues.
- **Run Now**: performs one manual public-market scan without changing the persisted restart rule.

The scanner is process-local and always returns to OFF after restart. Emergency stop blocks scanner start and new scans.

## 6. Pause and Emergency Stop

- **Pause** blocks new signal/queue acceptance and execution while existing trade reconciliation and protection management continue.
- **Emergency Stop** persists, forces the scanner OFF, clears new signals, cancels only safe unsubmitted entries, and continues management of existing Demo positions.
- **Emergency Clear** is an explicit operator action. A restart does not clear emergency stop.

## 7. Local Paper activation

Local Paper is already supported. Activate it only after a successful disabled-mode startup:

```env
TRADING_MODE=LOCAL_PAPER
LOCAL_PAPER_ENABLED=true
```

Restart the single process. There is no automatic Local Paper activation. Local Paper never submits exchange orders.

## 8. Bybit Demo activation

Configure only in backend secrets:

```env
TRADING_MODE=BYBIT_DEMO
BYBIT_DEMO_API_KEY=<secret>
BYBIT_DEMO_API_SECRET=<secret>
```

The host must resolve and reach the configured Demo host over outbound HTTPS. Do not use Bybit Testnet or mainnet URLs. Restart, inspect `/api/status`, and run the readiness verification endpoint. Never paste credentials into logs or reports.

## 9. Demo acceptance procedure

Authenticated acceptance is deliberately gated and must not run automatically.

1. Use a Bybit Demo account and least-privilege Demo API credentials.
2. Set `TRADING_MODE=BYBIT_DEMO`.
3. Set `BYBIT_DEMO_ACCEPTANCE_ENABLED=true`.
4. Set exactly one `BYBIT_DEMO_ACCEPTANCE_SYMBOL`.
5. Start the server and keep the scanner under operator control.
6. Obtain a real qualified queue item for the approved symbol; do not fabricate one.
7. Call the backend acceptance endpoint with the required confirmation header documented in `README.md`.
8. Confirm order, fill, position, exchange SL, and exchange TP. A trade is never protected without all confirmations.
9. Confirm reconciliation and controlled close, then disable acceptance again.

Without secure credentials and working network access, record this step as **PENDING**, not PASS.

## 10. Logs, journal, and exports

- Operational report: `GET /api/reporting/operational`
- Journal: `GET /api/journal`
- Logs: `GET /api/logs`
- Journal CSV: `GET /api/exports/journal.csv`
- Logs CSV: `GET /api/exports/logs.csv`
- Logs JSON: `GET /api/exports/logs.json`

Logs are retention-bounded and secret-redacted. Journal records are not pruned by log retention.

## 11. Backup and recovery

The runtime state is written atomically to `RUNTIME_STATE_FILE`. The previous valid primary is kept as `<RUNTIME_STATE_FILE>.bak`. A corrupt primary is quarantined and recovery attempts the backup. If neither file is valid, startup uses an empty fail-safe trading state and reports the recovery warning.

Back up the primary and `.bak` together while the process is stopped. Never edit either file while the app is running.

## 12. Known limitations

- Authenticated Bybit Demo evidence is not available without credentials and network access.
- Public market scanning depends on Bybit Public DNS, HTTPS, availability, rate limits, and regional access.
- The JSON state store requires one process and one writer; horizontal scaling is unsupported.
- Continuous scanning/reconciliation cannot be guaranteed on a host that sleeps or suspends the process.
- The app has no built-in user authentication; external/private access control is required.
- The app contains no mainnet real-money execution path.

## 13. Live Demo verification checklist

- [ ] Private/supervised deployment confirmed
- [ ] Single instance confirmed
- [ ] Persistent state path confirmed
- [ ] Bybit Public DNS/HTTPS reachable
- [ ] Bybit Demo DNS/HTTPS reachable
- [ ] Backend-only Demo credentials configured
- [ ] Credentials absent from browser, API responses, logs, source, and test output
- [ ] Demo readiness returns authenticated success
- [ ] One approved real qualified queue item used
- [ ] Duplicate submission protection observed
- [ ] Fill and exact position size confirmed
- [ ] Exchange SL confirmed
- [ ] Exchange TP confirmed
- [ ] Trade becomes active only after all confirmations
- [ ] Reconciliation survives restart with scanner OFF
- [ ] Controlled full close and exactly-once journal/PnL confirmed
- [ ] Acceptance flag disabled after verification

## 14. Rollback procedure

1. Stop the process cleanly.
2. Preserve the current runtime primary and `.bak` files.
3. Restore the previous approved repository ZIP.
4. Restore the matching environment variables without exposing secrets.
5. Restore the matching runtime state only when its schema version is supported.
6. Start with `TRADING_MODE=DISABLED` and `npm run replit`.
7. Verify health, status, scanner OFF, emergency state, persistence status, routes, and exports.
8. Re-enable Local Paper or Bybit Demo only through an explicit configuration change and restart.
