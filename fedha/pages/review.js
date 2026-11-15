import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import { getSetting, setSetting, getTransactions } from '../lib/db';
import { BLOCKERS, blockerLabel, loadReviews, saveReview, analyse, streakOf, reviewDate, addDays, INSIGHT_KEY, HEAVY } from '../lib/daily-review';

// Daily Review: the planner's 📝 block, as a notebook that guides you through it.
//   Tonight   a short questionnaire: yesterday's promise and top 3 checked, today's numbers filled in from the
//             planner and your transactions, then the day's score, wins, what you learned, what got in the way,
//             one change for tomorrow and tomorrow's top 3. Each question says how to answer it well.
//   Notebook  every night you wrote (last 60 kept).
//   Patterns  what the numbers show (trend, what costs you days, best weekday, promises kept), and the coach's
//             honest read (pages/api/review-coach.js) with changes for tomorrow's plan. The planner shows those
//             changes, your top 3 and your "do differently" the next morning.
const card = { padding: 16, marginBottom: 12 };
const label = { fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: 'var(--text-3)', textTransform: 'uppercase' };
const hint = { fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5, margin: '4px 0 10px' };
const chip = (on) => ({ padding: '7px 11px', borderRadius: 999, fontSize: 12.5, border: `1px solid ${on ? 'var(--accent, #6366F1)' : 'var(--border)'}`, background: on ? 'rgba(99,102,241,0.15)' : 'transparent', color: 'inherit', cursor: 'pointer' });
const kes = (n) => `KSh ${Math.round(Number(n) || 0).toLocaleString('en-KE')}`;
const nice = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const SCORE_GUIDE = { 1: 'Lost day', 3: 'Little moved', 5: 'Busy, main thing stuck', 7: 'Main thing moved', 9: 'Did what mattered and more', 10: 'Best kind of day' };
const blank = { score: null, energy: null, wins: '', learned: '', blockers: [], blockerNote: '', differently: '', top3: ['', '', ''], lastPromise: null, topTicks: [] };

function Q({ n, title, guide, children }) {
  return (
    <div className="card" style={card}>
      <div style={label}>{n}</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{title}</div>
      {guide && <div style={hint}>{guide}</div>}
      {children}
    </div>
  );
}

