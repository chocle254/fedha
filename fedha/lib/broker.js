// Places Telegram signals on our MT5 accounts (XM, LiteFinance) through MetaApi, and keeps them in sync.
// Each signal is split into one MT5 position per TP (MT5 allows one TP per position), all sharing the SL.
// Lot size = account balance × risk % × the channel's lot multiplier (from its track record).
// SAFETY: real-money accounts are refused unless broker_settings.allow_real is true.
import { supabaseAdmin } from './supabaseAdmin';
import { BROKER_ACCOUNTS, accountId, metaapiConfigured, mt, tradeOk, findSymbol } from './metaapi';
import { groupReport, brokerResults, splitLots, LOT_MIN, trailCandidate, TRAIL_DEFAULT } from './trading-core';
import { notify, trailProfiles, atrBefore } from './trading';
import { newsCheck, newsReason } from './news-guard';

const PENDING_MAX_MS = 6 * 3600e3; // a limit order that has not filled in 6 h is cancelled

export const DEFAULT_ACCOUNT_SETTINGS = { enabled: false, risk_pct: 1, min_confidence: 0, daily_loss_pct: 5 };
export const DEFAULT_BROKER_SETTINGS = {
  breakeven: true,      // smart trailing stop (style learned per channel), following the chart from entry
  allow_real: false,    // never trade a real-money account unless switched on explicitly
  paper_too: false,     // keep Luxe's own paper trades running alongside the demo accounts
  xm: { ...DEFAULT_ACCOUNT_SETTINGS },
  litefinance: { ...DEFAULT_ACCOUNT_SETTINGS },
};

export async function getBrokerSettings(userId) {
  const { data } = await supabaseAdmin.from('trade_settings').select('broker_settings').eq('user_id', userId).maybeSingle();
  const saved = data?.broker_settings || {};
  const out = { ...DEFAULT_BROKER_SETTINGS, ...saved };
  for (const a of BROKER_ACCOUNTS) out[a.key] = { ...DEFAULT_ACCOUNT_SETTINGS, ...(saved[a.key] || {}) };
  return out;
}

export function brokersActive(settings) {
  return metaapiConfigured() && BROKER_ACCOUNTS.some((a) => settings[a.key]?.enabled && accountId(a.key));
}

// Lot multiplier for a channel: from its finished MT5 results, or its paper record until it has some.
export async function brokerSizing(userId, source) {
  const { data: rows } = await supabaseAdmin.from('broker_trades')
    .select('account, signal_key, source, status, profit, risk_usd, created_at, closed_at')
    .eq('user_id', userId).eq('source', source).limit(2000);
  let results = brokerResults(rows || []);
  if (!results.some((r) => ['won', 'lost'].includes(r.status))) {
    const { data: paper } = await supabaseAdmin.from('paper_trades')
      .select('signal_id, source, status, pnl_usdt, risk_usdt, actual_risk_usdt, closed_at, created_at')
      .eq('user_id', userId).eq('source', source).not('signal_id', 'is', null).limit(1000);
    results = paper || [];
  }
  const g = groupReport(results)[0];
  if (!g) return { mult: 0.5, confidence: 50, verdict: 'testing' };
  return { mult: g.lotMultiplier, confidence: g.confidence, verdict: g.verdict };
}

function brokerSymbolFor(parsed) {
  if (parsed.proxyOf) return parsed.proxyOf;                 // XAUUSD
  return String(parsed.symbol).replace(/USDT$|USDC$|FDUSD$/, 'USD'); // BTCUSDT -> BTCUSD
}

async function todaysLoss(userId, account, info) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await supabaseAdmin.from('broker_trades').select('profit')
    .eq('user_id', userId).eq('account', account).gte('closed_at', start.toISOString());
  const closed = (data || []).reduce((s, r) => s + Number(r.profit || 0), 0);
  const floating = Number(info.equity) - Number(info.balance);
  return -(closed + floating);
}

