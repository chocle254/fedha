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

async function fetchPrice(symbol) {
  const r = await fetch(`${BINANCE}/ticker/price?symbol=${symbol}`, { cache: 'no-store' });
  if (!r.ok) return null;
  const p = Number((await r.json()).price);
  return p > 0 ? p : null;
}

export const DEFAULT_SETTINGS = { auto_enabled: false, mode: 'paper', risk_usdt: 10, min_rr: 0 };

export async function getSettings(userId) {
  const { data } = await supabaseAdmin.from('trade_settings').select('*').eq('user_id', userId).maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(data || {}) };
}

export async function openPaperTrade({ userId, signal, riskUsdt, auto = false }) {
  if (!signal || ['won', 'lost', 'expired'].includes(signal.status)) return { ok: false, error: 'That signal is already closed.' };
  if (signal.stop_loss == null) return { ok: false, error: 'This signal has no stop-loss, so the risk cannot be sized.' };
  const risk = Number(riskUsdt);
  if (!(risk > 0)) return { ok: false, error: 'Set a risk amount first.' };

  const { data: existing } = await supabaseAdmin.from('paper_trades').select('id').eq('user_id', userId).eq('signal_id', signal.id).maybeSingle();
  if (existing) return { ok: false, error: 'Already entered.' };

  let entry = Number(signal.entry);
  const status = signal.status === 'pending' ? 'pending' : 'open';
  if (!auto && status === 'open') {
    const p = await fetchPrice(signal.symbol); // manual entry on a live signal fills at the current price
    if (!p) return { ok: false, error: 'Could not get the current price.' };
    entry = p;
  }
  const tps = signal.take_profits || [];
  if (!levelsValid(signal.side, entry, tps, signal.stop_loss)) return { ok: false, error: 'Price has already moved past the targets or the stop, so this entry is no longer valid.' };

  let filters;
  try { filters = await getFilters(signal.symbol); } catch { return { ok: false, error: 'Could not load Binance lot-size rules.' }; }
  const sz = sizePosition({ entry, stop: Number(signal.stop_loss), riskUsdt: risk, filters });
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
    return await openPaperTrade({ userId, signal, riskUsdt: s.risk_usdt, auto: true });
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
