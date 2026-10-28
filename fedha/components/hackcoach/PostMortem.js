import { useState } from 'react';
import { coachAsk, hackForAI } from '../../lib/hack-coach';

// After the results: record what happened, and the mentor turns it into short, reusable lessons.
// Those lessons are sent with every mentor request on future hackathons (lessonsFrom in lib/hack-coach).
// One AI call per post-mortem, on the light model, to stay inside the free tier.
const RESULTS = [['won', '🏆 Won'], ['placed', '🥈 Placed / prize'], ['finalist', '⭐ Finalist'], ['not_placed', 'Not placed'], ['not_submitted', "Didn't submit"]];

export default function PostMortem({ hack, saveCoach, pastLessons = [] }) {
  const pm = hack.coach?.postmortem || {};
  const [f, setF] = useState({ result: pm.result || '', place: pm.place || '', feedback: pm.feedback || '', well: pm.well || '', badly: pm.badly || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const review = async () => {
    setBusy(true); setErr('');
    try {
      const label = RESULTS.find(([k]) => k === f.result)?.[1] || f.result;
      const r = await coachAsk('hack_postmortem', { hack: hackForAI(hack), postmortem: { ...f, result: label } });
      await saveCoach({ postmortem: { ...f, review: r.review, at: new Date().toISOString() } });
      if (f.result === 'won' || f.result === 'placed') { try { (await import('../../lib/confetti')).fireConfetti(); } catch { /* optional */ } }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="muse-grid"><div className="muse-col">
      <section className="card muse-card">
        <div className="muse-label">🏁 HOW DID IT GO?</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>Once results are out, tell the mentor what happened. It turns it into lessons, and every future hackathon&apos;s ideas, plans and judging use them.</div>
        <div className="muse-suggest" style={{ marginTop: 10 }}>
          {RESULTS.map(([k, l]) => <button key={k} type="button" onClick={() => setF((x) => ({ ...x, result: k }))} style={f.result === k ? { borderColor: '#7B61FF', background: 'rgba(123,97,255,0.15)' } : undefined}>{l}</button>)}
        </div>
        {['won', 'placed', 'finalist'].includes(f.result) && <input className="input" style={{ marginTop: 8 }} placeholder="Which prize or place?" value={f.place} onChange={set('place')} />}
        <textarea className="input" rows={3} style={{ marginTop: 8 }} placeholder="What did the judges or organisers say? (paste their feedback if you got any)" value={f.feedback} onChange={set('feedback')} />
        <textarea className="input" rows={2} style={{ marginTop: 8 }} placeholder="What went well?" value={f.well} onChange={set('well')} />
        <textarea className="input" rows={2} style={{ marginTop: 8 }} placeholder="What went badly or would you do differently?" value={f.badly} onChange={set('badly')} />
        <button className="btn-primary" style={{ marginTop: 10 }} onClick={review} disabled={busy || !f.result}>{busy ? 'Reviewing…' : pm.review ? '↻ Review again' : '🧠 Turn this into lessons'}</button>
        {err && <div style={{ fontSize: 12.5, color: '#EF4444', marginTop: 8 }}>{err}</div>}
      </section>

      {pm.review && (
        <section className="card muse-card">
          <div className="muse-label">THE MENTOR&apos;S REVIEW</div>
          <div style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>{pm.review.summary}</div>
          {pm.review.repeat?.length > 0 && <><div className="muse-label" style={{ marginTop: 10, color: 'var(--green)' }}>DO AGAIN</div><ul className="muse-how">{pm.review.repeat.map((x) => <li key={x}>{x}</li>)}</ul></>}
          {pm.review.change?.length > 0 && <><div className="muse-label" style={{ marginTop: 10 }}>DO DIFFERENTLY</div><ul className="muse-how">{pm.review.change.map((x) => <li key={x}>{x}</li>)}</ul></>}
          <div className="muse-label" style={{ marginTop: 10, color: '#E9C77B' }}>LESSONS (USED ON EVERY FUTURE HACKATHON)</div>
          <ul className="muse-how">{pm.review.lessons.map((x) => <li key={x}>{x}</li>)}</ul>
          {pm.review.next && <div className="muse-bubble" style={{ marginTop: 10 }}><div className="muse-bubble-kicker">NEXT TIME, GO BIGGER</div>{pm.review.next}</div>}
        </section>
      )}

      {pastLessons.length > 0 && (
        <section className="card muse-card">
          <div className="muse-label">LESSONS FROM YOUR PAST HACKATHONS</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>The mentor already applies these to this hackathon.</div>
          <ul className="muse-how">{pastLessons.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      )}
    </div></div>
  );
}
