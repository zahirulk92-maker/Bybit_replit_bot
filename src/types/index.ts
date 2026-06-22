export type ExecutionMode = 'DISABLED' | 'LOCAL_PAPER' | 'BYBIT_DEMO';
export type Grade = 'A+' | 'A';
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

export interface ScannerStatus {
  enabled: boolean;
  running: boolean;
  lastScanAt: string | null;
  nextScanAt: string | null;
  eligibleSymbols: number;
  rankedSymbols: number;
  lastError: string | null;
}

export interface Signal {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  strategy: string;
  grade: Grade;
  score: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  takeProfit: number;
  rr: number;
  expiresAt: string;
  confirmations: string[];
  createdAt: string;
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
  attempts: number;
}

export interface Trade {
  id: string;
  mode: Exclude<ExecutionMode, 'DISABLED'>;
  symbol: string;
  side: 'LONG' | 'SHORT';
  strategy: string;
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
  targetPolicy: 'FULL_CLOSE_TP1';
  tpStatus: { tp1: 'PENDING' | 'HIT' | 'SKIPPED'; tp2: 'PENDING' | 'HIT' | 'SKIPPED'; tp3: 'PENDING' | 'HIT' | 'SKIPPED' };
  stopStatus: 'ACTIVE' | 'BREAKEVEN' | 'HIT' | 'FAILED';
  plannedRisk: number;
  rr: number;
  status: 'ACTIVE' | 'PROTECTION_ERROR';
  openedAt: string;
  unrealizedPnl: number;
}

export interface JournalRecord extends Trade {
  exit: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  achievedRR: number;
  closeReason: string;
  closedAt: string;
}

export interface StrategyMetric {
  id: string;
  name: string;
  totalTrades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number;
  netPnl: number;
  averageRR: number;
  profitFactor: number;
  aPlusTrades: number;
  aTrades: number;
  currentStreak: string;
  lastTrade: string | null;
  status: string;
}
