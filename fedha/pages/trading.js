import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Layout from '../components/Layout';
import TradeChart from '../components/trading/TradeChart';
import OrderBook from '../components/trading/OrderBook';
import OrderForm from '../components/trading/OrderForm';
import PairPicker from '../components/trading/PairPicker';
import WalletPanel from '../components/trading/WalletPanel';
import BrokerPanel from '../components/trading/BrokerPanel';
import NewsStrip from '../components/trading/NewsStrip';
import GrowthCard from '../components/trading/GrowthCard';
import { ensurePushSubscription } from '../lib/push';
import { groupReport, brokerResults, GROUP_MIN_TRADES, TRAIL_LABEL, TRAIL_DEFAULT } from '../lib/trading-core';
import { C, base, quoteOf, fmtPrice, fmtQty, fmtUsd, fmtCompact, ago, livePnl, openPnl, openStream, REST, lotsLabel, rrPlan, rrText, rrDetail, resultR, isMt5, pipSize, moveLabel, bankedPipsLabel, netPipsLabel } from '../components/trading/util';

// The stop in force now: signal trades trail it with their channel's learned style (saved as trail_stop).
const curStop = (t) => (t.source !== 'Manual' && t.trail_stop != null ? t.trail_stop : t.stop_loss);
const trailed = (t) => t.source !== 'Manual' && t.trail_stop != null && t.stop_loss != null && Number(t.trail_stop) !== Number(t.stop_loss);

// PAPER TRADING TERMINAL. Real Binance prices, simulated orders. Nothing here places a real order.
const LIVE = ['pending', 'open'];
const OUTCOME = {
  traded: { label: 'Auto-traded', color: C.up },
  tracked: { label: 'Signal added', color: C.blue },
  unparsed: { label: 'Skipped', color: C.gold },
  follow_up: { label: 'Result post', color: '#848E9C' },
  stale: { label: 'Too late', color: '#848E9C' },
  duplicate: { label: 'Duplicate', color: '#848E9C' }
};
const SIGNAL_STATUS = { pending: ['Waiting for entry', C.gold], open: ['Live', C.blue], won: ['Hit TP', C.up], lost: ['Hit SL', C.down], expired: ['Expired', '#848E9C'] };
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

function Side({ side }) {
  const buy = side === 'BUY';
  return <span className="tx-badge" style={{ color: buy ? C.up : C.down, background: buy ? C.upDim : C.downDim }}>{buy ? 'Long' : 'Short'}</span>;
}

