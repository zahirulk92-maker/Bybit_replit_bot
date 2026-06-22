# Bybit Insw Bot (B Bot)

React/Vite operator console with a modular TypeScript/Express backend for Bybit public-data scanning, deterministic Local Paper validation, and an authenticated Bybit Demo execution boundary.

## Safety baseline

- Scanner is always **OFF after every process restart** and must be started manually.
- `TRADING_MODE=DISABLED` is the default.
- There is no automatic fallback between `DISABLED`, `LOCAL_PAPER`, and `BYBIT_DEMO`.
- `LOCAL_PAPER` requires `LOCAL_PAPER_ENABLED=true`; it never submits exchange orders.
- Bybit Demo credentials remain backend-only and are never returned to the React frontend or logs.
- There is no Testnet, Binance, Supabase, or real-money execution mode.
- No signal, balance, order, position, or trade success is fabricated.

## Phase 3 production hardening

- Six independent strategy modules are connected to the scanner and generate their own evidence, rejection reasons, score, grade, entry, SL, and TP1/TP2/TP3.
- Instrument metadata is paginated and applies tick size, quantity step, minimum quantity, minimum notional, and maximum market quantity.
- Demo requests use server-time synchronization, HMAC signing, bounded retries, exponential backoff, normalized authentication/rate-limit/timeout errors, and idempotent `orderLinkId` recovery.
- A Demo trade is not active until order, fill, position, exchange SL, and exchange TP are confirmed.
- Reconciliation handles partial fills, timeout outcomes, delayed responses, missing positions, missing protection, restart recovery, and duplicate retries without overlapping cycles.
- Scanner ranking includes liquidity, turnover, volume, spread, order-book depth, momentum, and volatility quality. Only closed 1H/15M/5M candles reach the strategy layer.
- Runtime workers are separate from scanner control, process-isolated, retry-bounded, and shut down gracefully.

## Controlled Demo acceptance

Acceptance execution is never automatic and has no frontend button. It requires all of the following:

1. `TRADING_MODE=BYBIT_DEMO`
2. Valid backend-only Demo credentials
3. `BYBIT_DEMO_ACCEPTANCE_ENABLED=true`
4. Exactly one `BYBIT_DEMO_ACCEPTANCE_SYMBOL`
5. An existing qualified queue item for that symbol
6. An explicit backend request header: `x-bbot-demo-acceptance: RUN_DEMO_ACCEPTANCE`

The acceptance path uses the smallest valid quantity that satisfies instrument minimums, available balance, 1% risk, minimum 1:2 RR, duplicate protection, and maximum market quantity. It does not create a fake signal.

## Run

```bash
npm ci
npm run replit
```

Replit uses one process on port `3001`: production Vite assets are built, then served by the Express backend. No second Vite process is started.

## Validation commands

```bash
npm run check
npm run qa:routes
npm run acceptance:scanner
```

`qa:routes` expects a running production server. `acceptance:scanner` performs a manual public-market cycle without enabling the scheduled scanner.

## Free-host limitation

A sleeping free host cannot guarantee continuous scans or reconciliation. Every Bybit Demo position must have exchange-side SL and TP confirmed before it is reported as protected. Authenticated Demo verification remains pending until valid credentials are securely supplied through environment variables.

## Phase 5 — Scanner & Signal Quality Hardening

The scanner now applies deterministic turnover/volume/spread/depth ranking, market-quality gates, fully closed and fresh 1H/15M/5M candle validation, incomplete-OHLC rejection, volatility suitability checks, and structured telemetry. Qualified signals expose market-quality metrics, candle timestamps, timeframe alignment, entry/stop/target reasons, and score-breakdown evidence. Any failed evidence rule caps the score below the A threshold, preventing additive score inflation. Existing grading, risk, execution, persistence, and startup rules are unchanged.

## Phase 6 — Execution and Trade Management

The execution lifecycle now persists `CLOSING` and `CLOSED` states in addition to the entry/protection states. The approved target policy remains `FULL_CLOSE_TP1`; TP1, TP2 and TP3 values and statuses are stored, but no unapproved partial-close percentages are invented. TP1 closes the full remaining position, while TP2 and TP3 are marked skipped in the finalized journal.

Confirmed exchange position size is authoritative for protection and reconciliation. A position larger than the confirmed fill is rejected, partial fills protect only the confirmed size, missing protection remains blocked until exchange confirmation, manual close uses deterministic opposite-side reduce-only execution, and journal/PnL finalization is idempotent.

## Phase 7 — Risk Control & Emergency Protection

- Per-trade risk remains capped at 1% and aggregate open risk is capped by `MAX_AGGREGATE_OPEN_RISK_PCT`.
- Pause blocks new signal/queue creation and execution validation while existing trade reconciliation continues.
- Emergency stop is persisted, forces scanner OFF, clears new signals, cancels only safe `CREATED` entries, and requires explicit audited reset.
- Daily realized loss, daily realized profit, and consecutive-loss circuit breakers reset only at the UTC daily boundary.
- Risk telemetry is available from `/api/status`; blocked entries use structured codes and are logged once per entry context.


## Phase 8 — Persistence, Recovery, Logs & Reporting

- Runtime schema version: `6`, with backward migration and explicit future-version rejection.
- State writes use fsynced temporary files, atomic replacement, and a last-known-valid `.bak` file.
- Corrupt primary state is quarantined and recovered from backup; if neither is valid, startup is fail-safe with empty trading state and no fabricated balances, signals, trades, or PnL.
- Restart recovery keeps pause/emergency state and active/in-flight records while forcing the scanner OFF.
- Structured logs include category, event code, symbol and execution/trade references, redact sensitive values, and use configurable `LOG_MAX_RECORDS` retention. Journal records are never pruned as logs.
- Operational report: `GET /api/reporting/operational`.
- Exports: `GET /api/exports/journal.csv`, `GET /api/exports/logs.csv`, and `GET /api/exports/logs.json`.

## Phase 9 — Integration and Stability Validation

Phase 9 adds cross-module acceptance coverage without changing approved scanner, strategy, risk, or execution policy. It fixes atomic Local Paper finalization so journal, finalized-trade telemetry, realized PnL, and available balance are persisted in one state write. Operational reporting now distinguishes active queued entries from historical queue records. Deterministic integration tests cover signal-to-journal flow, duplicate close/finalization protection, recovery from each nonterminal execution state, and repeated bounded runtime reporting cycles. Live Bybit results remain pending unless secure credentials and network access are available.

## Phase 10 — Deployment readiness and handover

Production startup now fails closed when the execution-mode configuration is invalid or when built frontend assets are missing. Manual execution also revalidates the configured mode, so `LOCAL_PAPER` cannot run unless `LOCAL_PAPER_ENABLED=true`. The npm production and test commands are cross-platform and do not require shell-specific environment syntax.

Use one Replit command only:

```bash
npm run replit
```

Complete environment, persistent-storage, single-instance, safe-start, Demo acceptance, backup, rollback, and known-limitation instructions are in [`DEPLOYMENT_HANDOVER.md`](./DEPLOYMENT_HANDOVER.md).