async function placeOnAccount({ userId, acct, settings, parsed, source, signalKey, signalId, news }) {
  const id = accountId(acct.key);
  const cfg = settings[acct.key];
  const info = await mt.accountInfo(id);
  const real = info.type === 'ACCOUNT_TRADE_MODE_REAL';
  if (real && !settings.allow_real) return { skipped: 'This is a real-money account and real trading is switched off.' };
  if (!info.tradeAllowed) return { skipped: 'Trading is not allowed on this account right now.' };

  const lossLimit = (Number(info.balance) * Number(cfg.daily_loss_pct || 0)) / 100;
  if (lossLimit > 0 && (await todaysLoss(userId, acct.key, info)) >= lossLimit) return { skipped: `Daily loss limit (${cfg.daily_loss_pct}%) reached.` };

  const sizing = await brokerSizing(userId, source);
  if (sizing.confidence < Number(cfg.min_confidence || 0)) return { skipped: `${source} is ${sizing.confidence}% confident, below this account's ${cfg.min_confidence}% minimum.` };
  let mult = sizing.mult;
  if (sizing.verdict === 'drop') {
    if (real) return { skipped: `${source} is marked Drop.` };
    mult = LOT_MIN; // demo keeps measuring dropped channels at the smallest size
  }
  // Real money only follows channels with a proven record (10+ closed trades, positive, Keep or Scale).
  // Channels still being tested keep trading on demo and paper until they earn it.
  if (real && sizing.verdict === 'testing') return { skipped: `${source} is still being tested (fewer than 10 closed trades), so demo only.` };
  // News guard: skip right around a high-impact release, half lot in the hour before (lib/news-guard.js).
  if (news?.level === 'danger') return { skipped: `News: ${news.reason}`, news: true };
  if (news?.level === 'caution') mult = Math.max(LOT_MIN, Math.round(mult * news.mult * 100) / 100);

  const symbol = await findSymbol(id, brokerSymbolFor(parsed));
  if (!symbol) return { skipped: `${brokerSymbolFor(parsed)} is not offered on this account.` };
  const [spec, px] = await Promise.all([mt.spec(id, symbol), mt.price(id, symbol)]);
  const buy = parsed.side === 'BUY';
  const market = buy ? Number(px.ask) : Number(px.bid);

  // Market if the price is inside (or better than) the signal's zone, otherwise a limit order at the zone edge.
  let orderType = 'market';
  let entry = market;
  if (parsed.entryLow != null) {
    if (buy && market > parsed.entryHigh) { orderType = 'limit'; entry = parsed.entryHigh; }
    if (!buy && market < parsed.entryLow) { orderType = 'limit'; entry = parsed.entryLow; }
  }
  const sl = parsed.stopLoss;
  if (sl == null) return { skipped: 'No stop-loss in the signal, so the risk cannot be sized.' };
  if (buy ? sl >= entry : sl <= entry) return { skipped: 'Price is already past the stop-loss.' };
  const tps = parsed.takeProfits.filter((tp) => (buy ? tp > entry : tp < entry));
  if (!tps.length) return { skipped: 'Price is already past every take-profit.' };

  const plannedRisk = (Number(info.balance) * Number(cfg.risk_pct || 1) * mult) / 100;
  const split = splitLots({ riskUsd: plannedRisk, entry, stop: sl, tps, contractSize: spec.contractSize, minVolume: spec.minVolume, volumeStep: spec.volumeStep });
  if (split.error) return { skipped: split.error };

  // Margin check: lots × contract × price ÷ leverage must fit the free margin, or MT5 rejects the order.
  // Only for USD-quoted markets and USD-base pairs; crosses are left for the broker to check.
  const lev = Number(info.leverage) || 0;
  const totalLots = split.legs.reduce((a, l) => a + l.lots, 0);
  const usdBase = /^USD/.test(parsed.symbol);
  const usdQuote = /USD$/.test(parsed.symbol) || !/^[A-Z]{6}$/.test(parsed.symbol);
  if (lev > 0 && (usdBase || usdQuote)) {
    const margin = (totalLots * Number(spec.contractSize || 1) * (usdBase ? 1 : entry)) / lev;
    const free = Number(info.freeMargin ?? info.equity ?? info.balance);
    if (margin > free) return { skipped: `Not enough margin: ${totalLots} lots ${parsed.symbol} needs about $${margin.toFixed(2)} at 1:${lev}, free margin is $${free.toFixed(2)}.` };
  }

  // Smart trailing: the channel's learned style, and volatility from the gold price feed (lib/market.js).
  const trailMode = (await trailProfiles(userId).catch(() => ({})))[source]?.mode || TRAIL_DEFAULT;
  const trailAtr = await atrBefore(parsed.symbol, Date.now());
  const digits = Number(spec.digits) || 2;
  const p = (v) => Number(Number(v).toFixed(digits));
  const placed = [];
  for (let i = 0; i < split.legs.length; i++) {
    const leg = split.legs[i];
    const row = {
      user_id: userId, account: acct.key, signal_key: signalKey, signal_id: signalId || null, source,
      symbol, side: parsed.side, order_type: orderType, leg: i + 1, legs: split.legs.length, lots: leg.lots,
      entry: p(entry), stop_loss: p(sl), take_profit: p(leg.tp), risk_usd: Math.round(split.riskUsd * 100) / 100,
      lot_multiplier: mult, confidence: sizing.confidence, status: 'pending',
      trail_mode: trailMode, trail_atr: trailAtr,
    };
    let { data: saved, error } = await supabaseAdmin.from('broker_trades').insert(row).select('id').single();
    if (error && /trail_/.test(error.message || '')) {
      const { trail_mode, trail_atr, ...plain } = row; // smart-trailing migration not run yet
      ({ data: saved, error } = await supabaseAdmin.from('broker_trades').insert(plain).select('id').single());
    }
    if (error) { if (error.code === '23505') continue; throw error; } // already placed (duplicate message)
    const body = {
      actionType: orderType === 'market' ? (buy ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL') : (buy ? 'ORDER_TYPE_BUY_LIMIT' : 'ORDER_TYPE_SELL_LIMIT'),
      symbol, volume: leg.lots, stopLoss: p(sl), takeProfit: p(leg.tp),
      comment: `Luxe TP${i + 1}`, clientId: `F${saved.id.slice(0, 8)}`,
    };
    if (orderType === 'limit') body.openPrice = p(entry);
    try {
      const res = await mt.trade(id, body);
      if (!tradeOk(res)) throw new Error(`${res?.stringCode || 'rejected'}: ${res?.message || ''}`.trim());
      const patch = { order_id: String(res.positionId || res.orderId), status: orderType === 'market' ? 'open' : 'pending' };
      if (orderType === 'market') patch.filled_at = new Date().toISOString();
      await supabaseAdmin.from('broker_trades').update(patch).eq('id', saved.id);
      placed.push(leg);
    } catch (e) {
      await supabaseAdmin.from('broker_trades').update({ status: 'failed', error: String(e.message).slice(0, 300) }).eq('id', saved.id);
    }
  }
  if (!placed.length) return { error: 'MT5 rejected every leg (see the trade list for the reason).' };
  const lots = placed.reduce((s, l) => s + l.lots, 0);
  return { ok: true, legs: placed.length, lots: Number(lots.toFixed(2)), orderType, symbol, mult, confidence: sizing.confidence, riskUsd: split.riskUsd, real };
}

// Called by the ingest endpoint for every new signal. Returns a short per-account summary for the inbox log.
export async function placeSignalOnBrokers({ userId, parsed, source, signalKey, signalId }) {
  if (!metaapiConfigured()) return null;
  const settings = await getBrokerSettings(userId);
  const accounts = BROKER_ACCOUNTS.filter((a) => settings[a.key]?.enabled && accountId(a.key));
  if (!accounts.length) return null;
  const news = await newsCheck(parsed.symbol).catch(() => ({ level: 'clear' }));
  if (news.level !== 'clear') news.reason = await newsReason(news, parsed.symbol);
  const results = await Promise.all(accounts.map(async (acct) => {
    try {
      const r = await placeOnAccount({ userId, acct, settings, parsed, source, signalKey, signalId, news });
      if (r.ok) {
        await notify({
          title: `${r.real ? '💰' : '🧪'} ${acct.name}: ${parsed.side} ${r.symbol} ${r.lots} lots`,
          body: `${r.legs} position${r.legs > 1 ? 's' : ''} (one per TP) · ${r.orderType} · lot ×${r.mult} (${r.confidence}% confident in ${source}) · risk $${r.riskUsd.toFixed(2)}${news.level === 'caution' ? ` · 📰 half lot, ${news.reason}` : ''}`,
        }, `broker-${acct.key}-${signalKey}`);
      } else if (r.news) {
        await notify({ title: `📰 ${acct.name}: skipped ${parsed.side} ${parsed.symbol} for news`, body: news.reason }, `broker-${acct.key}-${signalKey}-news`);
      }
      return { account: acct.key, ...r };
    } catch (e) {
      return { account: acct.key, error: e.message };
    }
  }));
  return results;
}

// ── SYNC ──────────────────────────────────────────────────────────────────
// Every minute (via /api/trading/tick): mark fills, closes (TP / SL), cancel stale limits, trail the SL.
const REASON = { DEAL_REASON_TP: 'tp', DEAL_REASON_SL: 'sl', DEAL_REASON_SO: 'stop-out' };

export async function syncBrokerTrades(userId) {
  if (!metaapiConfigured()) return { checked: 0 };
  const settings = await getBrokerSettings(userId);
  const { data: live } = await supabaseAdmin.from('broker_trades').select('*').eq('user_id', userId).in('status', ['pending', 'open']).limit(200);
  if (!live?.length) return { checked: 0 };
  let changed = 0;
  const byAccount = {};
  for (const r of live) (byAccount[r.account] = byAccount[r.account] || []).push(r);

  for (const [key, rows] of Object.entries(byAccount)) {
    const id = accountId(key);
    if (!id) continue;
    const acct = BROKER_ACCOUNTS.find((a) => a.key === key);
    let positions, orders;
    try { [positions, orders] = await Promise.all([mt.positions(id), mt.orders(id)]); } catch { continue; }
    const posById = new Map((positions || []).map((x) => [String(x.id), x]));
    const ordById = new Map((orders || []).map((x) => [String(x.id), x]));

    for (const r of rows) {
      if (!r.order_id) continue;
      const pos = posById.get(r.order_id);
      if (pos) {
        if (r.status === 'pending') {
          await supabaseAdmin.from('broker_trades').update({ status: 'open', entry: pos.openPrice, filled_at: new Date().toISOString() }).eq('id', r.id);
          r.status = 'open'; r.entry = pos.openPrice; changed++;
        }
        continue;
      }
      if (ordById.has(r.order_id)) {
        if (Date.now() - new Date(r.created_at).getTime() > PENDING_MAX_MS) {
          try {
            const res = await mt.trade(id, { actionType: 'ORDER_CANCEL', orderId: r.order_id });
            if (tradeOk(res)) { await supabaseAdmin.from('broker_trades').update({ status: 'cancelled', close_reason: 'expired', closed_at: new Date().toISOString() }).eq('id', r.id); changed++; }
          } catch { /* try again next minute */ }
        }
        continue;
      }
      // Gone from both lists: closed, or a limit order that was cancelled before filling.
      let deals = [];
      try { deals = (await mt.dealsByPosition(id, r.order_id)) || []; } catch { continue; }
      const outs = deals.filter((d) => ['DEAL_ENTRY_OUT', 'DEAL_ENTRY_OUT_BY', 'DEAL_ENTRY_INOUT'].includes(d.entryType));
      if (!outs.length) {
        if (!deals.length) { await supabaseAdmin.from('broker_trades').update({ status: 'cancelled', close_reason: 'cancelled', closed_at: new Date().toISOString() }).eq('id', r.id); changed++; }
        continue;
      }
      const profit = deals.reduce((s, d) => s + Number(d.profit || 0) + Number(d.commission || 0) + Number(d.swap || 0), 0);
      const last = outs[outs.length - 1];
      const reason = REASON[last.reason] || 'manual';
      const status = profit > 0 ? 'won' : 'lost';
      await supabaseAdmin.from('broker_trades').update({ status, profit: Math.round(profit * 100) / 100, close_price: last.price, close_reason: reason, closed_at: last.time || new Date().toISOString() }).eq('id', r.id);
      r.status = status; r.close_reason = reason; changed++;
      await notify({
        title: `${reason === 'tp' ? '🎯' : reason === 'sl' ? '🛑' : '✖️'} ${acct.name}: ${r.symbol} TP${r.leg} leg ${reason === 'tp' ? 'hit TP' : reason === 'sl' ? 'stopped out' : 'closed'}`,
        body: `${profit >= 0 ? '+' : ''}$${profit.toFixed(2)} · ${r.lots} lots · from ${r.source}`,
      }, `broker-close-${r.id}`);
    }

    // Smart trailing, same styles as the paper trades: each signal uses its channel's learned style
    // (ATR-based by default), measured from the best price since entry, before and after TP1. Stops only ever tighten.
    if (settings.breakeven) {
      const keys = [...new Set(rows.map((r) => r.signal_key))];
      const { data: all } = await supabaseAdmin.from('broker_trades').select('signal_key, leg, take_profit, close_reason').eq('user_id', userId).eq('account', key).in('signal_key', keys);
      for (const r of rows) {
        if (r.status !== 'open') continue;
        const pos = posById.get(r.order_id);
        const legs = (all || []).filter((l) => l.signal_key === r.signal_key).sort((x, y) => x.leg - y.leg);
        const buy = r.side === 'BUY';
        const px = Number(pos?.currentPrice);
        let best = r.best_price != null ? Number(r.best_price) : Number(r.entry);
        if (px > 0) best = buy ? Math.max(best, px) : Math.min(best, px);
        if (px > 0 && best !== Number(r.best_price)) await supabaseAdmin.from('broker_trades').update({ best_price: best }).eq('id', r.id).then(() => null, () => null);
        const k = legs.filter((l) => l.close_reason === 'tp').length; // TP legs closed so far (0 = trailing before TP1)
        if (!(px > 0)) continue;
        const style = r.trail_mode || TRAIL_DEFAULT;
        const mode = style.startsWith('atr') && !(Number(r.trail_atr) > 0) ? 'be2' : style; // no ATR known: safe fallback
        const target = trailCandidate(mode, {
          side: r.side, entry: Number(r.entry), sl: Number(r.stop_loss), tps: legs.map((l) => Number(l.take_profit)), tpHit: k, best, atr: Number(r.trail_atr) || 0,
        });
        if (!Number.isFinite(target)) continue;
        const rounded = Number(target.toFixed(2));
        if (!(buy ? rounded > Number(r.stop_loss) : rounded < Number(r.stop_loss))) continue; // never loosen
        if (buy ? rounded >= px : rounded <= px) continue; // must stay on the right side of the price
        try {
          const res = await mt.trade(id, { actionType: 'POSITION_MODIFY', positionId: r.order_id, stopLoss: rounded, takeProfit: Number(r.take_profit) });
          if (tradeOk(res)) { await supabaseAdmin.from('broker_trades').update({ breakeven: true, stop_loss: rounded }).eq('id', r.id); changed++; }
        } catch { /* too close to the price right now; retry next minute */ }
      }
    }
  }
  return { checked: live.length, changed };
}

// Balances and status for the Trading page.
export async function brokerOverview(userId) {
  const settings = await getBrokerSettings(userId);
  const accounts = await Promise.all(BROKER_ACCOUNTS.map(async (a) => {
    const id = accountId(a.key);
    const base = { key: a.key, name: a.name, configured: !!(id && metaapiConfigured()), settings: settings[a.key] };
    if (!base.configured) return base;
    try {
      const i = await mt.accountInfo(id);
      return { ...base, info: { broker: i.broker, server: i.server, login: i.login, currency: i.currency, balance: i.balance, equity: i.equity, freeMargin: i.freeMargin, leverage: i.leverage, real: i.type === 'ACCOUNT_TRADE_MODE_REAL', tradeAllowed: i.tradeAllowed } };
    } catch (e) {
      return { ...base, error: e.status === 404 ? 'MetaApi account not found or not deployed yet.' : e.message };
    }
  }));
  const { data: trades } = await supabaseAdmin.from('broker_trades').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(300);
  // Gold fit: the smallest gold trade (0.01 lot = 1 oz, so $1 per $1 move) may risk up to twice the planned
  // risk (splitLots). So this balance can only take signals whose stop is within maxStop dollars, and the
  // channels' typical stop needs `needed` dollars of balance.
  const { data: golds } = await supabaseAdmin.from('paper_trades').select('entry, stop_loss').eq('user_id', userId)
    .like('symbol', 'XAU%').not('stop_loss', 'is', null).order('created_at', { ascending: false }).limit(60);
  const stops = (golds || []).map((g) => Math.abs(Number(g.entry) - Number(g.stop_loss))).filter((d) => d > 0).sort((a, b) => a - b);
  const typicalStop = stops.length ? stops[Math.floor(stops.length / 2)] : null;
  for (const a of accounts) {
    if (!a.info) continue;
    const pct = Number(a.settings?.risk_pct || 1) / 100;
    const maxStop = 2 * Number(a.info.balance) * pct; // dollars of gold move one 0.01 lot can take
    a.goldFit = { maxStop: Math.round(maxStop * 100) / 100, typicalStop: typicalStop && Math.round(typicalStop * 100) / 100, needed: typicalStop ? Math.ceil(typicalStop / (2 * pct)) : null };
  }
  return { configured: metaapiConfigured(), settings, accounts, trades: trades || [] };
}
