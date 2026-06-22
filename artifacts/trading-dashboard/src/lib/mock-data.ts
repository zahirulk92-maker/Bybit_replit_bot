export const mockDashboardStats = {
  equity: 125430.50,
  todayPnl: 1432.25,
  winRate: 68.5,
  activeTrades: 4,
  signalsToday: 24,
  botStatus: "Running" as const,
  drawdownUsed: 12.5
};

export const mockRecentTrades = [
  { id: "T-101", symbol: "BTCUSDT", side: "LONG", pnl: 450.2, time: "10:24:12" },
  { id: "T-102", symbol: "ETHUSDT", side: "SHORT", pnl: -120.5, time: "09:15:44" },
  { id: "T-103", symbol: "SOLUSDT", side: "LONG", pnl: 85.0, time: "08:45:10" },
  { id: "T-104", symbol: "XRPUSDT", side: "LONG", pnl: -12.4, time: "07:30:05" },
  { id: "T-105", symbol: "BNBUSDT", side: "SHORT", pnl: 155.8, time: "06:12:33" }
];

export const mockActivePositions = [
  { id: "P-01", symbol: "BTCUSDT", side: "LONG", entry: 64200.5, current: 64500.0, qty: 0.5, unrealized: 149.75, pnlPercent: 0.46, sl: 63000, tp: 66000, duration: "2h 15m" },
  { id: "P-02", symbol: "ETHUSDT", side: "SHORT", entry: 3450.0, current: 3420.5, qty: 10, unrealized: 295.0, pnlPercent: 0.85, sl: 3500, tp: 3350, duration: "4h 10m" },
  { id: "P-03", symbol: "SOLUSDT", side: "LONG", entry: 142.5, current: 141.0, qty: 100, unrealized: -150.0, pnlPercent: -1.05, sl: 135, tp: 155, duration: "1h 05m" },
  { id: "P-04", symbol: "DOGEUSDT", side: "LONG", entry: 0.150, current: 0.155, qty: 50000, unrealized: 250.0, pnlPercent: 3.33, sl: 0.140, tp: 0.170, duration: "0h 45m" }
];

export const mockSignals = [
  { id: "SIG-801", symbol: "AVAXUSDT", direction: "LONG", strategy: "Momentum Breakout", confidence: 85, entry: 35.5, sl: 34.0, tp: 38.0, status: "Pending", time: "11:05:00" },
  { id: "SIG-802", symbol: "BTCUSDT", direction: "SHORT", strategy: "Mean Reversion", confidence: 72, entry: 64800, sl: 65500, tp: 63000, status: "Executed", time: "10:20:15" },
  { id: "SIG-803", symbol: "ETHUSDT", direction: "LONG", strategy: "Trend Follow", confidence: 91, entry: 3400, sl: 3350, tp: 3500, status: "Executed", time: "09:12:44" },
  { id: "SIG-804", symbol: "XRPUSDT", direction: "SHORT", strategy: "VWAP Cross", confidence: 65, entry: 0.62, sl: 0.64, tp: 0.58, status: "Rejected", time: "08:05:12" },
  { id: "SIG-805", symbol: "SOLUSDT", direction: "LONG", strategy: "Momentum Breakout", confidence: 88, entry: 140, sl: 135, tp: 150, status: "Expired", time: "07:30:00" },
];

