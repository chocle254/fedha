// "Potential": what the channels' closed trades would have made on your account at your risk setting, and how
// ready you are for real money. Every trade is scored in R (profit ÷ that trade's own risk), which does not depend
// on lot size, so trades from before the 0.01-lot change count too. Pure: used by the trading page.
//
// Replays: trades in the order they closed, each risking `riskPct` of the balance at that moment (compounding),
// optionally capped at the balance that is left. "All channels" = what auto-trading everything does; "winners only"
// = channels with a positive average R over at least MIN_N trades (picked with hindsight, so read it as an upper
// bound, not a promise).

const MIN_N = 3;
const DAY = 864e5;

export const rOf = (t) => {
  const risk = Number(t.actual_risk_usdt) || Number(t.risk_usdt);
  const pnl = Number(t.pnl_usdt);
  return risk > 0 && Number.isFinite(pnl) ? pnl / risk : null;
};

function replay(trades, start, riskPct) {
  let bal = start; let peak = start; let maxDd = 0; let bust = false;
  const curve = [start];
  for (const t of trades) {
    if (bal <= 1) { bust = true; break; }
    const risk = Math.min(bal, (bal * riskPct) / 100);
    bal = Math.max(0, bal + risk * t.r);
    peak = Math.max(peak, bal);
    maxDd = Math.max(maxDd, peak > 0 ? (peak - bal) / peak : 0);
    curve.push(bal);
  }
  return { end: bal, maxDd: Math.round(maxDd * 100), bust: bust || bal <= 1, curve };
}

// Days to grow from `from` to `to` at a steady growth per trade and trades per day (null if shrinking).
function daysTo(from, to, perTradeGrowth, perDay) {
  if (!(perTradeGrowth > 0) || !(perDay > 0) || from >= to) return null;
  return Math.ceil(Math.log(to / from) / Math.log(1 + perTradeGrowth) / perDay);
}

export function potentialReport(rows, { start = 1000, riskPct = 1, goal = 10000 } = {}) {
  const closed = (rows || [])
    .filter((t) => t.signal_id && ['won', 'lost'].includes(t.status) && (t.book || 'main') === 'main')
    .map((t) => ({ source: t.source, r: rOf(t), at: new Date(t.closed_at || t.created_at).getTime() }))
    .filter((t) => t.r != null && Number.isFinite(t.r))
    .sort((a, b) => a.at - b.at);
  if (!closed.length) return null;

  const spanDays = Math.max(1, (Date.now() - closed[0].at) / DAY);
  const by = new Map();
  for (const t of closed) {
    if (!by.has(t.source)) by.set(t.source, []);
    by.get(t.source).push(t);
  }
  const risk$ = (start * riskPct) / 100;
  const channels = [...by.entries()].map(([source, ts]) => {
    const n = ts.length;
    const avgR = ts.reduce((s, t) => s + t.r, 0) / n;
    const wins = ts.filter((t) => t.r > 0).length;
    const perWeek = (n / spanDays) * 7;
    return { source, n, avgR, winRate: Math.round((wins / n) * 100), perWeek, weekly: risk$ * avgR * perWeek, totalR: avgR * n };
  }).sort((a, b) => b.totalR - a.totalR);

  const winners = new Set(channels.filter((c) => c.n >= MIN_N && c.avgR > 0).map((c) => c.source));
  const all = replay(closed, start, riskPct);
  const best = replay(closed.filter((t) => winners.has(t.source)), start, riskPct);
  const perDayAll = closed.length / spanDays;
  const perDayBest = closed.filter((t) => winners.has(t.source)).length / spanDays;
  const growth = (rp, n) => (n ? Math.pow(Math.max(rp.end, 0.01) / start, 1 / n) - 1 : 0);
  const nBest = closed.filter((t) => winners.has(t.source)).length;
  const avgAll = closed.reduce((s, t) => s + t.r, 0) / closed.length;

  // Go-real checklist from the data.
  const proven = channels.filter((c) => c.n >= 10 && c.avgR >= 0.2);
  const checks = [
    { ok: closed.length >= 30, text: `30+ closed trades to judge from (${closed.length} so far)` },
    { ok: proven.length >= 1, text: `At least one channel with 10+ trades and avg R ≥ +0.2 (${proven.length ? proven.map((c) => c.source).join(', ') : 'none yet'})` },
    { ok: avgAll > 0, text: `All signals together make money (avg ${avgAll >= 0 ? '+' : ''}${avgAll.toFixed(2)}R per trade)` },
    { ok: best.maxDd < 40 && nBest >= 10, text: `Following the winners, the worst drop stays under 40% (${nBest >= 10 ? `${best.maxDd}%` : 'not enough trades'})` },
  ];

  return {
    start, riskPct, goal, trades: closed.length, spanDays: Math.round(spanDays), avgAll,
    channels, winners: [...winners],
    all: { ...all, days: daysTo(start, goal, growth(all, closed.length), perDayAll) },
    best: { ...best, n: nBest, days: daysTo(start, goal, growth(best, nBest), perDayBest) },
    checks, ready: checks.every((c) => c.ok),
  };
}
