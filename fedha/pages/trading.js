import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';

const STATUS = {
  pending: { label: 'Waiting for entry', color: '#F59E0B' },
  open: { label: 'Live', color: '#60A5FA' },
  won: { label: 'Hit TP', color: '#22C55E' },
  lost: { label: 'Hit SL', color: '#EF4444' },
  expired: { label: 'Expired', color: '#9CA3AF' }
};

function price(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n >= 100 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : n.toPrecision(5).replace(/\.?0+$/, '');
}

export default function TradingPage() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/signals', { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) setSignals(j.signals || []);
      else setMessage(j.error || 'Could not load signals.');
    } catch {
      setMessage('Could not load signals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => clearInterval(id);
  }, [load]);

  async function add() {
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/signals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: source.trim() || 'Unknown', text }) });
      const j = await r.json();
      if (!r.ok) setMessage(j.error || 'Could not add the signal.');
      else { setText(''); await load(); }
    } catch {
      setMessage('Could not add the signal.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this signal?')) return;
    await fetch(`/api/signals?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  }

  const active = useMemo(() => signals.filter((s) => s.status === 'pending' || s.status === 'open'), [signals]);
  const closed = useMemo(() => signals.filter((s) => !(s.status === 'pending' || s.status === 'open')), [signals]);
  const sources = useMemo(() => [...new Set(signals.map((s) => s.source))], [signals]);

  // Group active signals by symbol: who agrees, who conflicts
  const bySymbol = useMemo(() => {
    const map = {};
    for (const s of active) (map[s.symbol] = map[s.symbol] || []).push(s);
    return Object.entries(map).map(([symbol, list]) => {
      const sides = new Set(list.map((s) => s.side));
      return { symbol, list, conflict: sides.size > 1, count: list.length };
    }).filter((g) => g.count > 1 || g.conflict);
  }, [active]);

  const board = useMemo(() => {
    const map = {};
    for (const s of signals) {
      if (s.status !== 'won' && s.status !== 'lost') continue;
      const b = map[s.source] || (map[s.source] = { source: s.source, won: 0, lost: 0, sum: 0 });
      if (s.status === 'won') b.won++; else b.lost++;
      b.sum += Number(s.result_pct) || 0;
    }
    return Object.values(map).map((b) => ({ ...b, total: b.won + b.lost, rate: Math.round((b.won / (b.won + b.lost)) * 100), avg: b.sum / (b.won + b.lost) })).sort((a, b) => b.avg - a.avg);
  }, [signals]);

  const row = (s) => {
    const st = STATUS[s.status] || STATUS.open;
    const tps = s.take_profits || [];
    return (
      <div key={s.id} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800 }}>{s.symbol.replace(/USDT$|USDC$|FDUSD$/, '')}</span>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: s.side === 'BUY' ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)', color: s.side === 'BUY' ? '#22C55E' : '#EF4444' }}>{s.side}</span>
          <span style={{ fontSize: 11, color: st.color, fontWeight: 700 }}>{st.label}{s.status === 'open' && s.tp_hit > 0 ? ` · TP${s.tp_hit} ✓` : ''}</span>
          <span style={{ flex: 1 }} />
          {s.result_pct != null && <span className="font-num" style={{ fontWeight: 800, fontSize: 13, color: Number(s.result_pct) >= 0 ? '#22C55E' : '#EF4444' }}>{Number(s.result_pct) >= 0 ? '+' : ''}{s.result_pct}%</span>}
          <button onClick={() => remove(s.id)} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} aria-label="Delete signal">✕</button>
        </div>
        <div className="font-num" style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 5, lineHeight: 1.6 }}>
          {s.source} · entry {price(s.entry)}{tps.length ? ` · TP ${tps.map(price).join(' / ')}` : ''}{s.stop_loss != null ? ` · SL ${price(s.stop_loss)}` : ''}
        </div>
      </div>
    );
  };

  return (
    <Layout fab={false}>
      <div className="page" style={{ padding: '24px 20px 100px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>BUSINESS · BINANCE</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Signals</h1>
        <div className="card" style={{ padding: 12, marginTop: 14, borderColor: 'rgba(245,158,11,.3)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
          Paper mode: signals are tracked against real Binance prices, but <b>no orders are placed</b>. Use the scoreboard to see which groups actually deliver before any real money is involved.
        </div>

        <div className="card" style={{ padding: 14, marginTop: 14 }}>
          <input list="signal-sources" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Group name" style={{ width: '100%', marginBottom: 8 }} />
          <datalist id="signal-sources">{sources.map((s) => <option key={s} value={s} />)}</datalist>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={'Paste the signal, e.g.\nBTC/USDT LONG\nEntry 65000\nTP1 66000 TP2 67000\nSL 64000'} style={{ width: '100%' }} />
          <button onClick={add} disabled={busy || !text.trim()} className="btn-primary" style={{ marginTop: 8, padding: '10px 16px', borderRadius: 10 }}>{busy ? 'Adding…' : 'Track signal'}</button>
          {message && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 8 }}>{message}</div>}
        </div>

        {bySymbol.length > 0 && (
          <>
            <div className="section-title" style={{ margin: '22px 0 10px' }}>Signal check</div>
            <div className="card" style={{ padding: 0 }}>
              {bySymbol.map((g) => (
                <div key={g.symbol} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <b>{g.symbol}</b> {g.conflict ? <span style={{ color: '#F59E0B' }}>⚠ conflicting</span> : <span style={{ color: '#22C55E' }}>✓ agreement</span>}
                  <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>{g.list.map((s) => `${s.source}: ${s.side}`).join(' · ')}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="section-title" style={{ margin: '22px 0 10px' }}>Active ({active.length})</div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? <div style={{ padding: 16, color: 'var(--text-2)' }}>Loading…</div> : active.length ? active.map(row) : <div style={{ padding: 16, color: 'var(--text-2)', fontSize: 13 }}>No active signals yet.</div>}
        </div>

        {board.length > 0 && (
          <>
            <div className="section-title" style={{ margin: '22px 0 10px' }}>Scoreboard by group</div>
            <div className="card" style={{ padding: 0 }}>
              {board.map((b) => (
                <div key={b.source} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{b.source}</div>
                    <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 3 }}>{b.won} hit TP · {b.lost} hit SL · {b.total} closed</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="font-num" style={{ fontWeight: 800, color: b.avg >= 0 ? '#22C55E' : '#EF4444' }}>{b.avg >= 0 ? '+' : ''}{b.avg.toFixed(2)}%</div>
                    <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 3 }}>{b.rate}% hit TP · avg per signal</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {closed.length > 0 && (
          <>
            <button onClick={() => setShowClosed((v) => !v)} className="btn-ghost" style={{ marginTop: 18, fontSize: 12 }}>{showClosed ? 'Hide closed signals' : `Show ${closed.length} closed signal${closed.length > 1 ? 's' : ''}`}</button>
            {showClosed && <div className="card" style={{ padding: 0, marginTop: 10, overflow: 'hidden' }}>{closed.map(row)}</div>}
          </>
        )}

        <p style={{ color: 'var(--text-3)', fontSize: 11, lineHeight: 1.6, marginTop: 18 }}>
          Scoring rules: entry is the stated price (or market price when none is given). If a stop and a target fall in the same price candle, the stop counts first. A signal that hits TP1 and later its stop is scored at the last TP reached. Signals close after 7 days. SELL signals are scored as shorts; Binance Spot can only sell what you already hold.
        </p>
      </div>
    </Layout>
  );
}
