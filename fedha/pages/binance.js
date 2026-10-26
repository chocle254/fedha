import { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';

function money(value, digits = 2) {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function BinancePage() {
  const { currency } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/binance/balances', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load Binance balances.');
      setData(result);
      setUpdated(new Date());
      if (!result.configured) setError(result.error || 'Binance is not connected yet.');
    } catch (err) {
      setError(err.message || 'Unable to load Binance balances.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Layout fab={false}>
      <div className="page" style={{ padding: '24px 20px 100px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>BUSINESS · INVESTMENTS</div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Binance Portfolio</h1>
            <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>Your Spot wallet balances, read-only. No trades or withdrawals are made here.</p>
          </div>
          <button className="btn-ghost" onClick={load} disabled={loading} style={{ whiteSpace: 'nowrap' }}>{loading ? 'Refreshing…' : '↻ Refresh'}</button>
        </div>

        <div className="card" style={{ padding: 20, marginBottom: 16, background: 'linear-gradient(135deg, var(--card), var(--card-2))' }}>
          <div style={{ color: 'var(--text-3)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>Estimated Spot portfolio value</div>
          <div className="font-num" style={{ fontSize: 30, fontWeight: 800, marginTop: 8 }}>
            {data?.configured ? `≈ $${money(data.totalUsdt)} USDT` : '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
            {updated ? `Updated ${updated.toLocaleTimeString()}` : 'Waiting for connection'}
          </div>
        </div>

        {error && (
          <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: 'rgba(245,158,11,.35)' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{data?.configured === false ? 'Connect Binance' : 'Connection notice'}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{error}</div>
            {data?.configured === false && <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 0 }}>In Vercel → Project Settings → Environment Variables, add BINANCE_API_KEY and BINANCE_API_SECRET. Use a read-only key with withdrawals and trading disabled. Never paste the secret into Luxe chat, browser code, or GitHub.</p>}
          </div>
        )}

        <div className="section-title" style={{ margin: '22px 0 12px' }}>Assets</div>
        {loading && !data ? <div className="card" style={{ padding: 18, color: 'var(--text-2)' }}>Loading your Binance balances…</div> :
          data?.assets?.length ? (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {data.assets.map((asset, index) => (
                <div key={asset.asset} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: index === data.assets.length - 1 ? 0 : '1px solid var(--border)' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--card-2)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{asset.asset.slice(0, 4)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{asset.asset}</div>
                    <div className="font-num" style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 3 }}>{money(asset.free, 8)} available{asset.locked > 0 ? ` · ${money(asset.locked, 8)} locked` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="font-num" style={{ fontWeight: 700 }}>{asset.usdtValue == null ? '—' : `$${money(asset.usdtValue)}`}</div>
                    <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 3 }}>{asset.usdtValue == null ? 'Price unavailable' : 'Estimated USDT value'}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : !loading && data?.configured ? <div className="card" style={{ padding: 18, color: 'var(--text-2)' }}>No Spot assets with a balance were returned.</div> : null}
        {data?.unpricedAssetCount > 0 && <p style={{ color: 'var(--text-3)', fontSize: 12 }}>{data.unpricedAssetCount} asset(s) do not have a directly available USDT trading price and are excluded from the estimated total.</p>}
        <p style={{ color: 'var(--text-3)', fontSize: 11, lineHeight: 1.5, marginTop: 18 }}>Portfolio totals are estimates based on available Binance Spot trading prices. This first version does not include Funding, Earn, or Futures wallets.</p>
      </div>
    </Layout>
  );
}
