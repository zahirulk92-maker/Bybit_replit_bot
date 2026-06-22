import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Trade } from '../types';

export default function ActiveTrades() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const load = () => api.trades().then(setTrades);
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <h1>Active Trades</h1>
      {trades.length ? (
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Mode</th>
              <th>Status</th>
              <th>Entry</th>
              <th>SL</th>
              <th>TP1</th>
              <th>PnL</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <td>{trade.symbol}</td>
                <td>{trade.mode}</td>
                <td>{trade.status}</td>
                <td>{trade.entry}</td>
                <td>{trade.stopLoss}</td>
                <td>{trade.tp1}</td>
                <td>{trade.unrealizedPnl.toFixed(2)}</td>
                <td><button onClick={async () => { await api.closeTrade(trade.id); load(); }}>Full Close</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">No active trades.</div>
      )}
    </>
  );
}
