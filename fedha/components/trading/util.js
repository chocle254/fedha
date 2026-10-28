// Shared helpers for the trading terminal. Market data comes straight from Binance's public API in the browser.
export const REST = 'https://api.binance.com/api/v3';
export const WS = 'wss://stream.binance.com:9443';
export const FEE = 0.001; // Binance Spot taker fee, 0.1%

export const base = (symbol) => String(symbol || '').replace(/USDT$|USDC$|FDUSD$/, '').replace(/^XAUUSD$/, 'XAU');
export const quoteOf = (symbol) => (String(symbol || '') === 'XAUUSD' ? 'USD' : 'USDT');

// Decimals that suit a price's size (Binance shows 2 for BTC, 4 for XRP, 8 for PEPE).
export function priceDecimals(p) {
  const n = Math.abs(Number(p));
  if (!n) return 2;
  if (n >= 1000) return 2;
  if (n >= 10) return 3;
  if (n >= 1) return 4;
  return Math.min(8, Math.max(4, 3 - Math.floor(Math.log10(n)) + 1));
}
export function fmtPrice(v, d) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const dec = d ?? priceDecimals(n);
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
export function fmtQty(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(Number(n.toPrecision(6)));
}
export function fmtUsd(v, sign = true) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const s = sign ? (n < 0 ? '−' : n > 0 ? '+' : '') : n < 0 ? '−' : '';
  return `${s}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function fmtCompact(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(2);
}
export function ago(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Open-trade profit marked at a live price, before exit fees. Accounts for take-profits already hit.
export function livePnl(t, p) {
  if (!t || !Number.isFinite(p)) return null;
  const dir = t.side === 'BUY' ? 1 : -1;
  const entry = Number(t.entry);
  const qty = Number(t.qty);
  const tps = (t.take_profits || []).map(Number);
  const n = tps.length;
  const share = n ? qty / n : 0;
  const hit = Math.min(t.tp_hit || 0, n);
  let realized = 0;
  for (let i = 0; i < hit; i++) realized += dir * (tps[i] - entry) * share;
  return realized + dir * (p - entry) * (n ? qty - share * hit : qty);
}

// Profit on the part of a position that is still open (TPs already hit are banked in the wallet).
export function openPnl(t, p) {
  if (!t || !(p > 0)) return 0;
  const n = (t.take_profits || []).length;
  const left = Number(t.qty) * (n ? 1 - Math.min(t.tp_hit || 0, n) / n : 1);
  return (t.side === 'BUY' ? 1 : -1) * (p - Number(t.entry)) * left;
}

// A Binance WebSocket that reconnects by itself. Returns a function that closes it for good.
export function openStream(streams, onData, onState) {
  let ws = null;
  let retry = null;
  let closed = false;
  let fails = 0;
  const connect = () => {
    if (closed) return;
    try { ws = new WebSocket(`${WS}/stream?streams=${streams.join('/')}`); } catch { onState?.('offline'); return; }
    ws.onopen = () => { fails = 0; onState?.('live'); };
    ws.onmessage = (e) => {
      try { const m = JSON.parse(e.data); if (m && m.data) onData(m.stream, m.data); } catch { /* bad frame */ }
    };
    ws.onclose = () => {
      if (closed) return;
      fails += 1;
      onState?.('reconnecting');
      retry = setTimeout(connect, Math.min(15000, 1000 * 2 ** fails));
    };
    ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
  };
  connect();
  return () => {
    closed = true;
    clearTimeout(retry);
    if (ws) { ws.onclose = null; try { ws.close(); } catch { /* already closed */ } }
  };
}

export const C = {
  up: '#0ECB81',
  down: '#F6465D',
  upDim: 'rgba(14,203,129,.14)',
  downDim: 'rgba(246,70,93,.14)',
  gold: '#F0B90B',
  blue: '#5B9BFF'
};

// ─── LOTS AND RISK:REWARD ────────────────────────────────────────────────────
// Gold is quoted in ounces; a standard broker lot is 100 oz (so 0.01 lot = 1 oz). Crypto has no lots.
export function lotsLabel(t) {
  const q = Number(t.qty);
  if (!Number.isFinite(q)) return '—';
  if (t.symbol === 'XAUUSD') return `${(q / 100).toFixed(q / 100 >= 0.01 ? 2 : 4)} lot`;
  return `${fmtQty(q)} ${base(t.symbol)}`;
}

// Planned reward:risk from entry to the ORIGINAL stop, for the first and last target and the average
// (the position is split equally across the targets, so the average is what a full run pays).
export function rrPlan(t) {
  const entry = Number(t.entry);
  const risk = Math.abs(entry - Number(t.stop_loss));
  const tps = (t.take_profits || []).map(Number).filter(Number.isFinite);
  if (!(risk > 0) || !tps.length) return null;
  const rr = tps.map((p) => Math.abs(p - entry) / risk);
  return { first: rr[0], last: rr[rr.length - 1], avg: rr.reduce((a, b) => a + b, 0) / rr.length, n: rr.length };
}
export const rrText = (p) => (p ? `1:${p.avg.toFixed(2)}` : '—');
export const rrDetail = (p) => (p ? (p.n > 1 ? `TP1 1:${p.first.toFixed(2)} → TP${p.n} 1:${p.last.toFixed(2)}` : `1:${p.first.toFixed(2)}`) : '');

// Result in R: profit ÷ amount risked (+2R made twice the risk, −1R is a full stop-out).
export function resultR(t) {
  const risk = Number(t.actual_risk_usdt) || Number(t.risk_usdt);
  const pnl = Number(t.pnl_usdt);
  return risk > 0 && Number.isFinite(pnl) ? pnl / risk : null;
}
