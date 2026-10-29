// Server side of "money in": totals from the transactions table (single-user app), and milestone tracking so a
// "best day" or "week crossed KES 10,000" notification is sent once. See lib/earnings.js.
import { supabaseAdmin } from './supabaseAdmin';
import { summarize, crossed, kes } from './earnings';
import { pushToAll } from './nestlink-push';

const KEY = 'earn_milestones';

// extra: an amount that has arrived but is not in the transactions table yet (e.g. a NestLink payout the app
// records when it next opens); skipId: that payout's future transaction id, so it is never counted twice.
export async function earningsNow({ extra = 0, skipId = null } = {}) {
  const since = new Date(Date.now() - 45 * 864e5).toISOString();
  const { data } = await supabaseAdmin.from('transactions').select('id, type, amount, description, date, created_at, user_id').eq('type', 'income').gte('date', since);
  const rows = (data || []).filter((t) => t.id !== skipId);
  const already = skipId && (data || []).some((t) => t.id === skipId);
  return { summary: summarize(rows, Date.now(), already ? 0 : extra, Number(process.env.TZ_OFFSET_MINUTES ?? 180)), userId: data?.[0]?.user_id || null };
}

// After money comes in: one extra notification for a best day ever or a weekly milestone, never repeated.
export async function celebrate(summary, userId, before) {
  if (!userId) return null;
  const { data } = await supabaseAdmin.from('settings').select('value').eq('user_id', userId).eq('key', KEY).maybeSingle();
  const state = data?.value || {};
  const day = summary.days14.at(-1).day;
  const wk = summary.weekOf;
  let msg = null;
  const m = crossed(before ?? 0, summary.week);
  if (m && !(state.weekHits || []).includes(`${wk}|${m}`)) {
    msg = { title: `🏆 ${kes(m)} week!`, body: `You've brought in ${kes(summary.week)} this week${summary.lastWeek ? ` (last week ${kes(summary.lastWeek)})` : ''}. Keep it coming.`, tag: `earn-week-${m}` };
    state.weekHits = [...(state.weekHits || []), `${wk}|${m}`].slice(-30);
  } else if (summary.isBestDay && state.bestDay !== day) {
    msg = { title: `🥇 Best day yet: ${kes(summary.today)}`, body: `Your best day so far was ${kes(summary.bestBefore)}. New record.`, tag: `earn-best-${day}` };
    state.bestDay = day;
  }
  if (!msg) return null;
  await supabaseAdmin.from('settings').upsert({ user_id: userId, key: KEY, value: state, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
  await pushToAll({ ...msg, url: '/' }).catch(() => {});
  return msg;
}
