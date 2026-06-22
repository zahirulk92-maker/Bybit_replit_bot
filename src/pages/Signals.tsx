import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Signal } from '../types';

export default function Signals() {
  const [rows, setRows] = useState<Signal[]>([]);
  useEffect(() => {
    api.signals().then(setRows);
  }, []);
  return (
    <>
      <h1>Active Signals</h1>
      {rows.length ? (
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Strategy</th>
              <th>Grade</th>
              <th>Score</th>
              <th>RR</th>
              <th>Entry</th>
              <th>SL</th>
              <th>TP1 / TP2 / TP3</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.symbol}</td>
                <td>{row.side}</td>
                <td>{row.strategy}</td>
                <td>{row.grade}</td>
                <td>{row.score}</td>
                <td>{row.rr.toFixed(2)}</td>
                <td>{row.entry}</td>
                <td>{row.stopLoss}</td>
                <td>{row.tp1} / {row.tp2} / {row.tp3}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">No qualified A+/A signals. No fake rows are shown.</div>
      )}
    </>
  );
}
