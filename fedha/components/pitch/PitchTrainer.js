import { useEffect, useRef, useState } from 'react';
import { speak as luxeSpeak } from '../../lib/voice';

// Pitch trainer for Startups and Hackathons. Built to make the pitch better, not to make you feel good:
//   Full run     teleprompter + live pace / filler meters. Scored by /api/pitch-trainer on evidence: what a listener
//                could repeat back (quotes checked against what you said), which planned points landed, and delivery
//                measured on the phone (time, pace, fillers, silences), with hard caps (no ask -> max 60).
//   Q&A grill    3 hard questions aimed at your weak spots, answered out loud on a 45 s clock, each graded
//                (did your first sentence answer it?) with a stronger answer to learn.
//   Drills       30-second pitch (time + fillers) and No script (cue titles only, no long silences).
//   Progress     scores over time and the mistakes that keep coming back.
// Runs are saved through saveRuns (summaries only); the last transcript stays on this phone for the grill.
const FILLERS = /\b(um+|uh+|erm+|ah+|like|you know|basically|actually|sort of|kind of|i mean|literally)\b/gi;
const TAG = {
  no_ask: 'No clear ask / reason to pick you', unclear_what: 'Unclear what it does', unclear_who: 'Unclear who it is for', unclear_problem: 'Problem not clear',
  no_proof: 'No proof (demo moment, result, number)', weak_opening: 'Weak opening', weak_close: 'Weak close', jargon: 'Jargon', too_long: 'Over time', too_short: 'Too short',
  too_fast: 'Too fast', too_slow: 'Too slow', fillers: 'Filler words', long_pauses: 'Long silences', missed_points: 'Planned points missed', rambling: 'Rambling', vague_numbers: 'Vague numbers',
};
const DRILL_FOR = { fillers: 'thirty', too_fast: 'thirty', too_slow: 'thirty', too_long: 'thirty', too_short: 'thirty', long_pauses: 'noscript', missed_points: 'noscript', rambling: 'thirty' };
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const color = (v) => (v >= 75 ? '#10B981' : v >= 50 ? '#F59E0B' : '#EF4444');

