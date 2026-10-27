import { useEffect, useRef, useState } from 'react';
import { C, openStream, fmtPrice, fmtQty, base, REST } from './util';

const ROWS = 11;

// Live order book (top 20 levels, 100 ms) and the tape of recent trades. Tap a row to use its price.
export default function OrderBook({ symbol, onPickPrice }) {
  const [tab, setTab] = useState('book');
  const [book, setBook] = useState({ bids: [], asks: [] });
  const [trades, setTrades] = useState([]);
  const [last, setLast] = useState(null);
  const pending = useRef({ book: null, trades: [] });

  useEffect(() => {
    setBook({ bids: [], asks: [] });
    setTrades([]);
    setLast(null);
    pending.current = { book: null, trades: [] };
    let alive = true;
    fetch(`${REST}/aggTrades?symbol=${symbol}&limit=40`).then((r) => r.json()).then((rows) => {
      if (!alive || !Array.isArray(rows)) return;
      const list = rows.reverse().map((t) => ({ id: t.a, p: +t.p, q: +t.q, t: t.T, sell: t.m }));
      setTrades(list);
      if (list[0]) setLast({ p: list[0].p, sell: list[0].sell });
    }).catch(() => {});
    const s = symbol.toLowerCase();
    let lastMsg = Date.now();
    const poll = setInterval(async () => {
      if (Date.now() - lastMsg < 5000 || document.visibilityState !== 'visible') return;
      try {
        const [db, tr] = await Promise.all([fetch(`${REST}/depth?symbol=${symbol}&limit=20`).then((r) => r.json()), fetch(`${REST}/aggTrades?symbol=${symbol}&limit=20`).then((r) => r.json())]);
        if (db && db.bids) pending.current.book = db;
        if (Array.isArray(tr)) pending.current.trades = tr.reverse().map((t) => ({ id: t.a, p: +t.p, q: +t.q, t: t.T, sell: t.m }));
      } catch { /* next tick */ }
    }, 2000);
    const stop = openStream([`${s}@depth20@100ms`, `${s}@aggTrade`], (stream, d) => {
      lastMsg = Date.now();
      if (stream.endsWith('@aggTrade')) pending.current.trades.unshift({ id: d.a, p: +d.p, q: +d.q, t: d.T, sell: d.m });
      else pending.current.book = d;
    });
    // Repaint a few times a second instead of on every message, so phones stay smooth.
    const tick = setInterval(() => {
      const p = pending.current;
      if (p.book) {
        setBook({ bids: p.book.bids.map(([a, b]) => [+a, +b]), asks: p.book.asks.map(([a, b]) => [+a, +b]) });
        p.book = null;
      }
      if (p.trades.length) {
        const fresh = p.trades;
        p.trades = [];
        setLast({ p: fresh[0].p, sell: fresh[0].sell });
        setTrades((prev) => { const ids = new Set(prev.map((t) => t.id)); return [...fresh.filter((t) => !ids.has(t.id)), ...prev].slice(0, 40); });
      }
    }, 250);
    return () => { alive = false; stop(); clearInterval(tick); clearInterval(poll); };
  }, [symbol]);

  const asks = book.asks.slice(0, ROWS);
  const bids = book.bids.slice(0, ROWS);
  const cum = (rows) => { let s = 0; return rows.map(([p, q]) => { s += q; return [p, q, s]; }); };
  const a = cum(asks);
  const b = cum(bids);
  const max = Math.max(a.length ? a[a.length - 1][2] : 0, b.length ? b[b.length - 1][2] : 0) || 1;
  const bidQty = bids.reduce((x, [, q]) => x + q, 0);
  const askQty = asks.reduce((x, [, q]) => x + q, 0);
  const bidPct = bidQty + askQty ? (bidQty / (bidQty + askQty)) * 100 : 50;
  const spread = asks[0] && bids[0] ? asks[0][0] - bids[0][0] : null;

  const row = (side) => ([p, q, total]) => (
    <button key={`${side}${p}`} className="tx-ob-row font-num" onClick={() => onPickPrice?.(p)}>
      <span className="tx-ob-depth" style={{ width: `${(total / max) * 100}%`, background: side === 'ask' ? C.downDim : C.upDim }} />
      <span style={{ color: side === 'ask' ? C.down : C.up }}>{fmtPrice(p)}</span>
      <span>{fmtQty(q)}</span>
      <span>{fmtQty(p * q)}</span>
    </button>
  );

  return (
    <div className="tx-panel tx-ob">
      <div className="tx-tabs small">
        <button className={tab === 'book' ? 'on' : ''} onClick={() => setTab('book')}>Order Book</button>
        <button className={tab === 'trades' ? 'on' : ''} onClick={() => setTab('trades')}>Trades</button>
      </div>
      {tab === 'book' ? (
        <>
          <div className="tx-ob-head"><span>Price(USDT)</span><span>Amount({base(symbol)})</span><span>Total</span></div>
          <div className="tx-ob-side">{[...a].reverse().map(row('ask'))}</div>
          <div className="tx-ob-mid font-num">
            <b style={{ color: last ? (last.sell ? C.down : C.up) : 'inherit' }}>{last ? fmtPrice(last.p) : '—'} {last ? (last.sell ? '↓' : '↑') : ''}</b>
            {spread != null && <span>spread {fmtPrice(spread)}</span>}
          </div>
          <div className="tx-ob-side">{b.map(row('bid'))}</div>
          <div className="tx-ob-ratio font-num">
            <span style={{ color: C.up }}>B {bidPct.toFixed(0)}%</span>
            <div className="tx-ob-ratio-bar"><i style={{ width: `${bidPct}%` }} /></div>
            <span style={{ color: C.down }}>{(100 - bidPct).toFixed(0)}% S</span>
          </div>
        </>
      ) : (
        <>
          <div className="tx-ob-head"><span>Price(USDT)</span><span>Amount({base(symbol)})</span><span>Time</span></div>
          <div className="tx-ob-side">
            {trades.slice(0, ROWS * 2 + 1).map((t) => (
              <button key={t.id} className="tx-ob-row font-num" onClick={() => onPickPrice?.(t.p)}>
                <span style={{ color: t.sell ? C.down : C.up }}>{fmtPrice(t.p)}</span>
                <span>{fmtQty(t.q)}</span>
                <span>{new Date(t.t).toLocaleTimeString('en-GB', { hour12: false })}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
