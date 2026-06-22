export type Side = 'LONG' | 'SHORT';
export type Grade = 'A+' | 'A';
export type ExecutionMode = 'DISABLED' | 'LOCAL_PAPER' | 'BYBIT_DEMO';
export type CredentialReadinessStatus =
  | 'MISSING'
  | 'CONFIGURED_UNVERIFIED'
  | 'READY'
  | 'INVALID'
  | 'UNAVAILABLE';
export type StrategyId =
  | 'LIQUIDITY_SCALPING'
  | 'MOMENTUM_BREAKOUT'
  | 'PULLBACK_ENTRY'
  | 'LIQUIDITY_SWEEP'
  | 'EMA_REJECTION'
  | 'PURE_PRICE_ACTION';


export type CircuitBreakerReason =
  | 'MANUAL_PAUSE'
  | 'EMERGENCY_STOP'
  | 'DAILY_LOSS_LIMIT'
  | 'DAILY_PROFIT_LIMIT'
  | 'CONSECUTIVE_LOSS_LIMIT'
  | 'BALANCE_UNAVAILABLE'
  | 'PROTECTION_FAILURE'
  | 'EXCHANGE_UNAVAILABLE';

export interface RiskBlock {
  code: CircuitBreakerReason | 'RISK_LIMIT' | 'AGGREGATE_RISK_LIMIT' | 'DUPLICATE_EXPOSURE' | 'ORDER_LIMIT' | 'RR_LIMIT';
  message: string;
}

export interface RiskTelemetry {
  activeRisk: number;
  availableBalance: number | null;
  plannedRisk: number;
  dailyRealizedPnl: number;
  consecutiveLosses: number;
  blockedEntries: number;
  pauseState: boolean;
  emergencyStopState: boolean;
  circuitBreakerReason: CircuitBreakerReason | null;
  balanceUpdatedAt: string | null;
}

export interface RiskProtectionState {
  day: string;
  dailyBoundaryResetAt: string;
  availableBalance: number | null;
  balanceUpdatedAt: string | null;
  blockedEntries: number;
  blockLogKeys: string[];
  emergencyActivatedAt: string | null;
  emergencyReason: string | null;
}

export type ExecutionState =
  | 'CREATED'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'PROTECTION_PENDING'
  | 'PROTECTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'ERROR'
  | 'CLOSING'
  | 'CLOSED';

export interface Candle {
  start: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
  closed: boolean;
}

export interface Ticker {
  symbol: string;
  lastPrice: number;
  volume24h: number;
  turnover24h: number;
  bid1Price: number;
  ask1Price: number;
  spreadBps: number;
  price24hPcnt: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bidDepth: number;
  askDepth: number;
  depthRatio: number;
  capturedAt: string;
}

export interface InstrumentMetadata {
  symbol: string;
  tickSize: number;
  quantityStep: number;
  minimumQuantity: number;
  minimumNotional: number;
  maximumQuantity?: number;
  priceScale?: number;
  quantityScale?: number;
}

export interface StrategyEvidence {
  rule: string;
  passed: boolean;
  value?: string | number | boolean;
  threshold?: string | number | boolean;
  note?: string;
}

export interface MarketQualityMetrics {
  turnover24h: number;
  volume24h: number;
  spreadBps: number;
  bidDepth: number;
  askDepth: number;
  totalDepth: number;
  depthRatio: number;
  liquidityScore: number;
  volatilityPct: number;
  freshnessMs: { '1h': number; '15m': number; '5m': number };
}

export interface SignalEvidenceSummary {
  timeframeAlignment: string;
  entryReason: string;
  stopReason: string;
  targetReason: string;
  scoreBreakdown: { raw: number; passedRules: number; totalRules: number; capped: boolean };
  candleTimestamps: { '1h': number; '15m': number; '5m': number };
}

export interface MarketSnapshot {
  trend1h: 'UP' | 'DOWN' | 'SIDEWAYS';
  setup15m: string;
  entry5m: string;
  spreadBps: number;
  depthRatio: number;
  capturedAt: string;
  marketQuality?: MarketQualityMetrics;
}

export interface StrategyContext {
  symbol: string;
  candles1h: Candle[];
  candles15m: Candle[];
  candles5m: Candle[];
  ticker: Ticker;
  orderBook: OrderBookSnapshot;
  instrument: InstrumentMetadata;
  capturedAt: string;
  marketQuality: MarketQualityMetrics;
}

export interface Candidate {
  symbol: string;
  side: Side;
  strategy: StrategyId;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  /** Backward-compatible full-close target. The current execution policy closes fully at TP1. */
  takeProfit: number;
  rr: number;
  score: number;
  grade: Grade;
  confirmations: string[];
  rejectionReasons: string[];
  evidence: StrategyEvidence[];
  snapshot: MarketSnapshot;
  instrument: InstrumentMetadata;
  triggerCandle: number;
  marketQuality: MarketQualityMetrics;
  signalEvidence: SignalEvidenceSummary;
}

export interface StrategyEvaluation {
  strategy: StrategyId;
  eligible: boolean;
  side: Side | null;
  entry: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  rr: number | null;
  score: number;
  grade: Grade | null;
  rejectionReasons: string[];
  evidence: StrategyEvidence[];
  candidate?: Candidate;
}

