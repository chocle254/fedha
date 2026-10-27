// Paper trading on top of tracked signals. NOTHING here places a real order.
import { supabaseAdmin } from './supabaseAdmin';
import { sizePosition, rewardRisk, levelsValid, evaluateTrade } from './trading-core';

const BINANCE = 'https://api.binance.com/api/v3';
const filterCache = new Map();

export async function getFilters(symbol) {
  const hit = filterCache.get(symbol);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.filters;
  const r = await fetch(`${BINANCE}/exchangeInfo?symbol=${symbol}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('exchangeInfo failed');
  const info = (await r.json()).symbols?.[0];
  if (!info) throw new Error('unknown symbol');
  const lot = info.filters.find((f) => f.filterType === 'LOT_SIZE') || {};
  const notional = info.filters.find((f) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL') || {};
  const filters = { minQty: Number(lot.minQty), stepSize: Number(lot.stepSize), minNotional: Number(notional.minNotional) || 0 };
  filterCache.set(symbol, { at: Date.now(), filters });
  return filters;
}

// Best bid and ask: a market buy fills at the ask, a market sell at the bid. The gap between them is the spread.
async function fetchBook(symbol) {
  try {
    const r = await fetch(`${BINANCE}/ticker/bookTicker?symbol=${symbol}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    const bid = Number(j.bidPrice);
    const ask = Number(j.askPrice);
    return bid > 0 && ask > 0 ? { bid, ask } : null;
  } catch {
    return null;
  }
}

export const DEFAULT_SETTINGS = { auto_enabled: false, mode: 'paper', risk_usdt: 10, min_rr: 0, paper_balance: 1000, risk_mode: 'percent', risk_pct: 1 };

export async function getSettings(userId) {
  const { data } = await supabaseAdmin.from('trade_settings').select('*').eq('user_id', userId).maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(data || {}) };
}

// Paper equity = starting paper balance + profit and loss of every closed paper trade.
export async function getEquity(userId, settings) {
  const { data } = await supabaseAdmin.from('paper_trades').select('pnl_usdt').eq('user_id', userId).in('status', ['won', 'lost', 'expired']);
  const realized = (data || []).reduce((a, t) => a + (Number(t.pnl_usdt) || 0), 0);
  return Number(settings.paper_balance) + realized;
}

export function riskAmount(settings, equity) {
  const v = settings.risk_mode === 'fixed' ? Number(settings.risk_usdt) : (Number(equity) * Number(settings.risk_pct)) / 100;
  return Math.round(v * 100) / 100;
}

export async function openPaperTrade({ userId, signal, riskUsdt, auto = false }) {
  if (!signal || ['won', 'lost', 'expired'].includes(signal.status)) return { ok: false, error: 'That signal is already closed.' };
  if (signal.stop_loss == null) return { ok: false, error: 'This signal has no stop-loss, so the risk cannot be sized.' };

  const settings = await getSettings(userId);
  const equity = await getEquity(userId, settings);
  const risk = riskUsdt != null && Number(riskUsdt) > 0 ? Number(riskUsdt) : riskAmount(settings, equity);
  if (!(risk > 0)) return { ok: false, error: 'Set a paper balance and risk first.' };
  if (risk > equity) return { ok: false, error: `Risk $${risk.toFixed(2)} is more than your paper equity $${equity.toFixed(2)}.` };

  const { data: existing } = await supabaseAdmin.from('paper_trades').select('id').eq('user_id', userId).eq('signal_id', signal.id).maybeSingle();
  if (existing) return { ok: false, error: 'Already entered.' };

  const buy = signal.side === 'BUY';
  const book = await fetchBook(signal.symbol);
  const spread = book ? book.ask - book.bid : 0;
  const spreadPct = book ? (spread / ((book.ask + book.bid) / 2)) * 100 : null;

  let entry = Number(signal.entry);
  const status = signal.status === 'pending' ? 'pending' : 'open';
  if (status === 'open') {
    if (book) entry = buy ? book.ask : book.bid; // market entry pays the spread
    else if (!auto) return { ok: false, error: 'Could not get the current price.' };
  }
  const tps = signal.take_profits || [];
  if (!levelsValid(signal.side, entry, tps, signal.stop_loss)) return { ok: false, error: 'Price has already moved past the targets or the stop, so this entry is no longer valid.' };

  let filters;
  try { filters = await getFilters(signal.symbol); } catch { return { ok: false, error: 'Could not load Binance lot-size rules.' }; }
  const sz = sizePosition({ entry, stop: Number(signal.stop_loss), riskUsdt: risk, filters, spread });
  if (!sz.ok) return sz;

  const row = {
    user_id: userId,
    signal_id: signal.id,
    source: signal.source,
    symbol: signal.symbol,
    side: signal.side,
    mode: 'paper',
    auto,
    entry,
    stop_loss: signal.stop_loss,
    take_profits: tps,
    qty: sz.qty,
    notional: sz.notional,
    risk_usdt: risk,
    actual_risk_usdt: sz.actualRisk,
    min_forced: sz.minForced,
    spread_abs: spread,
    spread_pct: spreadPct,
    equity_at_entry: equity,
    status,
    filled_at: status === 'open' ? new Date().toISOString() : null
  };
  const { data, error } = await supabaseAdmin.from('paper_trades').insert(row).select().single();
  if (error) return { ok: false, error: error.code === '23505' ? 'Already entered.' : 'Could not save the trade.' };
  return { ok: true, trade: data };
}

// Called right after a signal is created (Telegram listener / bot). Respects the user's automation settings.
export async function maybeAutoEnter(userId, signal) {
  try {
    const s = await getSettings(userId);
    if (!s.auto_enabled) return null;
    const rr = rewardRisk(Number(signal.entry), Number(signal.stop_loss), signal.take_profits);
    if (Number(s.min_rr) > 0 && (rr == null || rr < Number(s.min_rr))) return { ok: false, skipped: 'rr' };
    return await openPaperTrade({ userId, signal, auto: true });
  } catch {
    return null;
  }
}

export async function evaluateLiveTrade(trade) {
  const created = new Date(trade.created_at).getTime();
  const age = Date.now() - created;
  const interval = age < 16 * 3600e3 ? '1m' : age < 3 * 86400e3 ? '5m' : '15m';
  const r = await fetch(`${BINANCE}/klines?symbol=${trade.symbol}&interval=${interval}&startTime=${created}&limit=1000`, { cache: 'no-store' });
  if (!r.ok) return null;
  const candles = (await r.json()).map((c) => ({ t: c[0], h: Number(c[2]), l: Number(c[3]), c: Number(c[4]) }));
  return evaluateTrade(trade, candles);
}
