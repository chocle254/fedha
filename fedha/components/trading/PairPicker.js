import { useEffect, useMemo, useRef, useState } from 'react';
import { C, base, quoteOf, fmtPrice, fmtCompact } from './util';

const FAV_KEY = 'tx-favs';
const readFavs = () => { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || ['BTCUSDT', 'ETHUSDT', 'PAXGUSDT', 'SOLUSDT', 'BNBUSDT']; } catch { return ['BTCUSDT', 'ETHUSDT', 'PAXGUSDT']; } };

// Searchable list of every Binance USDT pair, with favourites (kept on this device).
export default function PairPicker({ current, highlight = [], onPick, onClose }) {
  const [pairs, setPairs] = useState(null);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [favs, setFavs] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    setFavs(readFavs());
    inputRef.current?.focus();
    fetch('/api/trading/pairs').then((r) => r.json()).then((j) => setPairs(j.pairs || [])).catch(() => setPairs([]));
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleFav = (s) => {
    const next = favs.includes(s) ? favs.filter((x) => x !== s) : [...favs, s];
    setFavs(next);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  const list = useMemo(() => {
    if (!pairs) return [];
    const term = q.trim().toUpperCase().replace(/[\s/]/g, '');
    let rows = pairs;
    if (tab === 'fav') rows = rows.filter((p) => favs.includes(p[0]));
    if (tab === 'signals') rows = rows.filter((p) => highlight.includes(p[0]));
    if (tab === 'gainers') rows = [...rows].sort((a, b) => b[2] - a[2]);
    if (tab === 'losers') rows = [...rows].sort((a, b) => a[2] - b[2]);
    if (term) rows = rows.filter((p) => p[0].includes(term) || base(p[0]).startsWith(term));
    return rows.slice(0, 150);
  }, [pairs, q, tab, favs, highlight]);

  return (
    <div className="tx-modal" onClick={onClose}>
      <div className="tx-picker" onClick={(e) => e.stopPropagation()}>
        <input ref={inputRef} className="tx-search" placeholder="Search coin (BTC, PAXG…)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="tx-tabs small">
          {[['fav', '★ Favorites'], ['all', 'USDT'], ['signals', 'Signals'], ['gainers', 'Gainers'], ['losers', 'Losers']].map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div className="tx-pick-head"><span>Pair</span><span>Last price</span><span>24h</span></div>
        <div className="tx-pick-list">
          {!pairs && <div className="tx-empty">Loading pairs…</div>}
          {pairs && !list.length && <div className="tx-empty">No pairs match.</div>}
          {list.map(([s, last, ch, vol]) => (
            <div key={s} className={`tx-pick-row ${s === current ? 'on' : ''}`} onClick={() => { onPick(s); onClose(); }}>
              <button className="tx-star" style={{ color: favs.includes(s) ? C.gold : '#5E6673' }} onClick={(e) => { e.stopPropagation(); toggleFav(s); }} aria-label="Favourite">★</button>
              <span className="tx-pick-name"><b>{base(s)}</b><i>/USDT</i>{highlight.includes(s) && <em>signal</em>}<small>Vol {fmtCompact(vol)}</small></span>
              <span className="font-num">{fmtPrice(last)}</span>
              <span className="font-num tx-chg" style={{ background: ch >= 0 ? C.up : C.down }}>{ch >= 0 ? '+' : ''}{ch.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
