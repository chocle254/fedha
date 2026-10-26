import { useCallback, useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import Layout from '../components/Layout';

const SIGNAL_STATUS = {
  pending: { label: 'Waiting for entry', color: '#F59E0B' },
  open: { label: 'Live', color: '#60A5FA' },
  won: { label: 'Hit TP', color: '#22C55E' },
  lost: { label: 'Hit SL', color: '#EF4444' },
  expired: { label: 'Expired', color: '#9CA3AF' }
};
const TRADE_STATUS = {
  pending: { label: 'Waiting for entry', color: '#F59E0B' },
  open: { label: 'Open', color: '#60A5FA' },
  won: { label: 'Won', color: '#22C55E' },
  lost: { label: 'Lost', color: '#EF4444' },
  expired: { label: 'Expired', color: '#9CA3AF' }
};
const INTERVALS = ['5m', '15m', '1h', '4h'];

function price(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n >= 100 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : n.toPrecision(5).replace(/\.?0+$/, '');
}
function usd(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n < 0 ? '−' : n > 0 ? '+' : ''}$${Math.abs(n).toFixed(2)}`;
}
const base = (symbol) => symbol.replace(/USDT$|USDC$|FDUSD$/, '');
const pill = (on) => ({ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', background: on ? 'var(--green)' : 'transparent', color: on ? '#04130A' : 'var(--text-2)', cursor: 'pointer' });

function ChartPanel({ symbol, levels, onClose }) {
  const [interval, setIntervalValue] = useState('15m');
  const [candles, setCandles] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/trading/chart?symbol=${symbol}&interval=${interval}`, { cache: 'no-store' });
        const j = await r.json();
        if (!live) return;
        if (r.ok) { setCandles(j.candles || []); setErr(''); } else setErr(j.error || 'Could not load the chart.');
      } catch { if (live) setErr('Could not load the chart.'); }
    };
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 20000);
    return () => { live = false; clearInterval(id); };
  }, [symbol, interval]);

  const lines = [];
  if (levels) {
    lines.push({ y: levels.entry, color: '#60A5FA', label: 'Entry' });
    if (levels.sl != null) lines.push({ y: Number(levels.sl), color: '#EF4444', label: 'SL' });
    (levels.tps || []).forEach((tp, i) => lines.push({ y: Number(tp), color: '#22C55E', label: `TP${i + 1}` }));
  }
  const data = candles.map((c) => ({ t: c.t, c: c.c }));
  const all = [...candles.flatMap((c) => [c.h, c.l]), ...lines.map((l) => l.y)].filter(Number.isFinite);
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const pad = (hi - lo) * 0.05 || hi * 0.01;
  const last = candles.length ? candles[candles.length - 1].c : null;
  const fmtTime = (t) => { const d = new Date(t); return interval === '4h' || interval === '1h' ? `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00` : `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

  return (
    <div className="card" style={{ padding: 14, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <b>{base(symbol)}/USDT</b>
        <span className="font-num" style={{ color: 'var(--text-2)', fontSize: 13 }}>{last != null ? price(last) : ''}</span>
        <span style={{ flex: 1 }} />
        {INTERVALS.map((i) => <button key={i} onClick={() => setIntervalValue(i)} style={pill(i === interval)}>{i}</button>)}
        <button onClick={onClose} className="btn-ghost" style={{ padding: '2px 8px' }} aria-label="Close chart">✕</button>
      </div>
      {err && <div style={{ color: '#EF4444', fontSize: 12, marginBottom: 6 }}>{err}</div>}
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 44, left: 0, bottom: 0 }}>
            <XAxis dataKey="t" tickFormatter={fmtTime} tick={{ fontSize: 10, fill: '#9CA3AF' }} minTickGap={40} />
            <YAxis domain={[lo - pad, hi + pad]} tickFormatter={price} tick={{ fontSize: 10, fill: '#9CA3AF' }} width={58} orientation="right" />
            <Tooltip labelFormatter={fmtTime} formatter={(v) => [price(v), 'Price']} contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 12 }} />
            {lines.map((l) => <ReferenceLine key={l.label} y={l.y} stroke={l.color} strokeDasharray="4 3" label={{ value: l.label, fill: l.color, fontSize: 10, position: 'right' }} />)}
            <Line type="monotone" dataKey="c" stroke="#E5E7EB" strokeWidth={1.6} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!levels && <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 6 }}>No active signal or trade on this pair, so no entry/stop/target lines are drawn.</div>}
    </div>
  );
}

export default function TradingPage() {
  const [signals, setSignals] = useState([]);
  const [trades, setTrades] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [settings, setSettings] = useState({ auto_enabled: false, mode: 'paper', risk_usdt: 10, min_rr: 0 });
  const [riskInput, setRiskInput] = useState('10');
  const [rrInput, setRrInput] = useState('0');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [chartSymbol, setChartSymbol] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [showClosedTrades, setShowClosedTrades] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([fetch('/api/signals', { cache: 'no-store' }), fetch('/api/trading/trades', { cache: 'no-store' })]);
      const sj = await s.json();
      const tj = await t.json();
      if (s.ok) setSignals(sj.signals || []); else setMessage(sj.error || 'Could not load signals.');
      if (t.ok) setTrades(tj.trades || []); else if (tj.error) setMessage(tj.error);
    } catch {
      setMessage('Could not load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/trading/settings', { cache: 'no-store' });
        const j = await r.json();
        if (r.ok) { setSettings(j.settings); setRiskInput(String(j.settings.risk_usdt)); setRrInput(String(j.settings.min_rr)); }
      } catch { /* defaults stay */ }
    })();
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => clearInterval(id);
  }, [load]);

  const activeSignals = useMemo(() => signals.filter((s) => s.status === 'pending' || s.status === 'open'), [signals]);
  const closedSignals = useMemo(() => signals.filter((s) => !(s.status === 'pending' || s.status === 'open')), [signals]);
  const activeTrades = useMemo(() => trades.filter((t) => t.status === 'pending' || t.status === 'open'), [trades]);
  const closedTrades = useMemo(() => trades.filter((t) => !(t.status === 'pending' || t.status === 'open')), [trades]);
  const tradedSignalIds = useMemo(() => new Set(trades.map((t) => t.signal_id).filter(Boolean)), [trades]);

  const symbolList = useMemo(() => [...new Set([...activeTrades.map((t) => t.symbol), ...activeSignals.map((s) => s.symbol)])], [activeTrades, activeSignals]);
  const symbolKey = symbolList.join(',');
  useEffect(() => {
    if (!symbolKey) { setQuotes([]); return undefined; }
    let live = true;
    const loadQuotes = async () => {
      try {
        const r = await fetch(`/api/trading/quotes?symbols=${symbolKey}`, { cache: 'no-store' });
        const j = await r.json();
        if (live && r.ok) setQuotes(j.quotes || []);
      } catch { /* keep the previous quotes */ }
    };
    loadQuotes();
    const id = setInterval(() => { if (document.visibilityState === 'visible') loadQuotes(); }, 15000);
    return () => { live = false; clearInterval(id); };
  }, [symbolKey]);

  const levelsFor = (symbol) => {
    const t = activeTrades.find((x) => x.symbol === symbol);
    if (t) return { entry: Number(t.entry), sl: t.stop_loss, tps: t.take_profits };
    const s = activeSignals.find((x) => x.symbol === symbol);
    return s ? { entry: Number(s.entry), sl: s.stop_loss, tps: s.take_profits } : null;
  };

  async function saveSettings(patch) {
    const next = { ...settings, ...patch, risk_usdt: Number(patch.risk_usdt ?? riskInput), min_rr: Number(patch.min_rr ?? rrInput) };
    setMessage('');
    try {
      const r = await fetch('/api/trading/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      const j = await r.json();
      if (!r.ok) { setMessage(j.error || 'Could not save settings.'); return; }
      setSettings(j.settings);
      setMessage('Saved.');
    } catch { setMessage('Could not save settings.'); }
  }

  async function enter(signal) {
    setBusyId(signal.id);
    setMessage('');
    try {
      const r = await fetch('/api/trading/trades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signalId: signal.id, riskUsdt: Number(settings.risk_usdt) }) });
      const j = await r.json();
      if (!r.ok) setMessage(j.error || 'Could not enter the trade.');
      else await load();
    } catch { setMessage('Could not enter the trade.'); }
    finally { setBusyId(''); }
  }

  async function removeTrade(id) {
    if (!window.confirm('Delete this paper trade?')) return;
    await fetch(`/api/trading/trades?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  }
  async function removeSignal(id) {
    if (!window.confirm('Delete this signal?')) return;
    await fetch(`/api/signals?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  }

  const stats = useMemo(() => {
    const won = closedTrades.filter((t) => t.status === 'won').length;
    const lost = closedTrades.filter((t) => t.status === 'lost').length;
    const realized = closedTrades.reduce((a, t) => a + (Number(t.pnl_usdt) || 0), 0);
    const open = activeTrades.reduce((a, t) => a + (Number(t.pnl_usdt) || 0), 0);
    const worstR = trades.reduce((a, t) => Math.max(a, Number(t.max_drawdown_r) || 0), 0);
    return { won, lost, realized, open, worstR, rate: won + lost ? Math.round((won / (won + lost)) * 100) : null };
  }, [closedTrades, activeTrades, trades]);

  const bySymbol = useMemo(() => {
    const map = {};
    for (const s of activeSignals) (map[s.symbol] = map[s.symbol] || []).push(s);
    return Object.entries(map).map(([symbol, list]) => ({ symbol, list, conflict: new Set(list.map((s) => s.side)).size > 1, count: list.length })).filter((g) => g.count > 1 || g.conflict);
  }, [activeSignals]);

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

  const tradeRow = (t) => {
    const st = TRADE_STATUS[t.status] || TRADE_STATUS.open;
    const pnl = Number(t.pnl_usdt);
    const dd = Number(t.max_drawdown_usdt);
    const closed = t.status === 'won' || t.status === 'lost' || t.status === 'expired';
    return (
      <div key={t.id} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800 }}>{base(t.symbol)}</span>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: t.side === 'BUY' ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)', color: t.side === 'BUY' ? '#22C55E' : '#EF4444' }}>{t.side === 'BUY' ? 'LONG' : 'SHORT*'}</span>
          <span style={{ fontSize: 11, color: st.color, fontWeight: 700 }}>{st.label}{t.status === 'open' && t.tp_hit > 0 ? ` · TP${t.tp_hit} ✓` : ''}{t.auto ? ' · auto' : ''}</span>
          <span style={{ flex: 1 }} />
          {Number.isFinite(pnl) && t.pnl_usdt != null && <span className="font-num" style={{ fontWeight: 800, fontSize: 13, color: pnl >= 0 ? '#22C55E' : '#EF4444' }}>{usd(pnl)}</span>}
          <button onClick={() => setChartSymbol(t.symbol)} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} aria-label="Open chart">📈</button>
          <button onClick={() => removeTrade(t.id)} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} aria-label="Delete trade">✕</button>
        </div>
        <div className="font-num" style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 5, lineHeight: 1.6 }}>
          {t.source} · entry {price(t.entry)} · SL {price(t.stop_loss)} · TP {(t.take_profits || []).map(price).join(' / ')}
          <br />size {t.qty} ({t.symbol.replace(/USDT$/, '')}) · ${Number(t.notional).toFixed(2)} · risk ${Number(t.actual_risk_usdt ?? t.risk_usdt).toFixed(2)}
          {t.min_forced && <span style={{ color: '#F59E0B' }}> · ⚠ Binance minimum size forced (planned ${Number(t.risk_usdt).toFixed(2)})</span>}
        </div>
        {t.max_drawdown_usdt != null && (
          <div style={{ fontSize: 11, marginTop: 4, color: dd > 0 ? '#F59E0B' : 'var(--text-3)' }}>
            {dd > 0 ? `Went ${usd(-dd)}${t.max_drawdown_r != null ? ` (${Number(t.max_drawdown_r).toFixed(2)}R)` : ''} against you${closed ? (t.status === 'won' ? ' before it won' : '') : ' so far'}` : 'Never went against you'}
            {t.max_adverse_price != null && dd > 0 ? ` · low point ${price(t.max_adverse_price)}` : ''}
          </div>
        )}
      </div>
    );
  };

  const signalRow = (s, canEnter) => {
    const st = SIGNAL_STATUS[s.status] || SIGNAL_STATUS.open;
    const tps = s.take_profits || [];
    const entered = tradedSignalIds.has(s.id);
    return (
      <div key={s.id} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800 }}>{base(s.symbol)}</span>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: s.side === 'BUY' ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)', color: s.side === 'BUY' ? '#22C55E' : '#EF4444' }}>{s.side}</span>
          <span style={{ fontSize: 11, color: st.color, fontWeight: 700 }}>{st.label}{s.status === 'open' && s.tp_hit > 0 ? ` · TP${s.tp_hit} ✓` : ''}</span>
          <span style={{ flex: 1 }} />
          {s.result_pct != null && <span className="font-num" style={{ fontWeight: 800, fontSize: 13, color: Number(s.result_pct) >= 0 ? '#22C55E' : '#EF4444' }}>{Number(s.result_pct) >= 0 ? '+' : ''}{s.result_pct}%</span>}
          {canEnter && (entered
            ? <span style={{ fontSize: 11, color: 'var(--text-3)' }}>In a trade</span>
            : s.stop_loss == null
              ? <span style={{ fontSize: 11, color: 'var(--text-3)' }}>No SL</span>
              : <button onClick={() => enter(s)} disabled={busyId === s.id} className="btn-primary" style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12 }}>{busyId === s.id ? '…' : 'Enter paper'}</button>)}
          <button onClick={() => setChartSymbol(s.symbol)} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} aria-label="Open chart">📈</button>
          <button onClick={() => removeSignal(s.id)} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} aria-label="Delete signal">✕</button>
        </div>
        <div className="font-num" style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 5, lineHeight: 1.6 }}>
          {s.source} · entry {price(s.entry)}{tps.length ? ` · TP ${tps.map(price).join(' / ')}` : ''}{s.stop_loss != null ? ` · SL ${price(s.stop_loss)}` : ''}
        </div>
      </div>
    );
  };

  const quoteFor = (sym) => quotes.find((q) => q.symbol === sym);

  return (
    <Layout fab={false}>
      <div className="page" style={{ padding: '24px 20px 100px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>BUSINESS · BINANCE</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Trading</h1>
        <div className="card" style={{ padding: 12, marginTop: 14, borderColor: 'rgba(245,158,11,.3)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
          <b>Paper mode.</b> Signals arrive automatically from Telegram. Trades here are simulated against real Binance prices, sized by your risk and Binance&apos;s minimum lot rules. <b>No real orders are placed.</b>
        </div>

        <div className="card" style={{ padding: 14, marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Auto-enter new signals</div>
              <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 3 }}>{settings.auto_enabled ? 'On: every new signal with a stop-loss opens a paper trade.' : 'Off: enter signals manually with the button.'}</div>
            </div>
            <button onClick={() => saveSettings({ auto_enabled: !settings.auto_enabled })} style={pill(settings.auto_enabled)}>{settings.auto_enabled ? 'ON' : 'OFF'}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Mode</span>
            <button style={pill(true)}>Paper</button>
            <button disabled style={{ ...pill(false), opacity: 0.45, cursor: 'not-allowed' }} title="Real execution is not built yet">Live 🔒</button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', flex: '1 1 140px' }}>Risk per trade (USDT)
              <input type="number" inputMode="decimal" min="0" step="any" value={riskInput} onChange={(e) => setRiskInput(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--text-3)', flex: '1 1 140px' }}>Minimum reward:risk (0 = off)
              <input type="number" inputMode="decimal" min="0" step="any" value={rrInput} onChange={(e) => setRrInput(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
            </label>
          </div>
          <button onClick={() => saveSettings({})} className="btn-primary" style={{ marginTop: 10, padding: '9px 16px', borderRadius: 10 }}>Save settings</button>
          {message && <div style={{ color: message === 'Saved.' ? '#22C55E' : '#EF4444', fontSize: 12, marginTop: 8 }}>{message}</div>}
        </div>

        <div className="section-title" style={{ margin: '22px 0 10px' }}>Quotes</div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {symbolList.length === 0 ? <div style={{ padding: 16, color: 'var(--text-2)', fontSize: 13 }}>Pairs from your active signals and trades appear here. Tap one to open its chart.</div> : symbolList.map((sym) => {
            const q = quoteFor(sym);
            return (
              <button key={sym} onClick={() => setChartSymbol(chartSymbol === sym ? '' : sym)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '12px 14px', background: chartSymbol === sym ? 'var(--card-2)' : 'transparent', border: 0, borderBottom: '1px solid var(--border)', color: 'inherit', cursor: 'pointer' }}>
                <span style={{ fontWeight: 800, flex: 1 }}>{base(sym)}/USDT</span>
                <span className="font-num">{q ? price(q.price) : '—'}</span>
                <span className="font-num" style={{ fontSize: 12, minWidth: 56, textAlign: 'right', color: q && q.change >= 0 ? '#22C55E' : '#EF4444' }}>{q ? `${q.change >= 0 ? '+' : ''}${q.change.toFixed(2)}%` : ''}</span>
                <span>📈</span>
              </button>
            );
          })}
        </div>
        {chartSymbol && <ChartPanel key={chartSymbol} symbol={chartSymbol} levels={levelsFor(chartSymbol)} onClose={() => setChartSymbol('')} />}

        <div className="section-title" style={{ margin: '22px 0 10px' }}>Paper trades</div>
        <div className="card" style={{ padding: 14, display: 'flex', flexWrap: 'wrap', gap: 18 }}>
          <div><div style={{ color: 'var(--text-3)', fontSize: 11 }}>Closed P&amp;L</div><div className="font-num" style={{ fontWeight: 800, fontSize: 18, color: stats.realized >= 0 ? '#22C55E' : '#EF4444' }}>{usd(stats.realized)}</div></div>
          <div><div style={{ color: 'var(--text-3)', fontSize: 11 }}>Open P&amp;L</div><div className="font-num" style={{ fontWeight: 800, fontSize: 18, color: stats.open >= 0 ? '#22C55E' : '#EF4444' }}>{usd(stats.open)}</div></div>
          <div><div style={{ color: 'var(--text-3)', fontSize: 11 }}>Win rate</div><div className="font-num" style={{ fontWeight: 800, fontSize: 18 }}>{stats.rate == null ? '—' : `${stats.rate}%`}</div></div>
          <div><div style={{ color: 'var(--text-3)', fontSize: 11 }}>Worst dip</div><div className="font-num" style={{ fontWeight: 800, fontSize: 18 }}>{stats.worstR ? `${stats.worstR.toFixed(2)}R` : '—'}</div></div>
        </div>
        <div className="card" style={{ padding: 0, marginTop: 10, overflow: 'hidden' }}>
          {loading ? <div style={{ padding: 16, color: 'var(--text-2)' }}>Loading…</div> : activeTrades.length ? activeTrades.map(tradeRow) : <div style={{ padding: 16, color: 'var(--text-2)', fontSize: 13 }}>No open paper trades. Turn on auto-enter, or tap Enter paper on a signal below.</div>}
        </div>
        {closedTrades.length > 0 && (
          <>
            <button onClick={() => setShowClosedTrades((v) => !v)} className="btn-ghost" style={{ marginTop: 12, fontSize: 12 }}>{showClosedTrades ? 'Hide closed trades' : `Show ${closedTrades.length} closed trade${closedTrades.length > 1 ? 's' : ''}`}</button>
            {showClosedTrades && <div className="card" style={{ padding: 0, marginTop: 10, overflow: 'hidden' }}>{closedTrades.map(tradeRow)}</div>}
          </>
        )}
        <p style={{ color: 'var(--text-3)', fontSize: 11, lineHeight: 1.6, marginTop: 10 }}>
          Size = risk ÷ distance to stop, rounded down to Binance&apos;s step size. If that falls below Binance&apos;s minimum quantity or minimum order value, the size is raised to the minimum and flagged, so your real risk is higher than planned. Fees of 0.1% per side are included. The position scales out equally across the take-profits and the stop stays put. *Spot cannot short: shorts here are simulated only.
        </p>

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

        <div className="section-title" style={{ margin: '22px 0 10px' }}>Signals received ({activeSignals.length})</div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? <div style={{ padding: 16, color: 'var(--text-2)' }}>Loading…</div> : activeSignals.length ? activeSignals.map((s) => signalRow(s, true)) : <div style={{ padding: 16, color: 'var(--text-2)', fontSize: 13 }}>No active signals yet. They appear here as soon as the Telegram listener picks them up.</div>}
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

        {closedSignals.length > 0 && (
          <>
            <button onClick={() => setShowClosed((v) => !v)} className="btn-ghost" style={{ marginTop: 18, fontSize: 12 }}>{showClosed ? 'Hide closed signals' : `Show ${closedSignals.length} closed signal${closedSignals.length > 1 ? 's' : ''}`}</button>
            {showClosed && <div className="card" style={{ padding: 0, marginTop: 10, overflow: 'hidden' }}>{closedSignals.map((s) => signalRow(s, false))}</div>}
          </>
        )}

        <p style={{ color: 'var(--text-3)', fontSize: 11, lineHeight: 1.6, marginTop: 18 }}>
          Signal scoring: entry is the stated price (or market price when none is given). If a stop and a target fall in the same candle, the stop counts first. A signal that hits TP1 and later its stop is scored at the last TP reached. Signals close after 7 days.
        </p>
      </div>
    </Layout>
  );
}
