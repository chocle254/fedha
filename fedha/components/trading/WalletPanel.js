import { useCallback, useEffect, useState } from 'react';
import { C, fmtUsd, fmtPrice, fmtQty } from './util';

const COLORS = ['#F0B90B', '#0ECB81', '#5B9BFF', '#B98CFF', '#F6465D', '#848E9C'];
function hue(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 55% 45%)`; }

// Your real Binance Spot wallet (read-only), laid out like the Binance app's asset overview.
export default function WalletPanel({ onTrade }) {
  const [data, setData] = useState(null);
  const [changes, setChanges] = useState({});
  const [loading, setLoading] = useState(true);
  const [hideSmall, setHideSmall] = useState(true);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, p] = await Promise.all([fetch('/api/binance/balances', { cache: 'no-store' }).then((r) => r.json()), fetch('/api/trading/pairs').then((r) => r.json()).catch(() => ({}))]);
      setData(b);
      const map = {};
      for (const [s, last, ch] of p.pairs || []) map[s] = { last, ch };
      setChanges(map);
    } catch { setData({ error: 'Could not load your Binance wallet.' }); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);

  if (loading && !data) return <div className="tx-empty">Loading your Binance wallet…</div>;
  if (!data?.configured) {
    return (
      <div className="tx-empty" style={{ textAlign: 'left' }}>
        <b style={{ color: '#EAECEF' }}>Connect Binance (read-only)</b><br />
        {data?.error || 'Binance is not connected yet.'} In Vercel → Settings → Environment Variables add <code>BINANCE_API_KEY</code> and <code>BINANCE_API_SECRET</code> from a key with trading and withdrawals turned off.
      </div>
    );
  }

  const assets = (data.assets || []).map((a) => {
    const ch = a.asset === 'USDT' ? 0 : changes[`${a.asset}USDT`]?.ch;
    const pnl = a.usdtValue != null && ch != null ? a.usdtValue - a.usdtValue / (1 + ch / 100) : 0;
    return { ...a, ch, pnl, price: a.asset === 'USDT' ? 1 : changes[`${a.asset}USDT`]?.last };
  });
  const shown = hideSmall ? assets.filter((a) => (a.usdtValue ?? 0) >= 1) : assets;
  const total = Number(data.totalUsdt) || 0;
  const todayPnl = assets.reduce((s, a) => s + a.pnl, 0);
  const todayPct = total - todayPnl > 0 ? (todayPnl / (total - todayPnl)) * 100 : 0;
  const top = assets.filter((a) => a.usdtValue > 0).slice(0, 5);
  const rest = total - top.reduce((s, a) => s + a.usdtValue, 0);
  const mask = (v) => (hidden ? '******' : v);

  return (
    <div className="tx-wallet">
      <div className="tx-wallet-head">
        <div className="tx-muted">Estimated balance <button className="tx-x" onClick={() => setHidden((v) => !v)} aria-label="Hide balance">{hidden ? '👁‍🗨' : '👁'}</button></div>
        <div className="tx-wallet-total font-num">{mask(total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} <small>USDT</small></div>
        <div className="font-num tx-muted">≈ {mask(fmtUsd(total, false))}</div>
        <div className="font-num" style={{ marginTop: 6, fontSize: 12 }}>
          <span className="tx-muted">Today&apos;s PnL </span>
          <b style={{ color: todayPnl >= 0 ? C.up : C.down }}>{mask(`${fmtUsd(todayPnl)} (${todayPct >= 0 ? '+' : ''}${todayPct.toFixed(2)}%)`)}</b>
        </div>
        {total > 0 && (
          <>
            <div className="tx-alloc">
              {top.map((a, i) => <i key={a.asset} style={{ width: `${(a.usdtValue / total) * 100}%`, background: COLORS[i] }} />)}
              {rest > 0.005 * total && <i style={{ width: `${(rest / total) * 100}%`, background: COLORS[5] }} />}
            </div>
            <div className="tx-alloc-legend font-num">
              {top.map((a, i) => <span key={a.asset}><i style={{ background: COLORS[i] }} />{a.asset} {((a.usdtValue / total) * 100).toFixed(1)}%</span>)}
            </div>
          </>
        )}
      </div>

      <div className="tx-wallet-bar">
        <b>Assets</b>
        <span style={{ flex: 1 }} />
        <label className="tx-check"><input type="checkbox" checked={hideSmall} onChange={(e) => setHideSmall(e.target.checked)} /> Hide &lt; $1</label>
        <button className="tx-x" onClick={load} aria-label="Refresh">{loading ? '…' : '↻'}</button>
      </div>
      {shown.map((a) => (
        <div key={a.asset} className="tx-asset">
          <span className="tx-coin" style={{ background: hue(a.asset) }}>{a.asset.slice(0, 1)}</span>
          <div className="tx-asset-name">
            <b>{a.asset}</b>
            <span className="font-num tx-muted">{a.price ? fmtPrice(a.price) : '—'}{a.ch != null && a.asset !== 'USDT' ? <em style={{ color: a.ch >= 0 ? C.up : C.down }}> {a.ch >= 0 ? '+' : ''}{a.ch.toFixed(2)}%</em> : null}</span>
          </div>
          <div className="tx-asset-val font-num">
            <b>{mask(fmtQty(a.total))}</b>
            <span className="tx-muted">{mask(a.usdtValue == null ? '—' : fmtUsd(a.usdtValue, false))}{a.locked > 0 ? ' · some locked' : ''}{a.earn > 0 ? ' · Earn' : ''}</span>
          </div>
          {a.asset !== 'USDT' && changes[`${a.asset}USDT`] && <button className="tx-btn ghost" onClick={() => onTrade(`${a.asset}USDT`)}>Trade</button>}
        </div>
      ))}
      {!shown.length && <div className="tx-empty">No assets above $1.</div>}
      <p className="tx-fine" style={{ padding: '10px 14px 14px' }}>Real Spot wallet, read-only: nothing here can trade or withdraw. Today&apos;s PnL is estimated from each coin&apos;s 24h price change. Funding and Futures wallets are not included.</p>
    </div>
  );
}
