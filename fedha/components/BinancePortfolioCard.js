import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

function number(value) {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BinancePortfolioCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/binance/balances', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load Binance.');
      setData(result);
      if (!result.configured) setError(result.error || 'Binance is not connected.');
    } catch (err) {
      setError(err.message || 'Could not load Binance.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="card" style={{ padding: '16px', marginBottom: 14, borderColor: 'rgba(217,182,111,.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 13, background: 'rgba(217,182,111,.14)', color: '#D9B66F', fontSize: 22, fontWeight: 800 }}>₿</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Binance Spot</div>
          <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 3 }}>{loading ? 'Refreshing portfolio…' : data?.configured ? `${data.assets?.length || 0} assets · live price estimate` : 'Not connected yet'}</div>
        </div>
        <button onClick={refresh} disabled={loading} className="btn-ghost" style={{ padding: '6px 9px', fontSize: 12 }}>{loading ? '…' : '↻'}</button>
      </div>
      <div className="font-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 14 }}>
        {data?.configured ? `≈ $${number(data.totalUsdt)} USDT` : 'Connect Binance'}
      </div>
      {error && <div style={{ color: 'var(--text-3)', fontSize: 11, lineHeight: 1.5, marginTop: 5 }}>{error}</div>}
      <Link href="/binance" style={{ display: 'inline-flex', marginTop: 12, color: 'var(--green)', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>View assets and connection details →</Link>
      <div style={{ color: 'var(--text-3)', fontSize: 10, lineHeight: 1.4, marginTop: 7 }}>Shown separately from cash wallets to avoid double-counting. USDT estimate, not yet included in cash balance history.</div>
    </div>
  );
}