export default function Review() {
  const [tab, setTab] = useState('tonight');
  const [list, setList] = useState(null);
  const [f, setF] = useState(blank);
  const [facts, setFacts] = useState({ planDone: null, three: false, moneyIn: 0 });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [insight, setInsight] = useState(null);
  const [coach, setCoach] = useState({ busy: false, err: '' });
  const [open, setOpen] = useState(null);
  const date = reviewDate();

  useEffect(() => {
    loadReviews().then((l) => {
      setList(l);
      const mine = l.find((x) => x.date === date);
      if (mine) { setF({ ...blank, ...mine, top3: [...(mine.top3 || []), '', '', ''].slice(0, 3), topTicks: Array.from({ length: mine.topDone || 0 }, (_, i) => i) }); setSaved(true); }
    });
    getSetting(INSIGHT_KEY, null).then(setInsight).catch(() => {});
    // Today in numbers: planner ticks, the three that count, money in.
    Promise.all([getSetting(`planner_done_${date}`, []), getSetting('planner_wins', []), getTransactions({ type: 'income', from_date: date })])
      .then(([done, wins, txs]) => setFacts({
        planDone: Array.isArray(done) ? done.length : null,
        three: Array.isArray(wins) && wins.includes(date),
        moneyIn: (txs || []).filter((t) => String(t.date).slice(0, 10) === date && t.category !== 'transfer').reduce((s, t) => s + Number(t.amount || 0), 0),
      })).catch(() => {});
  }, [date]);

  const yesterday = useMemo(() => (list || []).find((x) => x.date === addDays(date, -1)) || null, [list, date]);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setSaved(false); };
  const allText = `${f.wins} ${f.learned} ${f.blockerNote} ${f.differently}`;
  const heavy = HEAVY.test(allText);
  const ready = f.score && f.wins.trim() && f.differently.trim() && f.top3.some((x) => x.trim());

  const submit = async () => {
    setBusy(true);
    try {
      const yTop = (yesterday?.top3 || []).filter(Boolean);
      const next = await saveReview(list || [], {
        ...f, date, top3: f.top3.filter((x) => x.trim()),
        lastPromise: yesterday?.differently ? f.lastPromise : null,
        topDone: yTop.length ? f.topTicks.length : null, topCount: yTop.length || null,
        planDone: facts.planDone, three: facts.three, moneyIn: facts.moneyIn,
      });
      setList(next); setSaved(true);
    } finally { setBusy(false); }
  };

  const askCoach = async () => {
    setCoach({ busy: true, err: '' });
    try {
      const r = await fetch('/api/review-coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviews: (list || []).slice(-14) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Coach unavailable');
      setInsight(j.insight); setSetting(INSIGHT_KEY, j.insight).catch(() => {});
      setCoach({ busy: false, err: '' });
    } catch (e) { setCoach({ busy: false, err: e.message }); }
  };

  const stats = useMemo(() => (list && list.length ? analyse(list) : null), [list]);
  const streak = list ? streakOf(list) : 0;

  return (
    <Layout fab={false}>
      <Head><title>Daily Review · Luxe</title></Head>
      <div style={{ padding: '12px 16px 90px', maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: '4px 0 4px' }}>📝 Daily Review</h1>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>Ten minutes before bed. Facts, not feelings: what moved, what got in the way, what changes tomorrow. Luxe keeps it, finds the patterns and puts your top 3 on tomorrow's plan.{streak > 1 ? ` 🔥 ${streak} nights in a row.` : ''}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[['tonight', 'Tonight'], ['notebook', `Notebook${list?.length ? ` (${list.length})` : ''}`], ['patterns', 'Patterns']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} style={{ ...chip(tab === k), fontWeight: 700 }}>{l}</button>
          ))}
        </div>

        {heavy && (
          <div className="card" style={{ ...card, border: '1px solid #F59E0B' }}>
            <b>This sounds heavier than a review.</b>
            <div style={{ ...hint, marginBottom: 8 }}>What you wrote matters more than any plan. Befrienders Kenya listen to exactly this, free: <a href="tel:+254722178177">0722 178 177</a>. Or talk to someone near you tonight.</div>
            <Link href="/support" className="btn-primary" style={{ display: 'inline-block', width: 'auto', padding: '8px 14px' }}>Open When it's heavy</Link>
          </div>
        )}

        {tab === 'tonight' && list && (
          <>
            <div style={{ ...label, marginBottom: 8 }}>Review for {nice(date)}</div>

            {yesterday && (yesterday.differently || yesterday.top3?.length > 0) && (
              <Q n="Check yesterday" title="Did you keep last night's word?" guide="Be strict. Partly means you started it, not that you thought about it.">
                {yesterday.differently && (
                  <>
                    <div style={{ fontSize: 13.5, marginBottom: 8 }}>You said you'd do differently: <i>“{yesterday.differently}”</i></div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      {[['yes', '✅ Yes'], ['partly', '〰️ Partly'], ['no', '❌ No']].map(([k, l]) => <button key={k} type="button" style={chip(f.lastPromise === k)} onClick={() => set('lastPromise', k)}>{l}</button>)}
                    </div>
                  </>
                )}
                {yesterday.top3?.length > 0 && (
                  <>
                    <div style={{ fontSize: 13.5, marginBottom: 6 }}>Yesterday's top 3 for today. Tick what got done:</div>
                    {yesterday.top3.map((t, i) => (
                      <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', fontSize: 14 }}>
                        <input type="checkbox" checked={f.topTicks.includes(i)} onChange={(e) => set('topTicks', e.target.checked ? [...f.topTicks, i] : f.topTicks.filter((x) => x !== i))} />{t}
                      </label>
                    ))}
                  </>
                )}
              </Q>
            )}

            <Q n="Today in numbers" title="What the app saw" guide="Filled in for you from the planner and your transactions. Use it to keep the score honest.">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13.5 }}>
                <span>☑️ {facts.planDone ?? 0} planner blocks ticked</span>
                <span>{facts.three ? '🏆 The three that count: all done' : '◻️ The three that count: not all done'}</span>
                <span>{facts.moneyIn > 0 ? `💰 ${kes(facts.moneyIn)} came in` : '💰 No money in today'}</span>
              </div>
            </Q>

            <Q n="1 · Score" title="Score the day, 1 to 10" guide="Judge it by the most important thing, not by how busy you were. 5 = busy but the main thing didn't move. 7 = the main thing moved. 9 = that and more.">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" onClick={() => set('score', n)} style={{ ...chip(f.score === n), padding: '8px 0', fontWeight: 800 }}>{n}</button>
                ))}
              </div>
              {f.score && <div style={{ ...hint, marginBottom: 0 }}>{SCORE_GUIDE[f.score] || SCORE_GUIDE[f.score - 1] || ''}</div>}
            </Q>

            <Q n="2 · Energy" title="How was your energy for work?" guide="Over the day, not right now. Over time this shows which days and habits give you a good run.">
              <div style={{ display: 'flex', gap: 8 }}>
                {[['low', '🪫 Low'], ['ok', '🔋 OK'], ['high', '⚡ High']].map(([k, l]) => <button key={k} type="button" style={chip(f.energy === k)} onClick={() => set('energy', k)}>{l}</button>)}
              </div>
            </Q>

            <Q n="3 · Wins" title="What did you finish or move forward?" guide="Facts you could show someone. Name the project and what changed. Small counts: one message to a client is a win.">
              <textarea className="input" rows={3} value={f.wins} onChange={(e) => set('wins', e.target.value)} placeholder="e.g. Sent the landing page draft to the client. Finished lesson 4 of the course. Closed 2 paper trades on the London channel." />
            </Q>

            <Q n="4 · Learned" title="One thing you know now that you didn't this morning" guide="A skill, something about a client or the market, or a mistake you won't repeat. One line is enough.">
              <textarea className="input" rows={2} value={f.learned} onChange={(e) => set('learned', e.target.value)} placeholder="e.g. Clients reply faster when I send a short video instead of a long message." />
            </Q>

            <Q n="5 · Got in the way" title="What cost you time today?" guide="Pick everything that applies, then say where it hit. Patterns show up after a week.">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {BLOCKERS.map(([k, l]) => (
                  <button key={k} type="button" style={chip(f.blockers.includes(k))} onClick={() => set('blockers', k === 'none' ? ['none'] : f.blockers.includes(k) ? f.blockers.filter((x) => x !== k) : [...f.blockers.filter((x) => x !== 'none'), k])}>{l}</button>
                ))}
              </div>
              <input className="input" style={{ marginTop: 10 }} value={f.blockerNote} onChange={(e) => set('blockerNote', e.target.value)} placeholder="Where it hit, e.g. lost 10 to 12 on the phone after breakfast" />
            </Q>

            <Q n="6 · Do differently" title="One change for tomorrow" guide="Specific, with a time or a trigger. Not “be more productive” but “phone in the other room from 9 to 11”. You'll be asked about it tomorrow night.">
              <input className="input" value={f.differently} onChange={(e) => set('differently', e.target.value)} placeholder="e.g. Start client work before opening WhatsApp" />
            </Q>

            <Q n="7 · Tomorrow" title="Tomorrow's top 3" guide="The three things that would make tomorrow a win. Start each with a verb and keep each one small enough to finish. They show on the planner in the morning.">
              {f.top3.map((t, i) => (
                <input key={i} className="input" style={{ marginBottom: 6 }} value={t} onChange={(e) => set('top3', f.top3.map((x, k) => (k === i ? e.target.value : x)))} placeholder={['e.g. Finish the checkout page for the client', 'e.g. Apply to one remote job', 'e.g. 45 min of the course'][i]} />
              ))}
            </Q>

            <button type="button" className="btn-primary" disabled={!ready || busy} onClick={submit} style={{ width: '100%', opacity: ready ? 1 : 0.5 }}>{busy ? 'Saving…' : saved ? '✓ Saved · save changes' : 'Save tonight\'s review'}</button>
            {!ready && <div style={{ ...hint, textAlign: 'center' }}>Score, wins, one change and at least one of tomorrow's top 3 are needed.</div>}
            {saved && (
              <div className="card" style={{ ...card, marginTop: 12 }}>
                <b>Saved.</b> Your top 3 and your one change will be on the planner tomorrow morning.
                {(list?.length || 0) >= 2 && <button type="button" className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => { setTab('patterns'); askCoach(); }}>🧠 What do my reviews say?</button>}
              </div>
            )}
          </>
        )}

        {tab === 'notebook' && list && (
          list.length === 0 ? <div style={hint}>Nothing yet. Tonight's review will be the first page.</div> : [...list].reverse().map((r) => (
            <div key={r.date} className="card" style={{ ...card, cursor: 'pointer' }} onClick={() => setOpen(open === r.date ? null : r.date)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <b style={{ flex: 1 }}>{nice(r.date)}</b>
                {r.moneyIn > 0 && <span style={{ fontSize: 12, color: '#22C55E' }}>{kes(r.moneyIn)}</span>}
                <span style={{ fontWeight: 900, fontSize: 18 }}>{r.score}<small style={{ fontSize: 11, color: 'var(--text-3)' }}>/10</small></span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: open === r.date ? 'normal' : 'nowrap' }}>{r.wins}</div>
              {open === r.date && (
                <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
                  {r.learned && <div>💡 <b>Learned:</b> {r.learned}</div>}
                  {r.blockers?.length > 0 && <div>🚧 <b>In the way:</b> {r.blockers.map(blockerLabel).join(', ')}{r.blockerNote ? ` · ${r.blockerNote}` : ''}</div>}
                  {r.differently && <div>🔁 <b>Do differently:</b> {r.differently}</div>}
                  {r.top3?.length > 0 && <div>🎯 <b>Next day's top 3:</b> {r.top3.join(' · ')}</div>}
                  <div style={{ color: 'var(--text-3)' }}>Energy {r.energy || '?'} · {r.planDone ?? 0} blocks ticked{r.three ? ' · 🏆 three that count' : ''}{r.topCount ? ` · top 3 done ${r.topDone}/${r.topCount}` : ''}{r.lastPromise ? ` · kept word: ${r.lastPromise}` : ''}</div>
                </div>
              )}
            </div>
          ))
        )}

        {tab === 'patterns' && list && (
          !stats ? <div style={hint}>Write a few reviews first. After three nights the numbers start to mean something; after a week the patterns are real.</div> : (
            <>
              <div className="card" style={card}>
                <div style={label}>Day scores, last {stats.scores.length}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, marginTop: 10 }}>
                  {stats.scores.map((s) => <div key={s.date} title={`${s.date}: ${s.score}`} style={{ flex: 1, height: `${s.score * 10}%`, borderRadius: 4, background: s.score >= 7 ? '#22C55E' : s.score >= 5 ? '#F59E0B' : '#EF4444' }} />)}
                </div>
                <div style={{ fontSize: 13.5, marginTop: 10 }}>
                  Last 7 nights: <b>{stats.avgWeek?.toFixed(1)}</b>/10{stats.avgBefore != null ? ` (the 7 before: ${stats.avgBefore.toFixed(1)}, ${stats.avgWeek >= stats.avgBefore ? 'up' : 'down'} ${Math.abs(stats.avgWeek - stats.avgBefore).toFixed(1)})` : ''}.
                </div>
              </div>

              {stats.topBlockers.length > 0 && (
                <div className="card" style={card}>
                  <div style={label}>What costs you days (last 30)</div>
                  {stats.topBlockers.map((b) => (
                    <div key={b.id} style={{ display: 'flex', gap: 8, fontSize: 13.5, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ flex: 1 }}>{blockerLabel(b.id)}</span>
                      <span>{b.n}×</span>
                      {b.drop != null && b.drop > 0.3 && <span style={{ color: '#EF4444' }}>−{b.drop.toFixed(1)} on those days</span>}
                    </div>
                  ))}
                </div>
              )}

              <div className="card" style={card}>
                <div style={label}>Habits</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.7, marginTop: 6 }}>
                  {stats.promiseRate != null && <div>🔁 Kept your “do differently” {Math.round(stats.promiseRate * 100)}% of the time ({stats.promiseN} checked).</div>}
                  {stats.topRate != null && <div>🎯 Got through {Math.round(stats.topRate * 100)}% of your top 3 ({stats.topN} days).</div>}
                  {stats.bestDay && <div>📅 Best day: {stats.bestDay[0]} ({stats.bestDay[1].toFixed(1)}){stats.worstDay ? ` · hardest: ${stats.worstDay[0]} (${stats.worstDay[1].toFixed(1)})` : ''}.</div>}
                  {stats.energy.high != null && stats.energy.low != null && <div>⚡ High-energy days score {stats.energy.high.toFixed(1)}, low ones {stats.energy.low.toFixed(1)}.</div>}
                  <div>💰 Money came in on {stats.moneyDays} of the last {Math.min(30, stats.count)} reviewed days{stats.moneyTotal ? ` (${kes(stats.moneyTotal)})` : ''}.</div>
                </div>
              </div>

              <div className="card" style={card}>
                <div style={label}>Coach's read</div>
                {insight && (
                  <div style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 6 }}>
                    {insight.care && <div style={{ color: '#F59E0B', marginBottom: 8 }}>{insight.care} <Link href="/support">When it's heavy →</Link></div>}
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{insight.headline}</div>
                    {insight.trend && <div style={{ color: 'var(--text-2)' }}>{insight.trend}</div>}
                    {insight.patterns?.length > 0 && <ul style={{ paddingLeft: 18, margin: '8px 0' }}>{insight.patterns.map((p, i) => <li key={i}>{p}</li>)}</ul>}
                    {insight.costly && <div>🚧 <b>Costing you most:</b> {insight.costly}</div>}
                    {insight.plan_changes?.length > 0 && <div style={{ marginTop: 6 }}>🗓 <b>Change in the plan</b> (shown on the planner this week):<ul style={{ paddingLeft: 18, margin: '4px 0' }}>{insight.plan_changes.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
                    {insight.keep && <div>✅ <b>Keep:</b> {insight.keep}</div>}
                    {insight.question && <div style={{ marginTop: 6 }}>❓ <b>Ask yourself tonight:</b> {insight.question}</div>}
                    <div style={{ ...hint, marginBottom: 0 }}>From {insight.days} reviews · {new Date(insight.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                  </div>
                )}
                <button type="button" className="btn-ghost" disabled={coach.busy || list.length < 2} style={{ width: '100%', marginTop: 10 }} onClick={askCoach}>{coach.busy ? 'Reading your reviews…' : insight ? '🧠 Read them again' : list.length < 2 ? 'Needs two reviews' : '🧠 What do my reviews say?'}</button>
                {coach.err && <div style={{ ...hint, color: '#EF4444' }}>{coach.err}</div>}
              </div>
            </>
          )
        )}
      </div>
    </Layout>
  );
}
