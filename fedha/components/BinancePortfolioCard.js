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

  const connected = data?.configured;
  const top = (data?.assets || []).filter((a) => a.usdtValue != null && a.usdtValue >= 0.01).slice(0, 3);
  const extra = Math.max(0, (data?.assets?.length || 0) - top.length);

  return (
    <div className="card" style={{ padding: 16, marginBottom: 14, borderColor: 'rgba(217,182,111,.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: 11, background: 'rgba(217,182,111,.14)', color: '#D9B66F', fontSize: 19, fontWeight: 800 }}>₿</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Binance</div>
          <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 2 }}>{loading ? 'Refreshing…' : connected ? 'Spot + Earn · USDT estimate' : 'Not connected'}</div>
        </div>
        <button onClick={refresh} disabled={loading} className="btn-ghost" style={{ padding: '6px 9px', fontSize: 12 }}>{loading ? '…' : '↻'}</button>
      </div>

      <div className="font-num" style={{ fontSize: 26, fontWeight: 800, marginTop: 12 }}>
        {connected ? `$${number(data.totalUsdt)}` : 'Connect Binance'}
      </div>
      {error && <div style={{ color: 'var(--text-3)', fontSize: 11, lineHeight: 1.5, marginTop: 4 }}>{error}</div>}

      {connected && top.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {top.map((a) => (
            <span key={a.asset} className="font-num" style={{ fontSize: 11, padding: '4px 9px', borderRadius: 999, background: 'var(--card-2)', color: 'var(--text-2)' }}>
              {a.asset} ${number(a.usdtValue)}
            </span>
          ))}
          {extra > 0 && <span style={{ fontSize: 11, padding: '4px 9px', color: 'var(--text-3)' }}>+{extra} more</span>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <Link href="/binance" style={{ color: 'var(--green)', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>Assets →</Link>
        <Link href="/trading" style={{ color: 'var(--text-2)', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>Trading →</Link>
      </div>
    </div>
  );
}