export const mockScanner = [
  { symbol: "BTCUSDT", price: 64500.0, change24h: 2.4, volume: "1.2B", rsi: 65.4, macd: "Bullish", trend: "Up", score: 85, action: "Monitor" },
  { symbol: "ETHUSDT", price: 3420.5, change24h: 1.2, volume: "850M", rsi: 55.2, macd: "Neutral", trend: "Side", score: 55, action: "Hold" },
  { symbol: "SOLUSDT", price: 141.0, change24h: -3.5, volume: "420M", rsi: 35.8, macd: "Bearish", trend: "Down", score: 25, action: "Avoid" },
  { symbol: "XRPUSDT", price: 0.615, change24h: -0.5, volume: "150M", rsi: 48.0, macd: "Neutral", trend: "Side", score: 45, action: "Hold" },
  { symbol: "BNBUSDT", price: 580.0, change24h: 4.5, volume: "320M", rsi: 72.5, macd: "Bullish", trend: "Up", score: 92, action: "Buy" },
  { symbol: "DOGEUSDT", price: 0.155, change24h: 8.2, volume: "890M", rsi: 78.2, macd: "Bullish", trend: "Up", score: 95, action: "Buy" },
  { symbol: "AVAXUSDT", price: 35.5, change24h: -1.2, volume: "120M", rsi: 42.1, macd: "Bearish", trend: "Side", score: 38, action: "Hold" },
  { symbol: "LINKUSDT", price: 18.5, change24h: 0.8, volume: "95M", rsi: 51.5, macd: "Bullish", trend: "Up", score: 62, action: "Monitor" },
];

export const mockExecutions = [
  { id: "ORD-991", symbol: "BTCUSDT", side: "BUY", type: "Market", qty: 0.5, price: 64200.5, status: "Filled", response: "Success", time: "10:24:12" },
  { id: "ORD-992", symbol: "ETHUSDT", side: "SELL", type: "Limit", qty: 10, price: 3450.0, status: "Filled", response: "Success", time: "09:15:44" },
  { id: "ORD-993", symbol: "SOLUSDT", side: "BUY", type: "Market", qty: 100, price: 142.5, status: "Filled", response: "Success", time: "08:45:10" },
  { id: "ORD-994", symbol: "XRPUSDT", side: "SELL", type: "Limit", qty: 5000, price: 0.65, status: "Pending", response: "Accepted", time: "08:15:00" },
  { id: "ORD-995", symbol: "BNBUSDT", side: "BUY", type: "Market", qty: 5, price: 585.0, status: "Rejected", response: "Insufficient Margin", time: "07:30:05" },
  { id: "ORD-996", symbol: "DOGEUSDT", side: "BUY", type: "Market", qty: 50000, price: 0.150, status: "Filled", response: "Success", time: "07:15:22" },
  { id: "ORD-997", symbol: "AVAXUSDT", side: "SELL", type: "Limit", qty: 200, price: 38.0, status: "Cancelled", response: "User Cancelled", time: "06:45:11" },
  { id: "ORD-998", symbol: "LINKUSDT", side: "BUY", type: "Limit", qty: 150, price: 18.0, status: "Pending", response: "Accepted", time: "06:10:00" },
];

export const mockLogs = [
  { id: 1, level: "INFO", message: "Bot started successfully", time: "00:00:01" },
  { id: 2, level: "DEBUG", message: "Connecting to Bybit DEMO stream...", time: "00:00:05" },
  { id: 3, level: "INFO", message: "Websocket connected", time: "00:00:06" },
  { id: 4, level: "INFO", message: "Market data synchronized for 42 pairs", time: "00:00:15" },
  { id: 5, level: "WARN", message: "High latency detected on ticker stream (>500ms)", time: "02:15:44" },
  { id: 6, level: "INFO", message: "Signal generated: SIG-804 XRPUSDT SHORT", time: "08:05:12" },
  { id: 7, level: "ERROR", message: "Order rejected: Insufficient Margin (ORD-995)", time: "07:30:05" },
  { id: 8, level: "INFO", message: "Risk parameter updated: Max Drawdown 15%", time: "09:00:00" },
];

export const mockPnlChartData = [
  { time: "00:00", pnl: 0 },
  { time: "02:00", pnl: 150 },
  { time: "04:00", pnl: 120 },
  { time: "06:00", pnl: -50 },
  { time: "08:00", pnl: 340 },
  { time: "10:00", pnl: 850 },
  { time: "12:00", pnl: 1100 },
  { time: "14:00", pnl: 1432.25 },
];
