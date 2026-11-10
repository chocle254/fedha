// lib/followups.js — reads what a channel says AFTER a signal and acts on the open trade.
//
// Channels post "close now", "move SL to entry", "cancel the limit", "secure profits". Those posts used to be
// thrown away. Now a post that sounds like an instruction, from a channel that has a trade open, is read by the
// AI (with the open trades next to it) and turned into ONE action:
//   close           close that channel's open trades now (paper and MT5) and cancel its pending orders
//   cancel_pending  cancel orders that have not filled yet
//   breakeven       move the stop to the entry price (MT5 positions)
//   move_sl         move the stop to the price given (MT5 positions)
// Safety: it only ever REDUCES risk. A stop is only moved closer (never further away), and it acts only when
// the AI is at least 70% sure. Result posts ("TP1 hit ✅ +50 pips") are not instructions and are ignored.
// Paper trades take close and cancel only: their stop already trails by itself (lib/trading-core.js).
import { supabaseAdmin } from './supabaseAdmin';
import { aiJSON } from './ai-json';
import { closeOrCancel, notify } from './trading';
import { mt, tradeOk, accountId, metaapiConfigured } from './metaapi';
import { isRealAccount } from './broker';

const SOUNDS_LIKE = /\b(close|closing|exit|cut (it|the|your|this)|break\s*-?\s*even|\bB\.?E\b|risk\s*-?\s*free|move (the |your )?(sl|stop)|(sl|stop(\s*loss)?) (to|at)\b|set (the |your )?(sl|stop)|secure|cancel|delete|remove (the |your )?(order|limit|pending))/i;
const fmt = (n) => (n == null ? '—' : Number(Number(n).toPrecision(7)).toString());

