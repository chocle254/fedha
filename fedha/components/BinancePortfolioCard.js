import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { openPnl } from './trading/util';

const UP = '#0ECB81';
const DOWN = '#F6465D';
const GOLD = '#F0B90B';
const COLORS = [GOLD, UP, '#5B9BFF', '#B98CFF', '#848E9C'];
const money = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (v) => `${v < 0 ? '−' : '+'}$${money(Math.abs(v))}`;

// Dashboard card: real Binance wallet (read-only) + the paper trading account, Binance-styled.
export default function BinancePortfolioCard() {
  const [data, setData] = useState(null);
  const [changes, setChanges] = useState({});
  const [paper, setPaper] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [b, p, s, t] = await Promise.all([
        fetch('/api/binance/balances', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/trading/pairs').then((r) => r.json()).catch(() => ({})),
        fetch('/api/trading/settings', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/trading/trades', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      ]);
      setData(b);
      const map = {};
      for (const [sym, , ch] of p.pairs || []) map[sym] = ch;
      setChanges(map);
      if (s) setPaper({ ...s.account, start: Number(s.settings?.paper_balance), open: (t?.trades || []).filter((x) => x.status === 'open').length, unreal: (t?.trades || []).filter((x) => x.status === 'open').reduce((a, x) => a + openPnl(x, Number(x.last_price)), 0) });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const tick = () => { if (document.visibilityState === 'visible') refresh(); };
    const id = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [refresh]);

  const connected = data?.configured;
  const total = Number(data?.totalUsdt) || 0;
  const assets = (data?.assets || []).filter((a) => a.usdtValue > 0);
  const today = assets.reduce((s, a) => {
    const ch = a.asset === 'USDT' ? 0 : changes[`${a.asset}USDT`];
    return ch == null ? s : s + (a.usdtValue - a.usdtValue / (1 + ch / 100));
  }, 0);
  const todayPct = total - today > 0 ? (today / (total - today)) * 100 : 0;
  const top = assets.slice(0, 4);

  return (
    <div style={{ background: '#181A20', border: '1px solid #2B3139', borderRadius: 16, padding: 16, marginBottom: 14, color: '#EAECEF' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(240,185,11,.15)', color: GOLD, fontWeight: 800 }}>◆</span>
        <b style={{ fontSize: 14 }}>Binance</b>
        <span style={{ flex: 1 }} />
        <Link href="/trading?tab=wallet" style={{ color: '#848E9C', fontSize: 12, textDecoration: 'none' }}>Wallet ›</Link>
      </div>

      <div style={{ color: '#848E9C', fontSize: 11, marginTop: 14 }}>Estimated balance</div>
      <div className="font-num" style={{ fontSize: 26, fontWeight: 700, marginTop: 2 }}>
        {connected ? <>{money(total)} <span style={{ fontSize: 12, color: '#848E9C', fontWeight: 500 }}>USDT</span></> : loading ? '—' : <span style={{ fontSize: 16 }}>Not connected</span>}
      </div>
      {connected && (
        <div className="font-num" style={{ fontSize: 12, marginTop: 2 }}>
          <span style={{ color: '#848E9C' }}>Today&apos;s PnL </span>
          <b style={{ color: today >= 0 ? UP : DOWN }}>{signed(today)} ({todayPct >= 0 ? '+' : ''}{todayPct.toFixed(2)}%)</b>
        </div>
      )}
      {!connected && !loading && <div style={{ color: '#848E9C', fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>{data?.error || 'Add a read-only Binance API key in Vercel to see your wallet.'}</div>}

      {connected && total > 0 && (
        <>
          <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 2, marginTop: 12 }}>
            {top.map((a, i) => <i key={a.asset} style={{ width: `${(a.usdtValue / total) * 100}%`, background: COLORS[i] }} />)}
          </div>
          <div style={{ marginTop: 8 }}>
            {top.map((a, i) => {
              const ch = a.asset === 'USDT' ? null : changes[`${a.asset}USDT`];
              return (
                <div key={a.asset} className="font-num" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i] }} />
                  <b style={{ fontFamily: 'inherit' }}>{a.asset}</b>
                  <span style={{ color: '#848E9C' }}>{((a.usdtValue / total) * 100).toFixed(1)}%</span>
                  <span style={{ flex: 1 }} />
                  <span>${money(a.usdtValue)}</span>
                  <span style={{ width: 58, textAlign: 'right', color: ch == null ? '#848E9C' : ch >= 0 ? UP : DOWN }}>{ch == null ? '—' : `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {paper && (
        <Link href="/trading" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '10px 12px', background: '#0B0E11', borderRadius: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: GOLD, border: '1px solid rgba(240,185,11,.4)', borderRadius: 4, padding: '2px 6px' }}>PAPER</span>
            <div className="font-num" style={{ fontSize: 12 }}>
              <b>${money(paper.equity + paper.unreal)}</b>
              <span style={{ color: (paper.equity + paper.unreal) >= paper.start ? UP : DOWN }}> {signed(paper.equity + paper.unreal - paper.start)}</span>
              <div style={{ color: '#848E9C', fontSize: 11 }}>{paper.open} open position{paper.open === 1 ? '' : 's'}</div>
            </div>
            <span style={{ flex: 1 }} />
            <span style={{ background: GOLD, color: '#0B0E11', fontWeight: 700, fontSize: 12, padding: '6px 12px', borderRadius: 6 }}>Trade</span>
          </div>
        </Link>
      )}
    </div>
  );
}