export interface Signal extends Candidate {
  id: string;
  createdAt: string;
  expiresAt: string;
  confluenceStrategies: StrategyId[];
}

export interface RiskValidation {
  ok: boolean;
  reason?: string;
  block?: RiskBlock;
  quantity?: number;
  plannedRisk?: number;
  riskBudget?: number;
  feesEstimate?: number;
  slippageEstimate?: number;
  notional?: number;
  roundedEntry?: number;
  roundedStopLoss?: number;
  roundedTp1?: number;
  roundedTp2?: number;
  roundedTp3?: number;
}

export interface ExecutionConfirmations {
  orderSubmitted: boolean;
  fillConfirmed: boolean;
  positionConfirmed: boolean;
  stopLossConfirmed: boolean;
  takeProfitConfirmed: boolean;
}

export interface QueueItem {
  id: string;
  signalId: string;
  symbol: string;
  state: ExecutionState;
  reason?: string;
  createdAt: string;
  updatedAt: string;
  validatedAt?: string;
  idempotencyKey: string;
  orderLinkId: string;
  attempts: number;
  validation?: RiskValidation;
  confirmations: ExecutionConfirmations;
}

export interface ExecutionRecord {
  id: string;
  queueId: string;
  signalId: string;
  symbol: string;
  mode: Exclude<ExecutionMode, 'DISABLED'>;
  state: ExecutionState;
  idempotencyKey: string;
  orderLinkId: string;
  exchangeOrderId?: string;
  requestedQuantity: number;
  filledQuantity: number;
  averageFillPrice?: number;
  positionSize?: number;
  stopLoss?: number;
  takeProfit?: number;
  confirmations: ExecutionConfirmations;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export type TargetStatus = 'PENDING' | 'HIT' | 'SKIPPED';
export type StopStatus = 'ACTIVE' | 'BREAKEVEN' | 'HIT' | 'FAILED';
export type TargetPolicy = 'FULL_CLOSE_TP1';

export interface Trade {
  id: string;
  mode: Exclude<ExecutionMode, 'DISABLED'>;
  symbol: string;
  side: Side;
  strategy: StrategyId;
  grade: Grade;
  score: number;
  entry: number;
  currentPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  takeProfit: number;
  quantity: number;
  initialQuantity: number;
  remainingQuantity: number;
  targetPolicy: TargetPolicy;
  tpStatus: { tp1: TargetStatus; tp2: TargetStatus; tp3: TargetStatus };
  stopStatus: StopStatus;
  breakevenConfirmedAt?: string;
  plannedRisk: number;
  rr: number;
  status: 'ACTIVE' | 'PROTECTION_ERROR';
  protectionSource: 'LOCAL_ENGINE' | 'BYBIT_EXCHANGE';
  protectionConfirmedAt: string;
  openedAt: string;
  updatedAt: string;
  unrealizedPnl: number;
  signalId: string;
  queueId: string;
  executionId: string;
  exchangeOrderId?: string;
  orderLinkId: string;
}

export interface JournalRecord extends Trade {
  exit: number;
  grossPnl: number;
  fees: number;
  slippage: number;
  netPnl: number;
  achievedRR: number;
  closeReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MANUAL_CLOSE' | 'EXCHANGE_POSITION_CLOSED';
  closedAt: string;
}

export interface ExecutionTelemetry {
  queuedExecutions: number;
  submitting: number;
  submitted: number;
  partialFills: number;
  protectedTrades: number;
  protectionFailures: number;
  reconciliationRetries: number;
  duplicateSubmissionsBlocked: number;
  closeAttempts: number;
  closeFailures: number;
  finalizedTrades: number;
}

export interface PaperAccount {
  startingBalance: number;
  availableBalance: number;
  realizedPnl: number;
}

export interface DemoOrder {
  orderId: string;
  orderLinkId: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  status: string;
  quantity: number;
  cumulativeFilledQuantity: number;
  averagePrice: number;
}

export interface DemoPosition {
  symbol: string;
  side: 'Buy' | 'Sell' | '';
  size: number;
  averagePrice: number;
  markPrice: number;
  stopLoss: number;
  takeProfit: number;
  unrealizedPnl: number;
  positionIdx: number;
}

export interface DemoCredentialReadiness {
  status: CredentialReadinessStatus;
  configured: boolean;
  verifiedAt: string | null;
  availableBalance?: number;
  errorCode?: string;
  message: string;
}

export interface DemoExchangeAdapter {
  getAvailableBalance(): Promise<number>;
  findOrderByLinkId(symbol: string, orderLinkId: string): Promise<DemoOrder | null>;
  placeMarketOrder(input: {
    symbol: string;
    side: 'Buy' | 'Sell';
    quantity: number;
    orderLinkId: string;
  }): Promise<DemoOrder>;
  cancelOrder(symbol: string, orderId: string): Promise<void>;
  getPosition(symbol: string): Promise<DemoPosition | null>;
  setProtection(input: {
    symbol: string;
    stopLoss: number;
    takeProfit: number;
    positionIdx: number;
  }): Promise<void>;
  closePosition(input: {
    symbol: string;
    side: 'Buy' | 'Sell';
    quantity: number;
    orderLinkId: string;
    positionIdx: number;
  }): Promise<DemoOrder>;
}
