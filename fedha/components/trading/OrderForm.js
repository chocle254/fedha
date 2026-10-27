import { useEffect, useState } from 'react';
import { C, FEE, base, fmtPrice, fmtUsd, priceDecimals } from './util';

const trim = (n, d = 6) => (Number.isFinite(n) && n > 0 ? String(Number(n.toFixed(d))) : '');

// Binance-style Spot order form (paper): Limit / Market, amount or total, % of balance, optional TP/SL.
export default function OrderForm({ symbol, livePrice, account, riskNow, picked, onPlaced }) {
  const [side, setSide] = useState('BUY');
  const [type, setType] = useState('LIMIT');
  const [priceIn, setPriceIn] = useState('');
  const [amountIn, setAmountIn] = useState('');
  const [totalIn, setTotalIn] = useState('');
  const [tpsl, setTpsl] = useState(false);
  const [tpIns, setTpIns] = useState(['']);
  const [slIn, setSlIn] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  // New pair: start from its current price.
  useEffect(() => { setPriceIn(''); setAmountIn(''); setTotalIn(''); setTpIns(['']); setSlIn(''); setNote(null); }, [symbol]);
  useEffect(() => { if (!priceIn && livePrice) setPriceIn(livePrice.toFixed(priceDecimals(livePrice))); }, [livePrice, priceIn]);
  // A price tapped on the chart or order book goes into the price box (or SL/TP when that box is focused).
  useEffect(() => {
    if (!picked) return;
    const v = String(picked.price);
    if (picked.target === 'tp') { setTpsl(true); setTpIns((l) => [v, ...l.slice(1)]); } else if (picked.target === 'sl') { setTpsl(true); setSlIn(v); } else { setType('LIMIT'); setPriceIn(v); }
  }, [picked]);

  const eff = type === 'MARKET' ? livePrice : Number(priceIn);
  const amount = Number(amountIn);
  const total = amount > 0 && eff > 0 ? amount * eff : 0;
  const avail = Number(account?.available) || 0;
  const sl = Number(slIn);
  const tps = tpIns.map(Number).filter((v) => v > 0);
  const buy = side === 'BUY';
  const sortedTps = [...tps].sort((a, b) => (buy ? a - b : b - a));
  const tp = sortedTps[0] || 0; // TP1 = nearest target
  const risk = tpsl && sl > 0 && amount > 0 && eff > 0 ? Math.abs(eff - sl) * amount + total * FEE * 2 : null;
  const rr = tpsl && sl > 0 && tp > 0 && eff > 0 && Math.abs(eff - sl) > 0 ? Math.abs(tp - eff) / Math.abs(eff - sl) : null;
  const slWrong = tpsl && sl > 0 && eff > 0 && (buy ? sl >= eff : sl <= eff);
  const tpWrong = tpsl && eff > 0 && tps.some((v) => (buy ? v <= eff : v >= eff));
  const reward = tpsl && amount > 0 && eff > 0 && tps.length ? tps.reduce((a, v) => a + Math.abs(v - eff) * (amount / tps.length), 0) - total * FEE * 2 : null;

  const setAmount = (v) => { setAmountIn(v); const a = Number(v); setTotalIn(a > 0 && eff > 0 ? trim(a * eff, 2) : ''); };
  const setTotal = (v) => { setTotalIn(v); const t = Number(v); setAmountIn(t > 0 && eff > 0 ? trim(t / eff) : ''); };
  const setPct = (p) => { if (!(eff > 0)) return; const t = (avail * p) / 100 / (1 + FEE); setTotalIn(trim(t, 2)); setAmountIn(trim(t / eff)); };
  const sizeByRisk = () => {
    if (!(sl > 0 && eff > 0) || slWrong) { setNote({ err: true, text: 'Set a stop-loss on the right side of the price first.' }); return; }
    const per = Math.abs(eff - sl) + eff * FEE * 2;
    let q = riskNow / per;
    if (q * eff * (1 + FEE) > avail) q = avail / (eff * (1 + FEE));
    setAmount(trim(q));
    setNote({ text: `Sized so the stop loses about ${fmtUsd(Math.min(riskNow, q * per), false)}.` });
  };

  async function submit() {
    setNote(null);
    if (!(amount > 0)) { setNote({ err: true, text: 'Enter an amount.' }); return; }
    if (slWrong || tpWrong) { setNote({ err: true, text: `For a ${buy ? 'buy' : 'sell'}, TP goes ${buy ? 'above' : 'below'} and SL ${buy ? 'below' : 'above'} the price.` }); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/trading/trades', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual: true, symbol, side, type, qty: amount, price: type === 'LIMIT' ? Number(priceIn) : undefined, stopLoss: tpsl && sl > 0 ? sl : undefined, takeProfits: tpsl ? sortedTps : [] })
      });
      const j = await r.json();
      if (!r.ok) { setNote({ err: true, text: j.error || 'Order rejected.' }); return; }
      const t = j.trade;
      setNote({ text: t.status === 'open' ? `${buy ? 'Bought' : 'Sold'} ${t.qty} ${base(symbol)} at ${fmtPrice(t.entry)}` : `Limit order placed at ${fmtPrice(t.entry)}` });
      setAmountIn(''); setTotalIn('');
      onPlaced?.(t);
    } catch { setNote({ err: true, text: 'Could not reach the server.' }); } finally { setBusy(false); }
  }

  return (
    <div className="tx-panel tx-form">
      <div className="tx-side">
        <button className={buy ? 'buy on' : 'buy'} onClick={() => setSide('BUY')}>Buy</button>
        <button className={!buy ? 'sell on' : 'sell'} onClick={() => setSide('SELL')}>Sell</button>
      </div>
      <div className="tx-tabs small">
        <button className={type === 'LIMIT' ? 'on' : ''} onClick={() => setType('LIMIT')}>Limit</button>
        <button className={type === 'MARKET' ? 'on' : ''} onClick={() => setType('MARKET')}>Market</button>
      </div>

      <div className="tx-avbl font-num"><span>Avbl</span><b>{fmtUsd(avail, false)} USDT</b></div>

      {type === 'LIMIT'
        ? <label className="tx-field"><span>Price</span><input className="font-num" inputMode="decimal" value={priceIn} onChange={(e) => setPriceIn(e.target.value)} /><em>USDT</em></label>
        : <div className="tx-field ghost"><span>Price</span><b className="font-num">Market{livePrice ? ` ≈ ${fmtPrice(livePrice)}` : ''}</b><em>USDT</em></div>}
      <label className="tx-field"><span>Amount</span><input className="font-num" inputMode="decimal" placeholder="0" value={amountIn} onChange={(e) => setAmount(e.target.value)} /><em>{base(symbol)}</em></label>
      <div className="tx-pcts">{[25, 50, 75, 100].map((p) => <button key={p} onClick={() => setPct(p)}>{p}%</button>)}</div>
      <label className="tx-field"><span>Total</span><input className="font-num" inputMode="decimal" placeholder="0" value={totalIn} onChange={(e) => setTotal(e.target.value)} /><em>USDT</em></label>

      <label className="tx-check"><input type="checkbox" checked={tpsl} onChange={(e) => setTpsl(e.target.checked)} /> TP / SL</label>
      {tpsl && (
        <>
          {tpIns.map((v, i) => (
            <label key={i} className={`tx-field ${tpWrong && Number(v) > 0 && (buy ? Number(v) <= eff : Number(v) >= eff) ? 'bad' : ''}`}>
              <span>TP{i + 1}</span>
              <input className="font-num" inputMode="decimal" placeholder={i === 0 ? 'Take profit' : 'optional'} value={v} onChange={(e) => setTpIns((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
              {i > 0 ? <button className="tx-x" onClick={(e) => { e.preventDefault(); setTpIns((l) => l.filter((_, j) => j !== i)); }} aria-label="Remove target">✕</button> : <em>USDT</em>}
            </label>
          ))}
          {tpIns.length < 5 && <button className="tx-link" onClick={() => setTpIns((l) => [...l, ''])}>+ Add TP{tpIns.length + 1}</button>}
          {tps.length > 1 && <div className="tx-hint">Closes 1/{tps.length} of the position at each target, like the signal groups do.</div>}
          <label className={`tx-field ${slWrong ? 'bad' : ''}`}><span>Stop loss</span><input className="font-num" inputMode="decimal" value={slIn} onChange={(e) => setSlIn(e.target.value)} /><em>USDT</em></label>
          <button className="tx-link" onClick={sizeByRisk}>Size by risk ({fmtUsd(riskNow, false)})</button>
        </>
      )}

      <div className="tx-info font-num">
        <div><span>Est. fee (0.1%)</span><b>{total ? fmtUsd(total * FEE, false) : '—'}</b></div>
        {risk != null && <div><span>Risk if stopped</span><b style={{ color: C.down }}>{fmtUsd(risk, false)}{account?.equity ? ` · ${((risk / account.equity) * 100).toFixed(2)}%` : ''}</b></div>}
        {reward != null && <div><span>Profit if all TPs hit</span><b style={{ color: C.up }}>{fmtUsd(reward)}</b></div>}
        {rr != null && <div><span>Reward : risk (TP1)</span><b style={{ color: rr >= 1 ? C.up : C.gold }}>1 : {rr.toFixed(2)}</b></div>}
      </div>

      <button className={`tx-submit ${buy ? 'buy' : 'sell'}`} disabled={busy} onClick={submit}>
        {busy ? 'Placing…' : `${buy ? 'Buy' : 'Sell'} ${base(symbol)}`}
      </button>
      {!buy && <div className="tx-hint">Selling without holding the coin opens a simulated short (Spot can&apos;t really short).</div>}
      {note && <div className="tx-note" style={{ color: note.err ? C.down : C.up }}>{note.text}</div>}
    </div>
  );
}