export default function TradingPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setIntervalValue] = useState('15m');
  const [picker, setPicker] = useState(false);
  const [picked, setPicked] = useState(null);
  const [tab, setTab] = useState('positions');
  const [signals, setSignals] = useState([]);
  const [trades, setTrades] = useState([]);
  const [settings, setSettings] = useState(null);
  const [account, setAccount] = useState(null);
  const [riskNow, setRiskNow] = useState(10);
  const [inbox, setInbox] = useState({ inbox: [], listener: null, needsMigration: false });
  const [tickers, setTickers] = useState({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [entryRisk, setEntryRisk] = useState({});
  const [showClosedSignals, setShowClosedSignals] = useState(false);
  const [form, setForm] = useState(null);
  const [alerts, setAlerts] = useState('unknown');
  const [brokerRows, setBrokerRows] = useState(null);
  const router = useRouter();
  const prevTrades = useRef(null);
  const lastLoad = useRef(0);

  const flash = (text, err = false) => { setToast({ text, err }); setTimeout(() => setToast(null), 4000); };

  useEffect(() => {
    if (router.query.tab) setTab(String(router.query.tab));
  }, [router.query.tab]);
  useEffect(() => {
    try { setAlerts(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission); } catch { setAlerts('unsupported'); }
  }, []);
  async function enableAlerts() {
    try {
      const p = await Notification.requestPermission();
      setAlerts(p);
      if (p !== 'granted') { flash('Notifications are blocked. Allow them in your browser settings.', true); return; }
      const sub = await ensurePushSubscription();
      flash(sub ? 'Alerts on: you will be notified when trades open, hit TPs or close.' : 'Allowed, but push could not be set up on this device.', !sub);
    } catch { flash('This browser cannot show notifications.', true); }
  }
  useEffect(() => {
    const s = store.get('tx-symbol');
    const i = store.get('tx-interval');
    if (s) setSymbol(s);
    if (i) setIntervalValue(i);
  }, []);
  const pickSymbol = useCallback((s) => { setSymbol(s); store.set('tx-symbol', s); }, []);
  const pickInterval = useCallback((i) => { setIntervalValue(i); store.set('tx-interval', i); }, []);
  const closePicker = useCallback(() => setPicker(false), []);
  const pickPrice = useCallback((price) => setPicked({ price, n: Date.now() }), []);

  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    try {
      const [s, t, c, ib] = await Promise.all(['/api/signals', '/api/trading/trades', '/api/trading/settings', '/api/signals/inbox'].map((u) => fetch(u, { cache: 'no-store' })));
      const [sj, tj, cj, ibj] = await Promise.all([s.json(), t.json(), c.json(), ib.json().catch(() => ({}))]);
      if (s.ok) setSignals(sj.signals || []);
      if (t.ok) {
        const list = (tj.trades || []).filter((x) => (x.book || 'main') === 'main'); // growth-account trades show in its card
        const before = prevTrades.current;
        if (before) {
          for (const x of list) {
            const o = before[x.id];
            if (!o) continue;
            const name = `${base(x.symbol)} ${x.side === 'BUY' ? 'long' : 'short'}`;
            if (o.status === 'pending' && x.status === 'open') flash(`📥 ${name} filled at ${fmtPrice(x.entry)}`);
            else if (['won', 'lost'].includes(x.status) && LIVE.includes(o.status)) flash(`${x.status === 'won' ? '✅' : '🛑'} ${name} closed ${fmtUsd(x.pnl_usdt)}`, x.status === 'lost');
            else if ((x.tp_hit || 0) > (o.tp_hit || 0)) flash(`🎯 ${name} TP${x.tp_hit} hit`);
          }
        }
        prevTrades.current = Object.fromEntries(list.map((x) => [x.id, x]));
        setTrades(list);
      }
      if (c.ok) {
        setSettings(cj.settings);
        setAccount(cj.account || { equity: cj.equity, available: cj.equity, locked: 0, realized: 0 });
        setRiskNow(cj.riskNow);
        setForm((f) => f || { balance: String(cj.settings.paper_balance), riskMode: cj.settings.risk_mode, pct: String(cj.settings.risk_pct), fixed: String(cj.settings.risk_usdt), rr: String(cj.settings.min_rr) });
      }
      if (ib.ok) setInbox({ inbox: ibj.inbox || [], listener: ibj.listener, needsMigration: ibj.needsMigration });
      if (!s.ok || !t.ok) flash(sj.error || tj.error || 'Could not load your trades.', true);
    } catch {
      flash('Could not load data.', true);
    } finally {
      setLoading(false);
    }
  }, []);

  const hasLive = trades.some((t) => LIVE.includes(t.status));
  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, hasLive ? 10000 : 30000);
    return () => clearInterval(id);
  }, [load, hasLive]);

  const positions = useMemo(() => trades.filter((t) => t.status === 'open'), [trades]);
  const orders = useMemo(() => trades.filter((t) => t.status === 'pending'), [trades]);
  const history = useMemo(() => trades.filter((t) => !LIVE.includes(t.status)), [trades]);
  const activeSignals = useMemo(() => signals.filter((s) => LIVE.includes(s.status)), [signals]);
  const closedSignals = useMemo(() => signals.filter((s) => !LIVE.includes(s.status)), [signals]);
  const tradedSignalIds = useMemo(() => new Set(trades.map((t) => t.signal_id).filter(Boolean)), [trades]);

  // One live ticker stream for the open pair plus every pair you hold or have a signal on.
  const watch = useMemo(() => [...new Set([symbol, ...positions.map((t) => t.symbol), ...orders.map((t) => t.symbol), ...activeSignals.map((s) => s.symbol)])].sort(), [symbol, positions, orders, activeSignals]);
  const watchKey = watch.join(',');
  useEffect(() => {
    let buf = {};
    // MT5 markets (gold, silver, forex, oil, indices) are not on Binance: their prices come from our server
    // every 5 s instead of the socket.
    const all = watchKey.split(',').filter(Boolean);
    const syms = all.filter((x) => !isMt5(x));
    const mt5 = all.filter(isMt5);
    const stop = syms.length ? openStream(syms.map((s) => `${s.toLowerCase()}@miniTicker`), (_s, d) => { buf[d.s] = { c: +d.c, o: +d.o, h: +d.h, l: +d.l, q: +d.q }; }) : () => {};
    let lastMsg = Date.now();
    const pollMt5 = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`/api/trading/quotes?symbols=${mt5.join(',')}`, { cache: 'no-store' });
        if (r.ok) for (const g of (await r.json()).quotes || []) if (isMt5(g.symbol)) buf[g.symbol] = { c: g.price, o: g.open, h: g.high, l: g.low, q: 0 };
      } catch { /* next tick */ }
    };
    if (mt5.length) pollMt5();
    const goldPoll = mt5.length ? setInterval(pollMt5, 5000) : null;
    const tick = setInterval(() => { if (Object.keys(buf).length) { lastMsg = Date.now(); const b = buf; buf = {}; setTickers((p) => ({ ...p, ...b })); } }, 500);
    // Socket quiet for 5 s (blocked network, phone woke up): poll prices instead until it comes back.
    const poll = setInterval(async () => {
      if (!syms.length || Date.now() - lastMsg < 5000 || document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`${REST}/ticker/24hr?type=MINI&symbols=${encodeURIComponent(JSON.stringify(syms))}`, { cache: 'no-store' });
        if (!r.ok) return;
        for (const d of await r.json()) buf[d.symbol] = { c: +d.lastPrice, o: +d.openPrice, h: +d.highPrice, l: +d.lowPrice, q: +d.quoteVolume };
      } catch { /* next tick */ }
    }, 2500);
    return () => { stop(); clearInterval(tick); clearInterval(poll); if (goldPoll) clearInterval(goldPoll); };
  }, [watchKey]);

  const tk = tickers[symbol];
  const last = tk?.c;
  const change = tk && tk.o ? ((tk.c - tk.o) / tk.o) * 100 : null;
  useEffect(() => { document.title = last ? `${fmtPrice(last)} | ${base(symbol)}/${quoteOf(symbol)} · Luxe` : 'Trading · Luxe'; }, [last, symbol]);

  const unrealized = positions.reduce((a, t) => a + openPnl(t, tickers[t.symbol]?.c), 0);
  const equityLive = account ? account.equity + unrealized : null;

  // Price just crossed a TP, a stop or a limit price: ask the server to settle it now instead of waiting for the next poll.
  useEffect(() => {
    if (Date.now() - lastLoad.current < 8000) return;
    const crossed = trades.some((t) => {
      const p = tickers[t.symbol]?.c;
      if (!p) return false;
      const buy = t.side === 'BUY';
      if (t.status === 'pending') return buy ? p <= Number(t.entry) : p >= Number(t.entry);
      if (t.status !== 'open') return false;
      const next = (t.take_profits || [])[t.tp_hit || 0];
      if (next != null && (buy ? p >= Number(next) : p <= Number(next))) return true;
      const sl = curStop(t);
      return sl != null && (buy ? p <= Number(sl) : p >= Number(sl));
    });
    if (crossed) load();
  }, [tickers, trades, load]);
  const stats = useMemo(() => {
    const won = history.filter((t) => t.status === 'won').length;
    const lost = history.filter((t) => t.status === 'lost').length;
    const realized = history.reduce((a, t) => a + (Number(t.pnl_usdt) || 0), 0);
    const worstR = trades.reduce((a, t) => Math.max(a, Number(t.max_drawdown_r) || 0), 0);
    return { won, lost, realized, worstR, rate: won + lost ? Math.round((won / (won + lost)) * 100) : null };
  }, [history, trades]);

  // Lines and markers on the chart for this pair.
  const { lines, markers } = useMemo(() => {
    const L = [];
    const M = [];
    for (const t of trades.filter((x) => x.symbol === symbol)) {
      const buy = t.side === 'BUY';
      if (t.status === 'open') {
        L.push({ price: t.entry, color: C.blue, title: `${buy ? 'Long' : 'Short'} ${fmtQty(t.qty)}`, dashed: false, width: 2 });
        if (t.stop_loss != null) L.push({ price: curStop(t), color: C.down, title: trailed(t) ? 'SL (trailed)' : 'SL' });
        (t.take_profits || []).forEach((p, i) => { if (i >= (t.tp_hit || 0)) L.push({ price: p, color: C.up, title: `TP${i + 1}` }); });
      }
      if (t.status === 'pending') L.push({ price: t.entry, color: C.gold, title: `Limit ${buy ? 'buy' : 'sell'} ${fmtQty(t.qty)}` });
      const filled = t.filled_at || (t.status !== 'pending' && t.created_at);
      if (filled) M.push({ t: new Date(filled).getTime(), position: buy ? 'belowBar' : 'aboveBar', color: buy ? C.up : C.down, shape: buy ? 'arrowUp' : 'arrowDown', text: buy ? 'B' : 'S' });
      if (['won', 'lost'].includes(t.status) && t.closed_at) M.push({ t: new Date(t.closed_at).getTime(), position: buy ? 'aboveBar' : 'belowBar', color: t.status === 'won' ? C.up : C.down, shape: 'circle', text: t.status === 'won' ? 'TP' : 'SL' });
    }
    for (const s of activeSignals.filter((x) => x.symbol === symbol && !tradedSignalIds.has(x.id))) {
      L.push({ price: s.entry, color: '#B98CFF', title: `Signal ${s.side === 'BUY' ? 'buy' : 'sell'}` });
      if (s.stop_loss != null) L.push({ price: s.stop_loss, color: 'rgba(246,70,93,.6)', title: 'Sig SL' });
      (s.take_profits || []).slice(0, 3).forEach((p, i) => L.push({ price: p, color: 'rgba(14,203,129,.6)', title: `Sig TP${i + 1}` }));
      M.push({ t: new Date(s.created_at).getTime(), position: s.side === 'BUY' ? 'belowBar' : 'aboveBar', color: '#B98CFF', shape: 'circle', text: 'Signal' });
    }
    return { lines: L, markers: M };
  }, [trades, activeSignals, tradedSignalIds, symbol]);

  async function closeTrade(t) {
    const pending = t.status === 'pending';
    if (!pending && !window.confirm(`Close ${base(t.symbol)} ${t.side === 'BUY' ? 'long' : 'short'} at market?`)) return;
    setBusyId(t.id);
    try {
      const r = await fetch('/api/trading/trades', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id }) });
      const j = await r.json();
      if (!r.ok) flash(j.error || 'Could not close.', true);
      else flash(pending ? 'Order cancelled.' : `Closed: ${fmtUsd(j.trade.pnl_usdt)}`, !pending && Number(j.trade.pnl_usdt) < 0);
      await load();
    } finally { setBusyId(''); }
  }
  async function deleteTrade(id) {
    if (!window.confirm('Remove this trade from history?')) return;
    await fetch(`/api/trading/trades?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  }
  async function enterSignal(s) {
    setBusyId(s.id);
    try {
      const r = await fetch('/api/trading/trades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signalId: s.id, riskUsdt: Number(entryRisk[s.id]) > 0 ? Number(entryRisk[s.id]) : undefined }) });
      const j = await r.json();
      if (!r.ok) flash(j.error || 'Could not enter the trade.', true);
      else { flash(`Entered ${base(s.symbol)} ${s.side === 'BUY' ? 'long' : 'short'}.`); pickSymbol(s.symbol); }
      await load();
    } finally { setBusyId(''); }
  }
  async function deleteSignal(id) {
    if (!window.confirm('Delete this signal?')) return;
    await fetch(`/api/signals?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  }
  async function saveSettings(patch = {}) {
    if (!settings || !form) return;
    const body = { auto_enabled: settings.auto_enabled, mode: 'paper', paper_balance: Number(form.balance), risk_mode: form.riskMode, risk_pct: Number(form.pct), risk_usdt: Number(form.fixed), min_rr: Number(form.rr), ...patch };
    const r = await fetch('/api/trading/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { flash(j.error || 'Could not save settings.', true); return; }
    setSettings(j.settings);
    setAccount(j.account);
    setRiskNow(j.riskNow);
    flash('Settings saved.');
  }
  async function useBinanceBalance() {
    try {
      const r = await fetch('/api/binance/balances', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || !j.configured || !(Number(j.totalUsdt) > 0)) { flash(j.error || 'Could not read your Binance balance.', true); return; }
      setForm((f) => ({ ...f, balance: String(Math.floor(Number(j.totalUsdt) * 100) / 100) }));
      flash('Balance filled from Binance. Tap Save to use it.');
    } catch { flash('Could not read your Binance balance.', true); }
  }

  const listenerAge = inbox.listener?.seenAt ? Date.now() - new Date(inbox.listener.seenAt).getTime() : null;
  const listenerOn = listenerAge != null && listenerAge < 8 * 60e3;
  const skippedCount = inbox.inbox.filter((m) => m.outcome === 'unparsed').length;

  const bySymbol = useMemo(() => {
    const map = {};
    for (const s of activeSignals) (map[s.symbol] = map[s.symbol] || []).push(s);
    return Object.entries(map).map(([sym, list]) => ({ sym, list, conflict: new Set(list.map((s) => s.side)).size > 1 })).filter((g) => g.list.length > 1);
  }, [activeSignals]);
  // The report card scores the MT5 demo accounts once they have finished trades; until then, Luxe's paper trades.
  const brokerScored = useMemo(() => brokerResults(brokerRows || []), [brokerRows]);
  const groupsFromBroker = brokerScored.some((r) => ['won', 'lost'].includes(r.status));
  const groups = useMemo(() => groupReport(groupsFromBroker ? brokerScored : trades), [groupsFromBroker, brokerScored, trades]);

  const signalRow = (s, canEnter) => {
    const [label, color] = SIGNAL_STATUS[s.status] || SIGNAL_STATUS.open;
    const tps = s.take_profits || [];
    const entered = tradedSignalIds.has(s.id);
    const rr = s.stop_loss != null && tps.length ? Math.abs(tps[0] - s.entry) / Math.abs(s.entry - s.stop_loss) : null;
    return (
      <div key={s.id} className="tx-row">
        <div className="tx-row-top">
          <button className="tx-sym" onClick={() => pickSymbol(s.symbol)}>{base(s.symbol)}<i>/{quoteOf(s.symbol)}</i></button>
          <Side side={s.side} />
          <span className="tx-st" style={{ color }}>{label}{s.status === 'open' && s.tp_hit > 0 ? ` · TP${s.tp_hit} ✓` : ''}</span>
          <span style={{ flex: 1 }} />
          {s.result_pct != null && <b className="font-num" style={{ color: Number(s.result_pct) >= 0 ? C.up : C.down }}>{Number(s.result_pct) >= 0 ? '+' : ''}{s.result_pct}%</b>}
          <button className="tx-x" onClick={() => deleteSignal(s.id)} aria-label="Delete signal">✕</button>
        </div>
        <div className="tx-row-grid font-num">
          <div><span>Source</span><b>{s.source}</b></div>
          <div><span>Entry</span><b>{fmtPrice(s.entry)}</b></div>
          <div><span>TP</span><b style={{ color: C.up }}>{tps.length ? tps.map((p) => fmtPrice(p)).join(' / ') : '—'}</b></div>
          <div><span>SL</span><b style={{ color: C.down }}>{s.stop_loss != null ? fmtPrice(s.stop_loss) : '—'}</b></div>
          <div><span>R:R</span><b>{rr ? `1:${rr.toFixed(2)}` : '—'}</b></div>
          <div><span>Received</span><b>{ago(s.created_at)}</b></div>
        </div>
        {canEnter && (
          <div className="tx-row-actions">
            {entered ? <span className="tx-muted">In a trade</span> : s.stop_loss == null ? <span className="tx-muted">No stop-loss, can&apos;t size risk</span> : (
              <>
                <input className="font-num" inputMode="decimal" placeholder={`risk $${riskNow.toFixed(2)}`} value={entryRisk[s.id] ?? ''} onChange={(e) => setEntryRisk((m) => ({ ...m, [s.id]: e.target.value }))} />
                <button className={`tx-btn ${s.side === 'BUY' ? 'buy' : 'sell'}`} disabled={busyId === s.id} onClick={() => enterSignal(s)}>{busyId === s.id ? '…' : `Enter ${s.side === 'BUY' ? 'long' : 'short'}`}</button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const positionRow = (t) => {
    const mark = tickers[t.symbol]?.c;
    const pnl = livePnl(t, mark) ?? Number(t.pnl_usdt);
    const pct = Number(t.notional) ? (pnl / Number(t.notional)) * 100 : 0;
    return (
      <div key={t.id} className="tx-row">
        <div className="tx-row-top">
          <button className="tx-sym" onClick={() => pickSymbol(t.symbol)}>{base(t.symbol)}<i>/{quoteOf(t.symbol)}</i></button>
          <Side side={t.side} />
          <span className="tx-st">{t.source === 'Manual' ? 'Manual' : t.auto ? `Auto · ${t.source}` : t.source}{t.tp_hit > 0 ? ` · TP${t.tp_hit} ✓` : ''}</span>
          <span style={{ flex: 1 }} />
          <b className="font-num" style={{ color: pnl >= 0 ? C.up : C.down }}>{fmtUsd(pnl)} <small>({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)</small></b>
        </div>
        <div className="tx-row-grid font-num">
          <div><span>Size</span><b>{fmtQty(t.qty)} {base(t.symbol)}</b></div>
          <div><span>Value</span><b>{fmtUsd(t.notional, false)}</b></div>
          <div><span>Entry</span><b>{fmtPrice(t.entry)}</b></div>
          <div><span>Mark</span><b>{mark ? fmtPrice(mark) : '—'}</b></div>
          <div><span>SL{trailed(t) ? ' (trailed)' : ''}</span><b title={t.trail_mode ? `Trailing: ${TRAIL_LABEL[t.trail_mode] || t.trail_mode}` : undefined} style={{ color: trailed(t) ? C.up : C.down }}>{t.stop_loss != null ? fmtPrice(curStop(t)) : '—'}</b></div>
          <div><span>Banked</span><b style={{ color: C.up }}>{t.tp_hit > 0 ? fmtUsd(livePnl(t, Number(t.entry))) : '—'}</b></div>
          <div><span>Lots</span><b>{lotsLabel(t)}</b></div>
          <div><span>Risk</span><b style={{ color: C.down }}>{t.actual_risk_usdt != null || t.risk_usdt != null ? fmtUsd(Number(t.actual_risk_usdt ?? t.risk_usdt), false) : '—'}</b></div>
          <div><span>R:R (avg)</span><b title={rrDetail(rrPlan(t))}>{rrText(rrPlan(t))}</b></div>
          <div><span>{pipSize(t.symbol) ? 'Pips now' : 'Move now'}</span><b style={{ color: mark && (t.side === 'BUY' ? mark >= Number(t.entry) : mark <= Number(t.entry)) ? C.up : C.down }}>{moveLabel(t, mark)}</b></div>
          <div><span>Best move</span><b style={{ color: C.up }}>{moveLabel(t, t.max_favorable_price)}</b></div>
          <div><span>{pipSize(t.symbol) ? 'Pips banked' : 'Banked at'}</span><b style={{ color: C.up }}>{t.tp_hit > 0 ? `${bankedPipsLabel(t)} (TP${t.tp_hit})` : '—'}</b></div>
        </div>
        {rrPlan(t)?.n > 1 && <div className="tx-row-note font-num">R:R per target: {rrDetail(rrPlan(t))}</div>}
        {(t.take_profits || []).length > 0 && (
          <div className="tx-ladder font-num">
            {t.take_profits.map((p, i) => {
              const hit = i < (t.tp_hit || 0);
              const next = i === (t.tp_hit || 0);
              const dist = mark ? ((Number(p) - mark) / mark) * 100 : null;
              return (
                <span key={i} className={hit ? 'hit' : next ? 'next' : ''}>
                  {hit ? '✓ ' : ''}TP{i + 1} {fmtPrice(p)}
                  {!hit && dist != null && <small> {dist >= 0 ? '+' : ''}{dist.toFixed(2)}%</small>}
                  <small> · {fmtQty(Number(t.qty) / t.take_profits.length)}</small>
                </span>
              );
            })}
          </div>
        )}
        {(t.min_forced || (t.actual_risk_usdt != null && Number(t.actual_risk_usdt) < Number(t.risk_usdt) * 0.95) || Number(t.max_drawdown_usdt) > 0) && (
          <div className="tx-row-note">
            {t.min_forced && <span style={{ color: C.gold }}>⚠ Raised to Binance minimum size (more risk than planned). </span>}
            {!t.min_forced && t.actual_risk_usdt != null && Number(t.actual_risk_usdt) < Number(t.risk_usdt) * 0.95 && <span style={{ color: C.gold }}>Size capped by free balance: risking {fmtUsd(t.actual_risk_usdt, false)} instead of {fmtUsd(t.risk_usdt, false)}. </span>}
            {Number(t.max_drawdown_usdt) > 0 && <span>Worst so far {fmtUsd(-t.max_drawdown_usdt)}{t.max_drawdown_r != null ? ` (${Number(t.max_drawdown_r).toFixed(2)}R)` : ''}.</span>}
          </div>
        )}
        <div className="tx-row-actions">
          <span className="tx-muted">opened {ago(t.filled_at || t.created_at)}</span>
          <span style={{ flex: 1 }} />
          <button className="tx-btn ghost" disabled={busyId === t.id} onClick={() => closeTrade(t)}>{busyId === t.id ? '…' : 'Close at market'}</button>
        </div>
      </div>
    );
  };

  const orderRow = (t) => (
    <div key={t.id} className="tx-row">
      <div className="tx-row-top">
        <button className="tx-sym" onClick={() => pickSymbol(t.symbol)}>{base(t.symbol)}<i>/{quoteOf(t.symbol)}</i></button>
        <span className="tx-badge" style={{ color: t.side === 'BUY' ? C.up : C.down, background: t.side === 'BUY' ? C.upDim : C.downDim }}>Limit {t.side === 'BUY' ? 'Buy' : 'Sell'}</span>
        <span className="tx-st">{t.source === 'Manual' ? 'Manual' : t.source}</span>
        <span style={{ flex: 1 }} />
        <button className="tx-btn ghost" disabled={busyId === t.id} onClick={() => closeTrade(t)}>{busyId === t.id ? '…' : 'Cancel'}</button>
      </div>
      <div className="tx-row-grid font-num">
        <div><span>Price</span><b>{fmtPrice(t.entry)}</b></div>
        <div><span>Amount</span><b>{fmtQty(t.qty)}</b></div>
        <div><span>Value</span><b>{fmtUsd(t.notional, false)}</b></div>
        <div><span>Filled</span><b>0%</b></div>
        <div><span>TP / SL</span><b>{(t.take_profits || [])[0] ? fmtPrice(t.take_profits[0]) : '—'} / {t.stop_loss != null ? fmtPrice(t.stop_loss) : '—'}</b></div>
        <div><span>Placed</span><b>{ago(t.created_at)}</b></div>
      </div>
    </div>
  );

  const historyRow = (t) => {
    const pnl = Number(t.pnl_usdt);
    const cancelled = t.status === 'expired' && t.pnl_usdt == null;
    const label = cancelled ? (t.filled_at ? 'Expired' : 'Cancelled') : t.status === 'won' ? 'Won' : t.status === 'lost' ? 'Lost' : 'Expired';
    return (
      <div key={t.id} className="tx-row">
        <div className="tx-row-top">
          <button className="tx-sym" onClick={() => pickSymbol(t.symbol)}>{base(t.symbol)}<i>/{quoteOf(t.symbol)}</i></button>
          <Side side={t.side} />
          <span className="tx-st" style={{ color: t.status === 'won' ? C.up : t.status === 'lost' ? C.down : '#848E9C' }}>{label}</span>
          <span style={{ flex: 1 }} />
          {!cancelled && Number.isFinite(pnl) && <b className="font-num" style={{ color: pnl >= 0 ? C.up : C.down }}>{fmtUsd(pnl)}</b>}
          <button className="tx-x" onClick={() => deleteTrade(t.id)} aria-label="Delete">✕</button>
        </div>
        <div className="tx-row-grid font-num">
          <div><span>Entry</span><b>{fmtPrice(t.entry)}</b></div>
          <div><span>Exit</span><b>{cancelled ? '—' : fmtPrice(t.last_price)}</b></div>
          <div><span>Lots</span><b>{lotsLabel(t)}</b></div>
          <div><span>Source</span><b>{t.source}</b></div>
          <div><span>TP hit</span><b>{t.tp_hit || 0}/{(t.take_profits || []).length}</b></div>
          <div><span>Closed</span><b>{t.closed_at ? new Date(t.closed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</b></div>
          <div><span>Risk</span><b>{t.actual_risk_usdt != null || t.risk_usdt != null ? fmtUsd(Number(t.actual_risk_usdt ?? t.risk_usdt), false) : '—'}</b></div>
          <div><span>R:R planned</span><b title={rrDetail(rrPlan(t))}>{rrText(rrPlan(t))}</b></div>
          <div><span>Result</span><b style={{ color: (resultR(t) ?? 0) >= 0 ? C.up : C.down }}>{!cancelled && resultR(t) != null ? `${resultR(t) >= 0 ? '+' : ''}${resultR(t).toFixed(2)}R` : '—'}</b></div>
          <div><span>{pipSize(t.symbol) ? 'Pips moved' : 'Moved'}</span><b>{cancelled ? '—' : moveLabel(t, t.last_price)}</b></div>
          <div><span>Best move</span><b style={{ color: C.up }}>{cancelled ? '—' : moveLabel(t, t.max_favorable_price)}</b></div>
          <div><span>{pipSize(t.symbol) ? 'Pips profit' : 'Profit %'}</span><b style={{ color: Number(t.pnl_usdt) >= 0 ? C.up : C.down }}>{cancelled ? '—' : netPipsLabel(t)}</b></div>
        </div>
      </div>
    );
  };

  const TABS = [
    ['positions', `Positions (${positions.length})`],
    ['orders', `Open orders (${orders.length})`],
    ['history', 'History'],
    ['signals', `Signals (${activeSignals.length})`],
    ['telegram', 'Telegram'],
    ['mt5', 'MT5 accounts'],
    ['wallet', 'Binance wallet'],
    ['settings', 'Settings']
  ];

  return (
    <Layout fab={false}>
      <Head><title>Trading · Luxe</title></Head>
      <div className="tx-root">
        {/* Pair header */}
        <div className="tx-head">
          <button className="tx-pair" onClick={() => setPicker(true)}>
            <b>{base(symbol)}/{quoteOf(symbol)}</b><span>▾</span>
          </button>
          <div className="tx-last font-num" style={{ color: change == null ? 'inherit' : change >= 0 ? C.up : C.down }}>
            {last ? fmtPrice(last) : '—'}
            <small>{change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : ''}</small>
          </div>
          <div className="tx-stats font-num">
            <div><span>24h High</span><b>{tk ? fmtPrice(tk.h) : '—'}</b></div>
            <div><span>24h Low</span><b>{tk ? fmtPrice(tk.l) : '—'}</b></div>
            <div><span>24h Vol(USDT)</span><b>{tk ? fmtCompact(tk.q) : '—'}</b></div>
          </div>
          <span style={{ flex: 1 }} />
          <button className={`tx-live ${listenerOn ? 'on' : ''}`} onClick={() => setTab('telegram')} title="Telegram listener">
            <i />{listenerOn ? 'Telegram live' : inbox.listener?.seenAt ? 'Telegram offline' : 'Telegram'}
          </button>
          {alerts !== 'granted' && alerts !== 'unsupported' && <button className="tx-bell" onClick={enableAlerts}>🔔 Enable alerts</button>}
          <span className="tx-paper">PAPER</span>
        </div>

        {/* Account strip */}
        <div className="tx-acct font-num">
          <div><span>Equity (live)</span><b style={{ color: equityLive == null ? 'inherit' : equityLive >= Number(settings?.paper_balance) ? C.up : C.down }}>{equityLive != null ? fmtUsd(equityLive, false) : '—'}</b></div>
          <div><span>Wallet balance</span><b>{account ? fmtUsd(account.equity, false) : '—'}</b></div>
          <div><span>Available</span><b>{account ? fmtUsd(account.available, false) : '—'}</b></div>
          <div><span>In orders</span><b>{account ? fmtUsd(account.locked, false) : '—'}</b></div>
          <div><span>Unrealized</span><b style={{ color: unrealized >= 0 ? C.up : C.down }}>{fmtUsd(unrealized)}</b></div>
          <div><span>Realized</span><b style={{ color: (account?.realized ?? stats.realized) >= 0 ? C.up : C.down }}>{fmtUsd(account?.realized ?? stats.realized)}</b></div>
          <div><span>Win rate</span><b>{stats.rate == null ? '—' : `${stats.rate}%`}</b></div>
          <div className="tx-auto">
            <span>Auto-trade signals</span>
            <button className={`tx-switch ${settings?.auto_enabled ? 'on' : ''}`} onClick={() => saveSettings({ auto_enabled: !settings?.auto_enabled })} aria-label="Auto-trade signals"><i /></button>
          </div>
        </div>

        <NewsStrip symbol={symbol} />

        <div className="tx-grid">
          <div className="tx-main">
            <TradeChart symbol={symbol} interval={interval} onInterval={pickInterval} lines={lines} markers={markers} onPickPrice={pickPrice} />
          </div>
          <div className="tx-side-col">
            <OrderForm symbol={symbol} livePrice={last} account={account} riskNow={riskNow} picked={picked} onPlaced={load} />
            {isMt5(symbol)
              ? <div className="tx-empty" style={{ padding: 16 }}>No public order book for {base(symbol)}/{quoteOf(symbol)}: it trades on MT5 brokers. Price is the live market rate; paper fills include a typical broker spread.</div>
              : <OrderBook symbol={symbol} onPickPrice={pickPrice} />}
          </div>
        </div>

        {/* Bottom panel */}
        <div className="tx-panel tx-bottom">
          <div className="tx-tabs">
            {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{k === 'telegram' && skippedCount > 0 ? <em>{skippedCount}</em> : null}</button>)}
          </div>

          {tab === 'positions' && (loading ? <div className="tx-empty">Loading…</div> : positions.length ? positions.map(positionRow) : <div className="tx-empty">No open positions. Place an order above, or turn on auto-trade to follow Telegram signals.</div>)}
          {tab === 'orders' && (orders.length ? orders.map(orderRow) : <div className="tx-empty">No open orders. Limit orders wait here until price reaches them.</div>)}
          {tab === 'history' && (
            <>
              <div className="tx-summary font-num">
                <div><span>Closed P&amp;L</span><b style={{ color: stats.realized >= 0 ? C.up : C.down }}>{fmtUsd(stats.realized)}</b></div>
                <div><span>Won / lost</span><b>{stats.won} / {stats.lost}</b></div>
                <div><span>Win rate</span><b>{stats.rate == null ? '—' : `${stats.rate}%`}</b></div>
                <div><span>Worst dip</span><b>{stats.worstR ? `${stats.worstR.toFixed(2)}R` : '—'}</b></div>
              </div>
              {history.length ? history.map(historyRow) : <div className="tx-empty">Closed trades show up here.</div>}
            </>
          )}
          {tab === 'signals' && (
            <>
              {bySymbol.length > 0 && bySymbol.map((g) => (
                <div key={g.sym} className="tx-row-note" style={{ padding: '10px 14px', borderBottom: '1px solid var(--tx-line)' }}>
                  <b>{base(g.sym)}</b> {g.conflict ? <span style={{ color: C.gold }}>⚠ groups disagree</span> : <span style={{ color: C.up }}>✓ groups agree</span>}: {g.list.map((s) => `${s.source} ${s.side}`).join(' · ')}
                </div>
              ))}
              {activeSignals.length ? activeSignals.map((s) => signalRow(s, true)) : (
                <div className="tx-empty">No active signals. New ones appear here the moment the Telegram listener forwards them. Check the Telegram tab to see every message that came in and why any were skipped.</div>
              )}
              {groups.length > 0 && (
                <div className="tx-board">
                  <div className="tx-sub">Group report card</div>
                  <div className="tx-row-note" style={{ padding: '0 14px 8px' }}>
                    {groupsFromBroker ? 'Scored from the MT5 demo accounts (each signal on each account counts once). ' : 'Every signal is paper-traded on its own. '}R = profit ÷ risk (+1R made what it risked, −1R hit the stop). Confidence grows as a group keeps winning, and its lot size grows with it (up to ×3). New groups stay small until {GROUP_MIN_TRADES} closed trades; 3 stop-losses in a row halve the size.
                  </div>
                  {groups.map((g) => {
                    const v = { scale: [C.up, `Lots ×${g.lotMultiplier}`], keep: ['#EAECEF', `Lots ×${g.lotMultiplier}`], testing: [C.gold, `Testing ×${g.lotMultiplier}`], drop: [C.down, 'Drop'] }[g.verdict];
                    return (
                      <div key={g.source} className="tx-group font-num">
                        <div className="tx-group-top">
                          <b>{g.source}</b>
                          <span className="tx-badge" style={{ color: v[0], background: 'rgba(132,142,156,.12)' }}>{v[1]}</span>
                        </div>
                        <div className="tx-conf" title={`${g.confidence}% confident this group makes money`}>
                          <i style={{ width: `${g.confidence}%`, background: g.confidence >= 75 ? C.up : g.confidence >= 50 ? C.gold : C.down }} />
                          <span>{g.confidence}% confident</span>
                        </div>
                        <div className="tx-muted">
                          {g.closed} closed{g.open ? ` · ${g.open} open` : ''} · {g.winRate}% win · <b style={{ color: g.avgR >= 0 ? C.up : C.down }}>{g.avgR >= 0 ? '+' : ''}{g.avgR.toFixed(2)}R/trade</b> · total {g.totalR >= 0 ? '+' : ''}{g.totalR.toFixed(1)}R · worst run {g.worstStreak} SL
                        </div>
                        <div className="tx-muted" style={{ marginTop: 2 }}>{g.why}</div>
                        {(() => {
                          const p = settings?.trail_profiles?.channels?.[g.source];
                          const best = p?.scores?.[p.mode];
                          return (
                            <div className="tx-muted" style={{ marginTop: 2 }}>
                              Trailing stop: <b>{TRAIL_LABEL[p?.mode || TRAIL_DEFAULT]}</b>
                              {p && p.trades >= 8 && best?.avgR != null ? ` · learned from ${p.trades} trades (${best.avgR >= 0 ? '+' : ''}${best.avgR.toFixed(2)}R avg)` : ' · default until 8 closed trades'}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
              {closedSignals.length > 0 && <button className="tx-link" style={{ margin: 14 }} onClick={() => setShowClosedSignals((v) => !v)}>{showClosedSignals ? 'Hide' : 'Show'} {closedSignals.length} closed signals</button>}
              {showClosedSignals && closedSignals.map((s) => signalRow(s, false))}
            </>
          )}
          {tab === 'telegram' && (
            <>
              <div className="tx-tg-status">
                <span className={`tx-live ${listenerOn ? 'on' : ''}`}><i />{listenerOn ? 'Listener connected' : 'Listener not reporting'}</span>
                <span className="tx-muted">
                  {inbox.listener?.seenAt ? `last heartbeat ${ago(inbox.listener.seenAt)}` : 'no heartbeat yet'}
                  {inbox.listener?.stats ? ` · ${inbox.listener.stats.seen} messages seen · ${inbox.listener.stats.forwarded} forwarded` : ''}
                  {inbox.listener?.stats?.watching?.length ? ` · watching ${inbox.listener.stats.watching.join(', ')}` : ''}
                </span>
              </div>
              {inbox.needsMigration && (
                <div className="tx-row-note" style={{ padding: '10px 14px', color: C.gold }}>
                  Run <code>supabase-migration-signal-inbox.sql</code> in the Supabase SQL editor to turn on this inbox and the listener status.
                </div>
              )}
              <div className="tx-row-note" style={{ padding: '6px 14px 10px' }}>
                &quot;Forwarded&quot; in the listener log means the message was sent here. Each one is listed below with what happened to it. Only messages with a pair, a direction and a TP or SL become signals.
              </div>
              {inbox.inbox.length ? inbox.inbox.map((m) => {
                const o = OUTCOME[m.outcome] || { label: m.outcome, color: '#848E9C' };
                return (
                  <details key={m.id} className="tx-inbox">
                    <summary>
                      <span className="tx-badge" style={{ color: o.color, background: 'rgba(132,142,156,.12)' }}>{o.label}</span>
                      <b>{m.source}</b>
                      <span className="tx-muted">{ago(m.created_at)}</span>
                      <span className="tx-inbox-detail">{m.detail || (m.text || '').normalize('NFKC').slice(0, 80)}</span>
                    </summary>
                    <pre>{(m.text || '').normalize('NFKC')}</pre>
                  </details>
                );
              }) : !inbox.needsMigration && <div className="tx-empty">No messages forwarded yet.</div>}
            </>
          )}
          <div style={{ display: tab === 'mt5' ? 'block' : 'none' }}><BrokerPanel onData={setBrokerRows} flash={flash} /></div>
          {tab === 'wallet' && <WalletPanel onTrade={(sym) => { pickSymbol(sym); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}
          {tab === 'settings' && form && settings && (
            <div className="tx-settings">
              <div className="tx-set-row">
                <div><b>Auto-trade Telegram signals</b><span>{settings.auto_enabled ? 'On: every new signal with a stop-loss opens a paper trade, sized by your risk.' : 'Off: signals are listed and you enter them yourself.'}</span></div>
                <button className={`tx-switch ${settings.auto_enabled ? 'on' : ''}`} onClick={() => saveSettings({ auto_enabled: !settings.auto_enabled })} aria-label="Auto-trade"><i /></button>
              </div>
              <GrowthCard />
              <label className="tx-field"><span>Starting balance</span><input className="font-num" inputMode="decimal" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} /><em>USDT</em></label>
              <button className="tx-link" onClick={useBinanceBalance}>Use my real Binance balance</button>
              <div className="tx-tabs small" style={{ margin: '10px 0' }}>
                <button className={form.riskMode === 'percent' ? 'on' : ''} onClick={() => setForm({ ...form, riskMode: 'percent' })}>Risk % of equity</button>
                <button className={form.riskMode === 'fixed' ? 'on' : ''} onClick={() => setForm({ ...form, riskMode: 'fixed' })}>Fixed $ risk</button>
              </div>
              {form.riskMode === 'percent'
                ? <label className="tx-field"><span>Risk per trade</span><input className="font-num" inputMode="decimal" value={form.pct} onChange={(e) => setForm({ ...form, pct: e.target.value })} /><em>%</em></label>
                : <label className="tx-field"><span>Risk per trade</span><input className="font-num" inputMode="decimal" value={form.fixed} onChange={(e) => setForm({ ...form, fixed: e.target.value })} /><em>USDT</em></label>}
              <label className="tx-field"><span>Min reward:risk</span><input className="font-num" inputMode="decimal" value={form.rr} onChange={(e) => setForm({ ...form, rr: e.target.value })} /><em>0 = off</em></label>
              <button className="tx-submit buy" onClick={() => saveSettings({})}>Save settings</button>
              <p className="tx-fine">
                How the simulation works: market orders fill at the best ask (buy) or bid (sell), so you pay the spread like on Binance. Limit orders that cross the book fill straight away; otherwise they wait until price trades through them. Fees are 0.1% per side. Sizes follow Binance&apos;s lot-size, tick-size and minimum-order rules, and you can&apos;t spend more than your free balance. Signal trades scale out equally across their take-profits and trail the stop once TP1 is hit, in the style that has worked best for that channel (learned from its past trades every 6 hours; ATR ×2 until there is enough history). They close after 7 days; manual orders stay open until TP, SL or you close them. If a stop and a target are hit in the same candle, the stop counts. Selling a coin you don&apos;t hold is a simulated short. Next trade risks {fmtUsd(riskNow, false)}.
              </p>
            </div>
          )}
        </div>
      </div>

      {picker && <PairPicker current={symbol} highlight={activeSignals.map((s) => s.symbol)} onPick={pickSymbol} onClose={closePicker} />}
      {toast && <div className="tx-toast" style={{ borderColor: toast.err ? C.down : C.up }}>{toast.text}</div>}

      <style jsx global>{`
        .tx-root { --tx-bg: #0B0E11; --tx-panel: #181A20; --tx-line: #2B3139; --tx-text: #EAECEF; --tx-dim: #848E9C; --tx-input: #0B0E11;
          background: var(--tx-bg); color: var(--tx-text); padding: 8px 8px 110px; min-height: 100vh; font-size: 13px; }
        .tx-root button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
        .tx-root input { font: inherit; color: var(--tx-text); background: transparent; border: 0; outline: none; min-width: 0; }
        .tx-panel { background: var(--tx-panel); border-radius: 8px; overflow: hidden; }
        .tx-muted { color: var(--tx-dim); font-size: 12px; }

        .tx-head { display: flex; align-items: center; gap: 14px; padding: 10px 12px; background: var(--tx-panel); border-radius: 8px; flex-wrap: wrap; }
        .tx-pair { display: flex; align-items: center; gap: 6px; font-size: 18px; }
        .tx-pair span { color: var(--tx-dim); font-size: 12px; }
        .tx-last { font-size: 20px; font-weight: 700; display: flex; flex-direction: column; line-height: 1.1; }
        .tx-last small { font-size: 12px; font-weight: 600; }
        .tx-stats { display: flex; gap: 16px; }
        .tx-stats div, .tx-acct div, .tx-summary div { display: flex; flex-direction: column; gap: 2px; }
        .tx-stats span, .tx-acct span, .tx-summary span, .tx-row-grid span { color: var(--tx-dim); font-size: 11px; }
        .tx-stats b { font-size: 12px; font-weight: 600; }
        .tx-paper { font-size: 10px; font-weight: 800; letter-spacing: .08em; color: ${C.gold}; border: 1px solid rgba(240,185,11,.4); padding: 3px 7px; border-radius: 4px; }
        .tx-live { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--tx-dim); }
        .tx-live i { width: 7px; height: 7px; border-radius: 50%; background: #5E6673; }
        .tx-live.on { color: ${C.up}; }
        .tx-live.on i { background: ${C.up}; box-shadow: 0 0 0 3px rgba(14,203,129,.2); }

        .tx-acct { display: flex; gap: 18px; padding: 10px 12px; margin-top: 6px; background: var(--tx-panel); border-radius: 8px; overflow-x: auto; align-items: center; }
        .tx-acct b { font-size: 13px; white-space: nowrap; }
        .tx-acct .tx-auto { flex-direction: row; align-items: center; gap: 8px; margin-left: auto; white-space: nowrap; }
        .tx-switch { width: 36px; height: 20px; border-radius: 999px; background: #474D57 !important; position: relative; flex-shrink: 0; }
        .tx-switch i { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .15s; }
        .tx-switch.on { background: ${C.gold} !important; }
        .tx-switch.on i { left: 18px; }

        .tx-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 6px; margin-top: 6px; }
        .tx-side-col { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .tx-main { min-width: 0; }

        .tx-chart { background: var(--tx-bg); border: 1px solid var(--tx-line); border-radius: 8px; overflow: hidden; height: 100%; display: flex; flex-direction: column; }
        .tx-chart-bar { display: flex; align-items: center; gap: 2px; padding: 6px 8px; background: var(--tx-panel); overflow-x: auto; }
        .tx-iv { padding: 3px 7px; border-radius: 4px; color: var(--tx-dim) !important; font-size: 12px !important; white-space: nowrap; }
        .tx-iv.on { color: var(--tx-text) !important; background: #2B3139 !important; }
        .tx-dot { width: 7px; height: 7px; border-radius: 50%; background: #5E6673; margin-left: 6px; flex-shrink: 0; }
        .tx-dot.live { background: ${C.up}; }
        .tx-dot.warn { background: ${C.gold}; }
        .tx-chart-area { position: relative; flex: 1; min-height: 420px; }
        .tx-chart-canvas { position: absolute; inset: 0; }
        .tx-legend { position: absolute; z-index: 3; top: 6px; left: 8px; display: flex; gap: 8px; flex-wrap: wrap; font-size: 11px; color: var(--tx-dim); pointer-events: none; }
        .tx-legend b { font-weight: 500; }
        .tx-chart-msg { position: absolute; z-index: 3; top: 40%; width: 100%; text-align: center; color: ${C.down}; }

        .tx-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--tx-line); overflow-x: auto; padding: 0 8px; }
        .tx-tabs button { padding: 10px 8px; color: var(--tx-dim) !important; white-space: nowrap; position: relative; font-weight: 600; }
        .tx-tabs button.on { color: var(--tx-text) !important; }
        .tx-tabs button.on::after { content: ''; position: absolute; left: 30%; right: 30%; bottom: 0; height: 2px; background: ${C.gold}; border-radius: 2px; }
        .tx-tabs button em { font-style: normal; font-size: 10px; background: ${C.gold}; color: #000; border-radius: 999px; padding: 0 5px; margin-left: 4px; }
        .tx-tabs.small button { padding: 8px 6px; font-size: 12px; }

        .tx-ob-head { display: grid; grid-template-columns: 1.1fr 1fr 1fr; padding: 6px 10px; font-size: 11px; color: var(--tx-dim); }
        .tx-ob-head span:nth-last-child(-n+2), .tx-ob-row > span:nth-last-child(-n+2) { text-align: right; }
        .tx-ob-row { position: relative; display: grid !important; grid-template-columns: 1.1fr 1fr 1fr; width: 100%; padding: 2px 10px !important; font-size: 12px; line-height: 18px; text-align: left; }
        .tx-ob-row:hover { background: #2B3139 !important; }
        .tx-ob-row > span { position: relative; z-index: 1; color: var(--tx-text); }
        .tx-ob-depth { position: absolute; right: 0; top: 0; bottom: 0; z-index: 0 !important; }
        .tx-ob-mid { display: flex; align-items: baseline; gap: 10px; padding: 6px 10px; font-size: 17px; }
        .tx-ob-mid span { font-size: 11px; color: var(--tx-dim); }
        .tx-ob-ratio { display: flex; align-items: center; gap: 6px; padding: 8px 10px; font-size: 11px; }
        .tx-ob-ratio-bar { flex: 1; height: 4px; background: ${C.down}; border-radius: 2px; overflow: hidden; }
        .tx-ob-ratio-bar i { display: block; height: 100%; background: ${C.up}; }

        .tx-form { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
        .tx-form .tx-tabs { padding: 0; }
        .tx-side { display: grid; grid-template-columns: 1fr 1fr; background: #2B3139; border-radius: 6px; padding: 2px; }
        .tx-side button { padding: 7px 0; border-radius: 5px; font-weight: 700; color: var(--tx-dim) !important; }
        .tx-side .buy.on { background: ${C.up} !important; color: #fff !important; }
        .tx-side .sell.on { background: ${C.down} !important; color: #fff !important; }
        .tx-avbl { display: flex; justify-content: space-between; font-size: 12px; color: var(--tx-dim); }
        .tx-avbl b { color: var(--tx-text); font-weight: 600; }
        .tx-field { display: flex; align-items: center; gap: 8px; background: var(--tx-input); border: 1px solid var(--tx-line); border-radius: 6px; padding: 0 10px; height: 40px; }
        .tx-field:focus-within { border-color: ${C.gold}; }
        .tx-field.bad { border-color: ${C.down}; }
        .tx-field > span { color: var(--tx-dim); font-size: 12px; white-space: nowrap; }
        .tx-field input, .tx-field > b { flex: 1; text-align: right; font-size: 14px; font-weight: 600; }
        .tx-field.ghost > b { color: var(--tx-dim); font-weight: 500; font-size: 13px; }
        .tx-field em { font-style: normal; color: var(--tx-text); font-size: 12px; }
        .tx-pcts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
        .tx-pcts button { border: 1px solid var(--tx-line) !important; border-radius: 4px; padding: 3px 0; font-size: 11px; color: var(--tx-dim) !important; }
        .tx-pcts button:hover { border-color: ${C.gold} !important; color: var(--tx-text) !important; }
        .tx-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--tx-dim); }
        .tx-check input { accent-color: ${C.gold}; }
        .tx-link { color: ${C.gold} !important; font-size: 12px; text-align: left; padding: 0; }
        .tx-info { display: flex; flex-direction: column; gap: 3px; font-size: 11px; }
        .tx-info div { display: flex; justify-content: space-between; }
        .tx-info span { color: var(--tx-dim); }
        .tx-submit { height: 42px; border-radius: 6px; font-weight: 700; font-size: 14px; color: #fff !important; }
        .tx-submit.buy { background: ${C.up} !important; }
        .tx-submit.sell { background: ${C.down} !important; }
        .tx-submit:disabled { opacity: .6; }
        .tx-hint, .tx-fine { font-size: 11px; color: var(--tx-dim); line-height: 1.5; margin: 0; }
        .tx-note { font-size: 12px; }

        .tx-bottom { margin-top: 6px; }
        .tx-empty { padding: 28px 16px; color: var(--tx-dim); text-align: center; line-height: 1.6; }
        .tx-row { padding: 12px 14px; border-bottom: 1px solid var(--tx-line); }
        .tx-row-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .tx-sym { font-weight: 700; font-size: 14px; padding: 0 !important; }
        .tx-sym i { font-style: normal; color: var(--tx-dim); font-weight: 500; font-size: 12px; }
        .tx-badge { font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 3px; }
        .tx-st { font-size: 11px; color: var(--tx-dim); }
        .tx-x { color: var(--tx-dim) !important; padding: 2px 6px !important; }
        .tx-row-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
        .tx-row-grid div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .tx-row-grid b { font-weight: 500; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tx-row-note { font-size: 11px; color: var(--tx-dim); margin-top: 6px; line-height: 1.5; }
        .tx-row-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
        .tx-row-actions input { width: 100px; border: 1px solid var(--tx-line) !important; border-radius: 4px; padding: 5px 8px; font-size: 12px; }
        .tx-btn { padding: 6px 12px !important; border-radius: 4px; font-size: 12px; font-weight: 700; }
        .tx-btn.buy { background: ${C.up} !important; color: #fff !important; }
        .tx-btn.sell { background: ${C.down} !important; color: #fff !important; }
        .tx-btn.ghost { background: #2B3139 !important; }
        .tx-btn:disabled { opacity: .6; }
        .tx-summary { display: flex; gap: 22px; padding: 12px 14px; border-bottom: 1px solid var(--tx-line); flex-wrap: wrap; }
        .tx-summary b { font-size: 15px; }
        .tx-sub { padding: 14px 14px 6px; color: var(--tx-dim); font-size: 12px; font-weight: 700; }
        .tx-board-row { display: grid; grid-template-columns: 1.6fr 1fr 1fr .5fr; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--tx-line); font-size: 12px; }
        .tx-board-row b:last-child { text-align: right; }
        .tx-group { padding: 10px 14px; border-bottom: 1px solid var(--tx-line); font-size: 12px; line-height: 1.5; }
        .tx-conf { position: relative; height: 14px; border-radius: 7px; background: rgba(132,142,156,.15); overflow: hidden; margin: 4px 0; }
        .tx-conf i { position: absolute; inset: 0 auto 0 0; border-radius: 7px; opacity: .45; }
        .tx-conf span { position: relative; font-size: 10px; padding-left: 6px; line-height: 14px; }
        .tx-broker { padding: 12px 14px; border-bottom: 1px solid var(--tx-line); display: flex; flex-direction: column; gap: 6px; }
        .tx-group-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 2px; font-size: 13px; }
        .tx-tg-status { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; }
        .tx-tg-status .tx-live { font-size: 13px; font-weight: 700; }
        .tx-inbox { border-top: 1px solid var(--tx-line); }
        .tx-inbox summary { display: flex; align-items: center; gap: 8px; padding: 10px 14px; cursor: pointer; flex-wrap: wrap; list-style: none; }
        .tx-inbox summary::-webkit-details-marker { display: none; }
        .tx-inbox-detail { flex-basis: 100%; color: var(--tx-dim); font-size: 12px; }
        .tx-inbox pre { margin: 0 14px 12px; padding: 10px; background: var(--tx-bg); border-radius: 6px; white-space: pre-wrap; font-size: 12px; color: var(--tx-text); font-family: inherit; }
        .tx-settings { padding: 14px; display: flex; flex-direction: column; gap: 10px; max-width: 520px; }
        .tx-settings .tx-tabs { padding: 0; }
        .tx-set-row { display: flex; align-items: center; gap: 12px; }
        .tx-set-row div { flex: 1; display: flex; flex-direction: column; gap: 3px; }
        .tx-set-row span { color: var(--tx-dim); font-size: 12px; }

        .tx-bell { font-size: 11px; font-weight: 700; color: ${C.gold} !important; border: 1px solid rgba(240,185,11,.4) !important; border-radius: 4px; padding: 3px 8px !important; }
        .tx-ladder { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
        .tx-ladder span { font-size: 11px; padding: 4px 8px; border-radius: 4px; background: #2B3139; color: var(--tx-dim); }
        .tx-ladder span.hit { background: ${C.upDim}; color: ${C.up}; }
        .tx-ladder span.next { color: var(--tx-text); box-shadow: inset 0 0 0 1px ${C.up}; }
        .tx-ladder small { opacity: .75; }
        .tx-wallet-head { padding: 16px 14px; border-bottom: 1px solid var(--tx-line); }
        .tx-wallet-total { font-size: 28px; font-weight: 700; margin-top: 4px; }
        .tx-wallet-total small { font-size: 13px; color: var(--tx-dim); font-weight: 500; }
        .tx-alloc { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 14px; gap: 2px; }
        .tx-alloc i { display: block; height: 100%; }
        .tx-alloc-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; font-size: 11px; color: var(--tx-dim); }
        .tx-alloc-legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; }
        .tx-wallet-bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; }
        .tx-asset { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-top: 1px solid var(--tx-line); }
        .tx-coin { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; color: #fff; flex-shrink: 0; }
        .tx-asset-name { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .tx-asset-name em { font-style: normal; }
        .tx-asset-val { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .tx-modal { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,.6); display: flex; align-items: flex-start; justify-content: center; padding: 60px 12px 12px; }
        .tx-picker { width: 100%; max-width: 460px; max-height: calc(100vh - 80px); background: #1E2329; color: #EAECEF; border-radius: 10px; display: flex; flex-direction: column; overflow: hidden; font-size: 13px; }
        .tx-picker button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
        .tx-picker .tx-tabs { border-color: #2B3139; }
        .tx-search { margin: 12px; padding: 10px 12px; background: #0B0E11; border: 1px solid #2B3139; border-radius: 6px; color: #EAECEF; font: inherit; outline: none; }
        .tx-search:focus { border-color: ${C.gold}; }
        .tx-pick-head, .tx-pick-row { display: grid; grid-template-columns: 24px 1.6fr 1fr 78px; gap: 8px; align-items: center; padding: 8px 12px; }
        .tx-pick-head { font-size: 11px; color: #848E9C; }
        .tx-pick-head span:first-child { grid-column: 1 / 3; }
        .tx-pick-head span:not(:first-child) { text-align: right; }
        .tx-pick-list { overflow-y: auto; }
        .tx-pick-row { cursor: pointer; }
        .tx-pick-row:hover, .tx-pick-row.on { background: #2B3139; }
        .tx-pick-row > span:nth-child(3) { text-align: right; }
        .tx-pick-name { display: flex; align-items: baseline; gap: 2px; flex-wrap: wrap; min-width: 0; }
        .tx-pick-name i { font-style: normal; color: #848E9C; font-size: 11px; }
        .tx-pick-name em { font-style: normal; font-size: 9px; color: #B98CFF; border: 1px solid #B98CFF; border-radius: 3px; padding: 0 3px; margin-left: 4px; }
        .tx-pick-name small { flex-basis: 100%; color: #5E6673; font-size: 10px; }
        .tx-chg { text-align: center; color: #fff; border-radius: 4px; padding: 4px 0; font-size: 12px; font-weight: 600; }
        .tx-star { font-size: 14px; }
        .tx-toast { position: fixed; z-index: 210; left: 50%; bottom: 90px; transform: translateX(-50%); background: #1E2329; color: #EAECEF; border: 1px solid; border-radius: 8px; padding: 10px 16px; font-size: 13px; max-width: calc(100vw - 32px); box-shadow: 0 8px 24px rgba(0,0,0,.4); }

        @media (max-width: 1000px) {
          .tx-grid { grid-template-columns: minmax(0, 1fr); }
          .tx-chart-area { min-height: 360px; }
          /* Binance app layout: order form on the left, order book on the right */
          .tx-side-col { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); align-items: start; }
          .tx-row-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .tx-stats { display: none; }
        }
        @media (max-width: 640px) {
          .tx-root { padding: 4px 4px 110px; }
          .tx-ob-head, .tx-ob-row { grid-template-columns: 1.2fr 1fr !important; }
          .tx-ob-head span:nth-child(3), .tx-ob-row > span:nth-child(4) { display: none; }
          .tx-ob-row:not(:has(.tx-ob-depth)) > span:nth-child(3) { display: none; }
          .tx-field { height: 36px; padding: 0 8px; }
          .tx-field > span { font-size: 11px; }
          .tx-field input { font-size: 13px; }
          .tx-acct { gap: 14px; }
        }
        @media (max-width: 360px) {
          .tx-side-col { grid-template-columns: minmax(0, 1fr); }
        }
      `}</style>
    </Layout>
  );
}
