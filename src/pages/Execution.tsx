import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { QueueItem } from '../types';

export default function Execution() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const load = () => api.queue().then(setQueue);
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <h1>Entry Queue</h1>
      {queue.length ? (
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Execution State</th>
              <th>Attempts</th>
              <th>Reason</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((item) => (
              <tr key={item.id}>
                <td>{item.symbol}</td>
                <td>{item.state}</td>
                <td>{item.attempts}</td>
                <td>{item.reason || '—'}</td>
                <td>
                  <button onClick={async () => { await api.validateEntry(item.id); load(); }}>Validate</button>{' '}
                  <button onClick={async () => { await api.executeEntry(item.id); load(); }}>Execute</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">Entry queue is empty.</div>
      )}
    </>
  );
}