export async function handleFollowUp({ userId, source, text }) {
  try {
    if (!SOUNDS_LIKE.test(String(text))) return null;
    const [{ data: paper }, { data: broker }] = await Promise.all([
      supabaseAdmin.from('paper_trades').select('id, symbol, side, entry, stop_loss, status, book').eq('user_id', userId).eq('source', source).in('status', ['open', 'pending']).limit(20),
      supabaseAdmin.from('broker_trades').select('id, account, symbol, side, entry, stop_loss, take_profit, status, order_id').eq('user_id', userId).eq('source', source).in('status', ['open', 'pending']).limit(20),
    ]);
    const live = [...(paper || []), ...(broker || [])];
    if (!live.length) return null;

    const seen = new Set();
    const list = live.filter((t) => { const k = `${t.symbol}|${t.side}|${t.status}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((t) => `- ${t.side} ${t.symbol}, ${t.status === 'pending' ? 'order not filled yet' : 'open'}, entry ${fmt(t.entry)}, stop ${fmt(t.stop_loss)}`).join('\n');
    const o = await aiJSON(`A trading signal channel posted a message after its signal. Decide whether it tells followers to DO something to a trade that is open right now.

The channel's trades that are open right now:
${list}

The message:
"""
${String(text).slice(0, 800)}
"""

Actions:
- "close": followers should close the trade now ("close now", "exit", "close all", "we are closing here", "closed manually").
- "cancel_pending": cancel an order that has not filled ("cancel the limit", "delete pending", "setup invalid").
- "breakeven": move the stop-loss to the entry price ("SL to BE", "set breakeven", "risk free now", "secure the trade").
- "move_sl": move the stop-loss to a specific price given in the message.
- "none": anything else. A report of results ("TP1 hit", "+50 pips", "target reached", "running in profit"), an advert, a new signal, or a message about a trade that is not in the list is "none". If the message only reports that the stop-loss or the final target was hit, that is "none" (the trade closes by itself).
If the message names a market that is not in the list, the answer is "none".
Return JSON: {"action":"close|cancel_pending|breakeven|move_sl|none","symbol":"the market it refers to, or empty for all of this channel's trades","price":null,"sure":0}
"price" is the new stop-loss for move_sl, else null. "sure" is 0-100: how sure you are that this is an instruction to act now.`, { fast: true, maxTokens: 300, temperature: 0 });
    if (!o || !['close', 'cancel_pending', 'breakeven', 'move_sl'].includes(o.action) || !(Number(o.sure) >= 70)) return null;

    const sym = String(o.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const gold = (s) => (/XAU|GOLD|PAXG/.test(s) ? 'GOLD' : s);
    const match = (t) => !sym || gold(String(t.symbol).toUpperCase()).includes(gold(sym)) || gold(sym).includes(gold(String(t.symbol).toUpperCase()));
    const done = { action: o.action, paper: 0, broker: 0, real: false };

    // Paper: close / cancel.
    if (o.action === 'close' || o.action === 'cancel_pending') {
      for (const t of (paper || []).filter(match)) {
        if (o.action === 'cancel_pending' && t.status !== 'pending') continue;
        const r = await closeOrCancel(userId, t.id).catch(() => null);
        if (r?.ok) done.paper += 1;
      }
    }

    // MT5 accounts.
    if (metaapiConfigured()) {
      const posCache = {};
      for (const t of (broker || []).filter(match)) {
        const id = accountId(t.account);
        if (!id || !t.order_id) continue;
        try {
          let res = null;
          if (t.status === 'pending') {
            if (o.action === 'close' || o.action === 'cancel_pending') res = await mt.trade(id, { actionType: 'ORDER_CANCEL', orderId: t.order_id });
          } else if (o.action === 'close') {
            res = await mt.trade(id, { actionType: 'POSITION_CLOSE_ID', positionId: t.order_id });
          } else if (o.action === 'breakeven' || o.action === 'move_sl') {
            posCache[id] = posCache[id] || (await mt.positions(id)) || [];
            const pos = posCache[id].find((x) => String(x.id) === String(t.order_id));
            if (!pos) continue;
            const buy = t.side === 'BUY';
            const want = o.action === 'breakeven' ? Number(pos.openPrice) : Number(o.price);
            const now = Number(pos.currentPrice);
            const cur = pos.stopLoss != null ? Number(pos.stopLoss) : null;
            // Only ever tighten: the new stop must be closer than the old one and still on the safe side of the price.
            const tighter = cur == null || (buy ? want > cur : want < cur);
            const valid = Number.isFinite(want) && Number.isFinite(now) && (buy ? want < now : want > now);
            if (!tighter || !valid) continue;
            res = await mt.trade(id, { actionType: 'POSITION_MODIFY', positionId: t.order_id, stopLoss: want, ...(pos.takeProfit != null ? { takeProfit: pos.takeProfit } : {}) });
            if (tradeOk(res)) await supabaseAdmin.from('broker_trades').update({ stop_loss: want, breakeven: true }).eq('id', t.id).then(() => null, () => null);
          }
          if (res && tradeOk(res)) { done.broker += 1; if (await isRealAccount(t.account).catch(() => false)) done.real = true; }
        } catch { /* this position is left as it is */ }
      }
    }

    if (!done.paper && !done.broker) return null;
    const what = { close: 'closed', cancel_pending: 'cancelled the pending order of', breakeven: 'moved the stop to entry on', move_sl: `moved the stop to ${fmt(o.price)} on` }[o.action];
    done.note = `${source} said so: ${what} ${done.paper + done.broker} trade${done.paper + done.broker === 1 ? '' : 's'}`;
    // Real-money trades stay silent (your rule); paper and demo actions are announced.
    if (!done.real || done.paper) await notify({ title: `📣 ${source}: ${o.action === 'close' ? 'close now' : o.action === 'cancel_pending' ? 'cancel order' : 'protect the trade'}`, body: `Luxe ${what} ${done.paper ? `${done.paper} paper trade${done.paper === 1 ? '' : 's'}` : 'the trade'}. Message: "${String(text).replace(/\s+/g, ' ').slice(0, 110)}"` }, `followup-${source}-${Date.now()}`);
    return done;
  } catch { return null; }
}
