// Places Telegram signals on our MT5 accounts (XM, LiteFinance) through MetaApi, and keeps them in sync.
// Each signal is split into one MT5 position per TP (MT5 allows one TP per position), all sharing the SL.
// Lot size = account balance × risk % × the channel's lot multiplier (from its track record).
// SAFETY: real-money accounts are refused unless broker_settings.allow_real is true.
import { supabaseAdmin } from './supabaseAdmin';
import { BROKER_ACCOUNTS, accountId, metaapiConfigured, mt, tradeOk, findSymbol } from './metaapi';
import { groupReport, brokerResults, splitLots, LOT_MIN } from './trading-core';
import { notify } from './trading';

const PENDING_MAX_MS = 6 * 3600e3; // a limit order that has not filled in 6 h is cancelled

export const DEFAULT_ACCOUNT_SETTINGS = { enabled: false, risk_pct: 1, min_confidence: 0, daily_loss_pct: 5 };
export const DEFAULT_BROKER_SETTINGS = {
  breakeven: true,      // move the SL of the remaining legs to entry once TP1 is hit
  allow_real: false,    // never trade a real-money account unless switched on explicitly
  paper_too: false,     // keep Fedha's own paper trades running alongside the demo accounts
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
  if (parsed.proxyOf) return parsed.proxyOf;                 // XAUUSD (the parser maps gold to PAXG for Binance)
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

async function placeOnAccount({ userId, acct, settings, parsed, source, signalKey, signalId }) {
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
    };
    const { data: saved, error } = await supabaseAdmin.from('broker_trades').insert(row).select('id').single();
    if (error) { if (error.code === '23505') continue; throw error; } // already placed (duplicate message)
    const body = {
      actionType: orderType === 'market' ? (buy ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL') : (buy ? 'ORDER_TYPE_BUY_LIMIT' : 'ORDER_TYPE_SELL_LIMIT'),
      symbol, volume: leg.lots, stopLoss: p(sl), takeProfit: p(leg.tp),
      comment: `Fedha TP${i + 1}`, clientId: `F${saved.id.slice(0, 8)}`,
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
  const results = await Promise.all(accounts.map(async (acct) => {
    try {
      const r = await placeOnAccount({ userId, acct, settings, parsed, source, signalKey, signalId });
      if (r.ok) {
        await notify({
          title: `${r.real ? '💰' : '🧪'} ${acct.name}: ${parsed.side} ${r.symbol} ${r.lots} lots`,
          body: `${r.legs} position${r.legs > 1 ? 's' : ''} (one per TP) · ${r.orderType} · lot ×${r.mult} (${r.confidence}% confident in ${source}) · risk $${r.riskUsd.toFixed(2)}`,
        }, `broker-${acct.key}-${signalKey}`);
      }
      return { account: acct.key, ...r };
    } catch (e) {
      return { account: acct.key, error: e.message };
    }
  }));
  return results;
}

// ── SYNC ──────────────────────────────────────────────────────────────────
// Every minute (via /api/trading/tick): mark fills, closes (TP / SL), cancel stale limits, move SL to break-even.
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

    // Break-even: once any leg of a signal hits its TP, move the SL of that signal's open legs to their entry.
    if (settings.breakeven) {
      const { data: hit } = await supabaseAdmin.from('broker_trades').select('signal_key').eq('user_id', userId).eq('account', key).eq('close_reason', 'tp').in('signal_key', [...new Set(rows.map((r) => r.signal_key))]);
      const hitKeys = new Set((hit || []).map((h) => h.signal_key));
      for (const r of rows) {
        if (r.status !== 'open' || r.breakeven || !hitKeys.has(r.signal_key)) continue;
        try {
          const res = await mt.trade(id, { actionType: 'POSITION_MODIFY', positionId: r.order_id, stopLoss: Number(r.entry), takeProfit: Number(r.take_profit) });
          if (tradeOk(res)) { await supabaseAdmin.from('broker_trades').update({ breakeven: true, stop_loss: r.entry }).eq('id', r.id); changed++; }
        } catch { /* price may be too close to entry right now; retry next minute */ }
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
  return { configured: metaapiConfigured(), settings, accounts, trades: trades || [] };
}