async function ask(action, payload) {
  const r = await fetch('/api/pitch-trainer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

// Speech-to-text that keeps going through Android's pauses and remembers which cue each phrase was said on.
function makeListener(getCue) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const st = { segs: [], interim: '', live: false, last: Date.now(), longest: 0, rec: null, ok: !!SR, onChange: () => {} };
  if (!SR) return st;
  const rec = new SR(); rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
  let seen = 0;
  rec.onresult = (e) => {
    const now = Date.now();
    const gap = (now - st.last) / 1000; if (gap > st.longest && st.segs.length) st.longest = gap; st.last = now;
    let interim = '';
    for (let i = seen; i < e.results.length; i++) {
      if (e.results[i].isFinal) { st.segs.push({ t: now, cue: getCue(), text: e.results[i][0].transcript.trim() }); seen = i + 1; } else interim += e.results[i][0].transcript;
    }
    st.interim = interim; st.onChange();
  };
  rec.onend = () => { seen = 0; if (st.live) { try { rec.start(); } catch { /* starting */ } } };
  rec.onerror = () => {};
  st.rec = rec;
  st.start = () => { st.live = true; st.last = Date.now(); try { rec.start(); } catch { st.ok = false; } };
  st.stop = () => { st.live = false; try { rec.stop(); } catch { /* stopped */ } if (st.interim) { st.segs.push({ t: Date.now(), cue: getCue(), text: st.interim }); st.interim = ''; } };
  st.text = () => `${st.segs.map((x) => x.text).join(' ')} ${st.interim}`.trim();
  return st;
}
const countWords = (t) => (t ? t.split(/\s+/).filter(Boolean).length : 0);
const countFillers = (t) => (t.match(FILLERS) || []).length;

export default function PitchTrainer({ audience = 'judges', context = '', cues = [], opener = '', oneLiner = '', defaultTarget = 180, runs = [], saveRuns, storeKey = 'pitch' }) {
  const [target, setTarget] = useState(defaultTarget);
  const [mode, setMode] = useState(null); // run | thirty | noscript
  const [live, setLive] = useState(null); // { start, cue, cueStart, spent: [] }
  const [result, setResult] = useState(null);
  const [drill, setDrill] = useState(null);
  const [grill, setGrill] = useState(null); // { qs, i, phase: 'ask'|'answer'|'graded', grades: [], start }
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [, tick] = useState(0);
  const L = useRef(null);
  const liveRef = useRef(null); liveRef.current = live;
  const lastKey = `luxe_pitch_last_${storeKey}`;

  // Cue lengths scaled to the target time.
  const planned = cues.reduce((t, c) => t + (Number(c.seconds) || 20), 0) || 1;
  const plan = cues.map((c) => ({ ...c, seconds: Math.max(5, Math.round(((Number(c.seconds) || 20) / planned) * target)) }));
  const deck = mode === 'thirty' ? [{ title: '30-second pitch', say: [opener, oneLiner].filter(Boolean).join(' ') || 'What it is, who it is for, why it matters, the ask.', seconds: 30 }] : plan;

  useEffect(() => {
    if (!live && !grill) return undefined;
    const t = setInterval(() => {
      tick((x) => x + 1);
      const l = liveRef.current; if (!l) return;
      const c = deck[l.cue];
      if (c && Date.now() - l.cueStart > c.seconds * 1000 && l.cue < deck.length - 1) goCue(l.cue + 1);
    }, 300);
    return () => clearInterval(t);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function goCue(n) {
    setLive((l) => { if (!l) return l; const spent = [...l.spent]; spent[l.cue] = (spent[l.cue] || 0) + (Date.now() - l.cueStart) / 1000; return { ...l, cue: Math.max(0, Math.min(deck.length - 1, n)), cueStart: Date.now(), spent }; });
  }

  function begin(m) {
    setErr(''); setResult(null); setDrill(null); setMode(m);
    L.current = makeListener(() => liveRef.current?.cue ?? 0);
    L.current.onChange = () => tick((x) => x + 1);
    L.current.start?.();
    setLive({ start: Date.now(), cue: 0, cueStart: Date.now(), spent: [] });
  }

  async function finish() {
    const l = liveRef.current; const lis = L.current; if (!l) return;
    lis.stop?.();
    const spent = [...l.spent]; spent[l.cue] = (spent[l.cue] || 0) + (Date.now() - l.cueStart) / 1000;
    setLive(null);
    const seconds = Math.round((Date.now() - l.start) / 1000);
    const transcript = lis.text ? lis.text() : '';
    const words = countWords(transcript); const fillers = countFillers(transcript);
    const metrics = { seconds, words, wpm: seconds ? Math.round((words / seconds) * 60) : 0, fillers, fpm: seconds ? Math.round((fillers / seconds) * 600) / 10 : 0, longestPause: Math.round(lis.longest || 0) };
    if (!lis.ok) { setErr("The phone couldn't listen (allow the microphone, use Chrome). Nothing was scored."); setMode(null); return; }
    if (words < 8) { setErr("Barely any speech was heard. Speak up and try again; that run wasn't scored."); setMode(null); return; }

    if (mode === 'thirty') {
      const pass = Math.abs(seconds - 30) <= 5 && fillers <= 1 && metrics.wpm >= 110 && metrics.wpm <= 175;
      setDrill({ kind: '30-second pitch', pass, metrics, lines: [`${seconds}s (aim 25-35)`, `${fillers} filler${fillers === 1 ? '' : 's'} (aim 0-1)`, `${metrics.wpm} wpm (aim 120-160)`] });
      saveRuns([{ at: new Date().toISOString(), mode: 'thirty', pass, ...metrics }, ...runs].slice(0, 20)); setMode(null); return;
    }
    if (mode === 'noscript') {
      const pass = metrics.longestPause <= 4 && metrics.fpm <= 3;
      setDrill({ kind: 'No-script run', pass, metrics, lines: [`Longest silence ${metrics.longestPause}s (aim ≤ 4)`, `${metrics.fpm} fillers / min (aim ≤ 3)`, `${fmt(seconds)} for ${deck.length} points`] });
      saveRuns([{ at: new Date().toISOString(), mode: 'noscript', pass, ...metrics }, ...runs].slice(0, 20)); setMode(null); return;
    }
    // Full run: honest score from the server.
    setMode(null); setBusy('score');
    const perCue = deck.map((c, i) => ({ title: c.title, say: c.say, seconds: c.seconds, spent: spent[i] || 0, heard: lis.segs.filter((x) => x.cue === i).map((x) => x.text).join(' ') }));
    try { localStorage.setItem(lastKey, JSON.stringify({ transcript, at: Date.now() })); } catch { /* private */ }
    try {
      const r = await ask('analyze', { audience, context, target, cues: perCue, transcript, metrics });
      setResult({ ...r, metrics, transcript });
      saveRuns([{ at: new Date().toISOString(), mode: 'full', score: r.score, parts: r.parts, tags: r.tags, ...metrics, target }, ...runs].slice(0, 20));
      setTimeout(() => document.getElementById(`pt-result-${storeKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) { setErr(e.message); }
    setBusy('');
  }

  // ── Q&A grill ──
  async function startGrill() {
    setErr(''); setBusy('grill');
    let transcript = result?.transcript;
    if (!transcript) { try { transcript = JSON.parse(localStorage.getItem(lastKey) || 'null')?.transcript; } catch { /* none */ } }
    const gaps = result ? [...result.comprehension.filter((c) => !c.answered).map((c) => c.q), ...result.fixes.map((f) => f.issue)] : [];
    try {
      const r = await ask('grill', { audience, context, transcript: transcript || [opener, oneLiner, ...cues.map((c) => c.say)].join(' '), gaps });
      if (!r.questions.length) throw new Error('No questions came back. Try again.');
      setGrill({ qs: r.questions, i: 0, phase: 'ask', grades: [] });
      say(r.questions[0]);
    } catch (e) { setErr(e.message); }
    setBusy('');
  }
  function say(text) { luxeSpeak(text); }
  function answerNow() {
    try { window.speechSynthesis.cancel(); } catch { /* none */ }
    L.current = makeListener(() => 0); L.current.onChange = () => tick((x) => x + 1); L.current.start?.();
    setGrill((g) => ({ ...g, phase: 'answer', start: Date.now() }));
  }
  async function doneAnswer() {
    const g = grill; const lis = L.current; lis?.stop?.();
    const seconds = (Date.now() - g.start) / 1000;
    setGrill({ ...g, phase: 'grading' });
    try {
      const r = await ask('grade', { question: g.qs[g.i], answer: lis?.text ? lis.text() : '', seconds, context });
      setGrill({ ...g, phase: 'graded', grades: [...g.grades, { q: g.qs[g.i], answer: lis?.text ? lis.text() : '', ...r }] });
    } catch (e) { setErr(e.message); setGrill({ ...g, phase: 'ask' }); }
  }
  function nextQ() {
    const g = grill;
    if (g.i + 1 >= g.qs.length) {
      const strong = g.grades.filter((x) => x.verdict === 'strong').length;
      saveRuns([{ at: new Date().toISOString(), mode: 'grill', strong, of: g.qs.length, tags: g.grades.some((x) => x.seconds > 50) ? ['rambling'] : [] }, ...runs].slice(0, 20));
      setGrill({ ...g, phase: 'done' }); return;
    }
    setGrill({ ...g, i: g.i + 1, phase: 'ask' }); say(g.qs[g.i + 1]);
  }
  useEffect(() => { if (grill?.phase === 'answer' && Date.now() - grill.start > 45000) doneAnswer(); }); // eslint-disable-line react-hooks/exhaustive-deps

  // ── progress ──
  const full = runs.filter((r) => r.mode === 'full');
  const recent = full.slice(0, 4);
  const counts = {}; recent.forEach((r) => (r.tags || []).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
  const recurring = Object.entries(counts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const suggested = recurring.map(([t]) => DRILL_FOR[t]).find(Boolean) || (result && result.tags.map((t) => DRILL_FOR[t]).find(Boolean));

  // ── live screens ──
  if (live) {
    const c = deck[live.cue] || deck[0];
    const el = (Date.now() - live.start) / 1000;
    const cueEl = (Date.now() - live.cueStart) / 1000;
    const txt = L.current?.text ? L.current.text() : '';
    const recentWords = (L.current?.segs || []).filter((x) => Date.now() - x.t < 20000).reduce((t, x) => t + countWords(x.text), 0) + countWords(L.current?.interim || '');
    const pace = el > 15 ? Math.round((recentWords / Math.min(20, el)) * 60) : null;
    const f = countFillers(txt);
    const silent = (Date.now() - (L.current?.last || Date.now())) / 1000;
    const total = mode === 'thirty' ? 30 : target;
    return (
      <div className="pt-full">
        <style>{CSS}</style>
        <div className="pt-top"><span className={el > total ? 'bad' : ''}>{fmt(el)} / {fmt(total)}</span><span>{live.cue + 1}/{deck.length}</span><span>{L.current?.ok ? '🎙' : '🔇 no mic'}</span></div>
        <div className="pt-bar"><div style={{ width: `${Math.min(100, (cueEl / c.seconds) * 100)}%` }} /></div>
        <div className="pt-meters">
          <span className={pace == null ? '' : pace > 175 ? 'bad' : pace < 105 ? 'warn' : 'ok'}>{pace == null ? 'Pace…' : pace > 175 ? `${pace} wpm · slow down` : pace < 105 ? `${pace} wpm · pick it up` : `${pace} wpm · good`}</span>
          <span className={f > 3 ? 'bad' : f ? 'warn' : 'ok'}>{f} filler{f === 1 ? '' : 's'}</span>
          {silent > 4 && el > 5 && <span className="bad">Silent {Math.round(silent)}s · say the next point</span>}
        </div>
        {live.cue === 0 && opener && mode === 'run' && <div className="pt-opener">“{opener}”</div>}
        <div className="pt-title">{c.title}</div>
        {mode !== 'noscript' && <div className="pt-say">{c.say}</div>}
        {mode === 'noscript' && <div className="pt-sub">No script: say this point in your own words.</div>}
        <div className="pt-heard">{txt.slice(-140)}</div>
        <div className="pt-actions">
          {deck.length > 1 && <button type="button" onClick={() => goCue(live.cue - 1)}>◀</button>}
          <button type="button" className="pt-stop" onClick={finish}>{mode === 'run' ? 'Finish & score' : 'Finish'}</button>
          {deck.length > 1 && <button type="button" onClick={() => goCue(live.cue + 1)}>▶</button>}
        </div>
      </div>
    );
  }
  if (grill && grill.phase !== 'done') {
    const q = grill.qs[grill.i];
    const g = grill.grades[grill.grades.length - 1];
    const left = grill.phase === 'answer' ? Math.max(0, 45 - (Date.now() - grill.start) / 1000) : 45;
    return (
      <div className="pt-full">
        <style>{CSS}</style>
        <div className="pt-top"><span>Question {grill.i + 1} of {grill.qs.length}</span><span>{grill.phase === 'answer' ? `${Math.ceil(left)}s` : ''}</span><button type="button" className="pt-x" onClick={() => { L.current?.stop?.(); setGrill(null); }}>✕</button></div>
        <div className="pt-q">“{q}”</div>
        {grill.phase === 'ask' && <><div className="pt-sub">Answer in your first sentence. One piece of evidence. Stop. (15-30 s)</div><button type="button" className="pt-stop" onClick={answerNow}>🎙 Answer now</button></>}
        {grill.phase === 'answer' && <><div className="pt-heard big">{L.current?.text?.() || 'Listening…'}</div><button type="button" className="pt-stop" onClick={doneAnswer}>Done</button></>}
        {grill.phase === 'grading' && <div className="pt-sub">Grading…</div>}
        {grill.phase === 'graded' && g && (
          <div className="pt-grade">
            <div className={`pt-verdict ${g.verdict}`}>{g.verdict === 'strong' ? 'Strong answer' : g.verdict === 'ok' ? 'OK, not convincing yet' : 'Weak answer'} · {g.seconds}s{g.direct ? '' : ' · didn’t answer first'}</div>
            <div className="pt-why">{g.why}</div>
            <div className="pt-kick">SAY IT LIKE THIS</div>
            <div className="pt-better">“{g.better}”</div>
            <button type="button" className="pt-stop" onClick={nextQ}>{grill.i + 1 >= grill.qs.length ? 'See summary' : 'Next question'}</button>
          </div>
        )}
        {err && <div className="pt-err">{err}</div>}
      </div>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <section className="card muse-card">
        <div className="muse-label">🎯 PITCH TRAINER</div>
        <div className="pt-intro">Scored on evidence, not encouragement. After each run, a {audience === 'investors' ? 'investor' : 'judge'} who heard only your words has to say what it is, who it’s for, why it matters, the proof, and the {audience === 'investors' ? 'ask' : 'reason to pick you'}. They only get credit for words you actually said. Time, pace, fillers and silences are measured, not guessed. First runs usually land 40-60.</div>
        <div className="pt-targets">{[[60, '1 min'], [120, '2 min'], [180, '3 min'], [300, '5 min']].map(([v, l]) => <button key={v} type="button" className={target === v ? 'on' : ''} onClick={() => setTarget(v)}>{l}</button>)}</div>
        <button type="button" className="btn-primary" style={{ width: '100%', marginTop: 10 }} disabled={!cues.length || !!busy} onClick={() => begin('run')}>{busy === 'score' ? 'Scoring your run…' : '▶ Full run (scored)'}</button>
        <div className="pt-row">
          <button type="button" className="btn-ghost" disabled={!!busy} onClick={startGrill}>{busy === 'grill' ? 'Preparing…' : '🔥 Q&A grill'}</button>
          <button type="button" className={`btn-ghost ${suggested === 'thirty' ? 'pt-sug' : ''}`} disabled={!!busy} onClick={() => begin('thirty')}>⏱ 30-second drill</button>
          <button type="button" className={`btn-ghost ${suggested === 'noscript' ? 'pt-sug' : ''}`} disabled={!!busy || cues.length < 2} onClick={() => begin('noscript')}>🧠 No-script drill</button>
        </div>
        {!cues.length && <div className="pt-note">Write or generate the pitch above first: the trainer uses its points as cues.</div>}
        {err && <div className="pt-err">{err}</div>}
        {full.length > 0 && (
          <div className="pt-progress">
            <div className="pt-spark">{full.slice(0, 8).reverse().map((r, i) => <div key={i} title={`${r.score}`}><i style={{ height: `${Math.max(6, r.score)}%`, background: color(r.score) }} /><small>{r.score}</small></div>)}</div>
            <div className="pt-pmeta">{full.length} scored run{full.length > 1 ? 's' : ''} · best {Math.max(...full.map((r) => r.score))} · last {full[0].wpm} wpm, {full[0].fpm} fillers/min{full[1] ? ` · ${full[0].score >= full[1].score ? '▲' : '▼'} ${Math.abs(full[0].score - full[1].score)} from the run before` : ''}</div>
            {recurring.length > 0 && <div className="pt-recur"><b>Keeps happening:</b> {recurring.map(([t, n]) => `${TAG[t] || t} (${n} of last ${recent.length})`).join(' · ')}</div>}
          </div>
        )}
      </section>

      {drill && (
        <section className="card muse-card">
          <div className="muse-label">{drill.kind.toUpperCase()}</div>
          <div className="pt-pass" style={{ color: drill.pass ? '#10B981' : '#EF4444' }}>{drill.pass ? '✓ Passed' : '✗ Not yet. Run it again.'}</div>
          <ul className="muse-how">{drill.lines.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      )}

      {grill?.phase === 'done' && (
        <section className="card muse-card">
          <div className="muse-label">Q&A GRILL · {grill.grades.filter((x) => x.verdict === 'strong').length} OF {grill.grades.length} STRONG</div>
          {grill.grades.map((g) => (
            <div key={g.q} className="pt-qa">
              <b>{g.q}</b>
              <div className={`pt-verdict ${g.verdict}`}>{g.verdict} · {g.seconds}s</div>
              <div className="pt-why">{g.why}</div>
              <div className="pt-better">→ {g.better}</div>
            </div>
          ))}
          <button type="button" className="muse-link" onClick={() => setGrill(null)}>Close</button>
        </section>
      )}

      {result && (
        <section className="card muse-card" id={`pt-result-${storeKey}`}>
          <div className="pt-score">
            <span style={{ color: color(result.score) }}>{result.score}</span>
            <div><div className="pt-head">{result.headline}</div><div className="pt-pmeta">{fmt(result.metrics.seconds)} of {fmt(target)} · {result.metrics.wpm} wpm · {result.metrics.fpm} fillers/min · longest silence {result.metrics.longestPause}s</div></div>
          </div>
          {[['understood', 'A listener understood'], ['landed', 'Your points landed'], ['delivery', 'Delivery']].map(([k, l]) => (
            <div key={k} className="pt-part"><span>{l}{result.weakest === k ? ' · weakest' : ''}</span><b>{result.parts[k]}</b><div><i style={{ width: `${result.parts[k]}%`, background: color(result.parts[k]) }} /></div></div>
          ))}
          {result.caps.map((c) => <div key={c.why} className="pt-cap">Capped at {c.max}: {c.why}</div>)}

          <div className="muse-label" style={{ marginTop: 14 }}>WHAT THEY COULD REPEAT BACK</div>
          {result.comprehension.map((c) => (
            <div key={c.key} className={`pt-comp ${c.answered ? 'ok' : 'no'}`}>
              <span>{c.answered ? '✓' : '✗'}</span>
              <div><b>{c.q}</b>{c.answered ? <small>“{c.quote}”</small> : <small>{c.unverified ? 'Claimed, but those words weren’t in what you said.' : 'Not clear from what you said.'}</small>}</div>
            </div>
          ))}

          <div className="muse-label" style={{ marginTop: 14 }}>YOUR POINTS</div>
          {result.points.map((p) => (
            <div key={p.title} className="pt-point">
              <span className={p.landed}>{p.landed === 'yes' ? 'Landed' : p.landed === 'partly' ? 'Partly' : 'Missed'}</span>
              <div><b>{p.title}</b> <small className={p.spent > p.planned * 1.4 ? 'bad' : ''}>{p.spent}s of {p.planned}s</small>{p.note && <small>{p.note}</small>}</div>
            </div>
          ))}

          {result.fixes.length > 0 && <div className="muse-label" style={{ marginTop: 14 }}>FIX THESE, IN THIS ORDER</div>}
          {result.fixes.map((f, i) => (
            <div key={f.issue} className="pt-fix">
              <b>{i + 1}. {f.issue}</b>
              {f.quote && <div className="pt-was">You said: “{f.quote}”</div>}
              <div className="pt-better">Say: “{f.rewrite}”</div>
            </div>
          ))}
          <div className="pt-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn-primary" onClick={() => begin('run')}>Run it again</button>
            <button type="button" className="btn-ghost" onClick={startGrill}>🔥 Grill me on the gaps</button>
          </div>
        </section>
      )}
    </>
  );
}

const CSS = `
.pt-intro{font-size:12.5px;color:var(--text-2);margin-top:6px;line-height:1.5}
.pt-targets{display:flex;gap:6px;margin-top:10px}
.pt-targets button{flex:1;padding:8px 0;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text-2);font:600 12.5px inherit;font-family:inherit;cursor:pointer}
.pt-targets button.on{border-color:#7B61FF;background:rgba(123,97,255,.15);color:var(--text-1,#fff)}
.pt-row{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
.pt-row>button{flex:1 1 120px}
.pt-sug{border-color:#F59E0B!important;color:#F59E0B!important}
.pt-note{font-size:12px;color:var(--text-3);margin-top:8px}
.pt-err{font-size:12.5px;color:#EF4444;margin-top:8px}
.pt-progress{margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
.pt-spark{display:flex;gap:6px;align-items:flex-end;height:60px}
.pt-spark>div{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:2px}
.pt-spark i{display:block;width:100%;border-radius:4px 4px 2px 2px;max-width:28px}
.pt-spark small{font-size:10px;color:var(--text-3)}
.pt-pmeta{font-size:11.5px;color:var(--text-3);margin-top:6px;line-height:1.4}
.pt-recur{font-size:12px;color:#F59E0B;margin-top:6px;line-height:1.45}
.pt-pass{font-size:18px;font-weight:800;margin:6px 0}
.pt-score{display:flex;gap:14px;align-items:center}
.pt-score>span{font-size:44px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.pt-head{font-size:14px;font-weight:600;line-height:1.35}
.pt-part{display:grid;grid-template-columns:1fr auto;gap:2px 8px;margin-top:10px;font-size:12.5px}
.pt-part b{font-variant-numeric:tabular-nums}
.pt-part>div{grid-column:1/-1;height:5px;border-radius:5px;background:var(--border);overflow:hidden}
.pt-part i{display:block;height:100%}
.pt-cap{margin-top:8px;font-size:12px;color:#EF4444;font-weight:600}
.pt-comp{display:flex;gap:10px;margin-top:8px;font-size:13px;line-height:1.4}
.pt-comp>span{font-weight:800;width:16px}
.pt-comp.ok>span{color:#10B981}.pt-comp.no>span{color:#EF4444}
.pt-comp small,.pt-point small{display:block;color:var(--text-3);font-size:12px}
.pt-point{display:flex;gap:10px;margin-top:8px;font-size:13px;align-items:flex-start}
.pt-point>span{flex:0 0 58px;text-align:center;font-size:11px;font-weight:700;padding:3px 0;border-radius:6px}
.pt-point>span.yes{color:#10B981;background:rgba(16,185,129,.12)}.pt-point>span.partly{color:#F59E0B;background:rgba(245,158,11,.12)}.pt-point>span.no{color:#EF4444;background:rgba(239,68,68,.12)}
.pt-point small.bad{color:#EF4444}
.pt-point>div>small{display:inline}
.pt-point>div>small+small{display:block}
.pt-fix{margin-top:10px;font-size:13px;line-height:1.45}
.pt-was{color:var(--text-3);font-size:12.5px;margin-top:3px}
.pt-better{color:#10B981;font-size:13px;margin-top:3px;line-height:1.45}
.pt-qa{margin-top:12px;font-size:13px;line-height:1.45}
.pt-verdict{font-size:12px;font-weight:700;margin-top:3px;text-transform:capitalize}
.pt-verdict.strong{color:#10B981}.pt-verdict.ok{color:#F59E0B}.pt-verdict.weak{color:#EF4444}
.pt-why{font-size:12.5px;color:var(--text-2);margin-top:2px}
.pt-full{position:fixed;inset:0;z-index:9000;background:radial-gradient(120% 90% at 50% 30%,#141a2e,#05060B);color:#F3F4F6;display:flex;flex-direction:column;align-items:center;padding:24px 20px calc(20px + env(safe-area-inset-bottom));text-align:center;overflow-y:auto}
.pt-top{display:flex;justify-content:space-between;align-items:center;width:100%;max-width:640px;font-size:13px;color:#9CA3AF;font-variant-numeric:tabular-nums}
.pt-top .bad{color:#EF4444;font-weight:700}
.pt-x{background:none;border:0;color:#9CA3AF;font-size:18px}
.pt-bar{width:100%;max-width:640px;height:4px;border-radius:4px;background:#ffffff1a;margin:10px 0 12px;overflow:hidden}
.pt-bar div{height:100%;background:linear-gradient(90deg,#7B61FF,#E9C77B);transition:width .3s linear}
.pt-meters{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:18px}
.pt-meters span{font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px;background:#ffffff12;color:#9CA3AF}
.pt-meters .ok{color:#10B981;background:rgba(16,185,129,.12)}.pt-meters .warn{color:#F59E0B;background:rgba(245,158,11,.12)}.pt-meters .bad{color:#EF4444;background:rgba(239,68,68,.14)}
.pt-opener{font-size:15px;color:#E9C77B;margin-bottom:16px;max-width:560px;font-style:italic}
.pt-title{font-size:32px;font-weight:800;max-width:640px;line-height:1.15}
.pt-say{font-size:20px;line-height:1.5;color:#D1D5DB;margin-top:14px;max-width:600px}
.pt-sub{font-size:14px;color:#9CA3AF;margin-top:14px;max-width:520px}
.pt-q{font-size:24px;font-weight:700;line-height:1.35;max-width:600px;margin-top:30px}
.pt-heard{font-size:12px;color:#6B7280;margin-top:auto;padding-top:20px;max-width:600px;min-height:18px}
.pt-heard.big{font-size:15px;color:#D1D5DB;margin-top:20px;min-height:60px}
.pt-actions{display:flex;gap:10px;margin-top:16px;width:100%;max-width:420px}
.pt-actions button{min-width:56px;padding:14px;border-radius:14px;border:1px solid #ffffff26;background:#ffffff0d;color:#F3F4F6;font-size:16px;font-family:inherit}
.pt-stop{flex:1;margin-top:16px;padding:14px 20px;border-radius:14px;border:0!important;background:linear-gradient(135deg,#7B61FF,#5B4BD6)!important;color:#fff!important;font-weight:700;font-size:15px;font-family:inherit;width:100%;max-width:420px}
.pt-grade{max-width:560px;margin-top:22px;text-align:left;width:100%}
.pt-grade .pt-verdict{font-size:15px}
.pt-kick{font-size:11px;letter-spacing:.12em;color:#9CA3AF;margin-top:14px}
.pt-grade .pt-better{font-size:15px}
`;
