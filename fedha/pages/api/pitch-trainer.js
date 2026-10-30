import { requireUser } from '../../lib/require-user';
import { nvidiaChat } from '../../lib/nvidia-client';

// Pitch trainer (startups and hackathons): honest scoring of a spoken pitch, a Q&A grill, and answer grading.
// The AI never gets the last word on its own:
//   - every "they understood X" must quote words that are really in the transcript (checked here), or it counts as missed
//   - delivery (time, pace, fillers, silences) is measured on the phone and scored here with fixed rules
//   - hard caps: no clear ask / next step, way over or under time -> the score can't pass a ceiling
// actions: analyze | grill | grade
const clip = (v, n) => String(v ?? '').slice(0, n);
const num = (v, lo, hi, d = 0) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : d));
const parseJSON = (t) => { const s = String(t || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}'); try { return a >= 0 ? JSON.parse(s.slice(a, b + 1)) : null; } catch { return null; } };
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// A quote counts if most of its words appear, in order-ish, in the transcript (speech-to-text is imperfect).
function quoted(quote, transcript) {
  const q = norm(quote).split(' ').filter((w) => w.length > 2);
  if (q.length < 2) return false;
  const t = ` ${norm(transcript)} `;
  const hits = q.filter((w) => t.includes(` ${w} `) || t.includes(` ${w}s `)).length;
  return hits / q.length >= 0.7;
}
const TAGS = ['no_ask', 'unclear_what', 'unclear_who', 'unclear_problem', 'no_proof', 'weak_opening', 'weak_close', 'jargon', 'too_long', 'too_short', 'too_fast', 'too_slow', 'fillers', 'long_pauses', 'missed_points', 'rambling', 'vague_numbers'];

const AUDIENCE = {
  judges: 'hackathon judges who have seen 40 projects today',
  investors: 'early-stage investors at a demo day who hear 20 pitches an hour',
};
const QUESTIONS = {
  judges: [['what', 'What does it do, in one sentence?'], ['who', 'Who is it for?'], ['problem', 'What problem does it solve and why does it matter?'], ['proof', 'What proof is there that it works (a demo moment, a result, a number)?'], ['ask', 'What is novel about it, or what do they want from the judges?']],
  investors: [['what', 'What does the company do, in one sentence?'], ['who', 'Who is the customer?'], ['problem', 'What painful problem does it solve and why now?'], ['proof', 'What traction or evidence is there (users, revenue, pilots, numbers)?'], ['ask', 'What is the ask (how much, for what) or the clear next step?']],
};

// Delivery from the phone's measurements, 0-100, plus issue tags.
function delivery(m, target) {
  const tags = [];
  let s = 100;
  const over = target ? (m.seconds - target) / target : 0;
  if (over > 0.1) { s -= Math.min(40, (over - 0.1) * 120); tags.push('too_long'); }
  if (over < -0.3) { s -= Math.min(30, (-over - 0.3) * 100); tags.push('too_short'); }
  if (m.wpm > 175) { s -= Math.min(25, (m.wpm - 175) * 0.8); tags.push('too_fast'); }
  if (m.wpm && m.wpm < 110) { s -= Math.min(25, (110 - m.wpm) * 0.8); tags.push('too_slow'); }
  if (m.fpm > 2) { s -= Math.min(30, (m.fpm - 2) * 6); tags.push('fillers'); }
  if (m.longestPause > 5) { s -= Math.min(15, (m.longestPause - 5) * 2); tags.push('long_pauses'); }
  return { score: Math.max(0, Math.round(s)), tags };
}

async function analyze(b) {
  const aud = b.audience === 'investors' ? 'investors' : 'judges';
  const cues = (Array.isArray(b.cues) ? b.cues : []).slice(0, 12).map((c) => ({ title: clip(c.title, 60), say: clip(c.say, 300), heard: clip(c.heard, 900), planned: num(c.seconds, 0, 600), spent: num(c.spent, 0, 1200) }));
  const transcript = clip(b.transcript, 6000);
  const m = { seconds: num(b.metrics?.seconds, 0, 3600), wpm: num(b.metrics?.wpm, 0, 400), fpm: num(b.metrics?.fpm, 0, 100), longestPause: num(b.metrics?.longestPause, 0, 600), fillers: num(b.metrics?.fillers, 0, 999) };
  const target = num(b.target, 0, 1800, 0);
  const qs = QUESTIONS[aud];
  const prompt = `You are one of the ${AUDIENCE[aud]}. You just heard the pitch below ONCE, through speech-to-text (expect small transcription errors). You are not a coach and you are not kind: judge only what was actually said out loud. Material that was planned but not said does not count.

Background (what they MEANT to get across; do not give credit for anything only found here):
${clip(b.context, 1500)}

Planned points, and what was heard while each was on screen:
${cues.map((c, i) => `${i + 1}. ${c.title} (planned ${c.planned}s, spent ${Math.round(c.spent)}s)\n   planned: ${c.say}\n   heard: "${c.heard || '(nothing)'}"`).join('\n')}

Full transcript: "${transcript}"

Tasks:
1. Comprehension test. Answer each question ONLY from the transcript, as a listener who heard it once. If the pitch did not make it clear, answered=false. When answered=true, "quote" must be the exact words from the transcript that told you (5-20 words).
${qs.map(([k, q]) => `   ${k}: ${q}`).join('\n')}
2. For each planned point: did it land? "yes" (said clearly), "partly" (mentioned but vague or buried), "no" (missing). Quote the words if any.
3. The 3 changes that would raise the score most, worst first. Each: the issue, an exact quote of what they said (or "" if the problem is something missing), a rewrite they can say instead (spoken style, short sentences, only facts from the background; [ADD: ...] where a fact is missing), and one tag from: ${TAGS.join(', ')}.
4. A blunt one-sentence headline (no praise padding).

JSON only: {"comprehension":[{"key":"what","answered":true,"answer":"what you understood","quote":"..."}],"points":[{"title":"...","landed":"yes|partly|no","quote":"...","note":"why, max 15 words"}],"fixes":[{"issue":"...","quote":"...","rewrite":"...","tag":"..."}],"headline":"..."}`;
  const j = parseJSON(await nvidiaChat({ prompt, system: 'You output only valid JSON. No markdown, no commentary. You are strict and evidence-based.', temperature: 0.2, maxTokens: 1600 })) || {};

  // Evidence check: an "answered" without a real quote from the transcript is a miss.
  const comp = qs.map(([k, q]) => {
    const a = (Array.isArray(j.comprehension) ? j.comprehension : []).find((x) => x?.key === k) || {};
    const ok = !!a.answered && quoted(a.quote, transcript);
    return { key: k, q, answered: ok, answer: ok ? clip(a.answer, 200) : '', quote: ok ? clip(a.quote, 200) : '', unverified: !!a.answered && !ok };
  });
  const points = cues.map((c) => {
    const p = (Array.isArray(j.points) ? j.points : []).find((x) => norm(x?.title) === norm(c.title)) || {};
    let landed = ['yes', 'partly', 'no'].includes(p.landed) ? p.landed : 'no';
    if (landed !== 'no' && p.quote && !quoted(p.quote, transcript)) landed = 'no';
    if (!c.heard) landed = 'no';
    return { title: c.title, landed, quote: landed === 'no' ? '' : clip(p.quote, 200), note: clip(p.note, 120), planned: c.planned, spent: Math.round(c.spent) };
  });
  const fixes = (Array.isArray(j.fixes) ? j.fixes : []).slice(0, 3).map((f) => ({ issue: clip(f.issue, 200), quote: f.quote && quoted(f.quote, transcript) ? clip(f.quote, 200) : '', rewrite: clip(f.rewrite, 400), tag: TAGS.includes(f.tag) ? f.tag : 'missed_points' }));

  const understood = Math.round((comp.filter((c) => c.answered).length / comp.length) * 100);
  const landedPct = points.length ? Math.round((points.reduce((t, p) => t + (p.landed === 'yes' ? 1 : p.landed === 'partly' ? 0.5 : 0), 0) / points.length) * 100) : understood;
  const del = delivery(m, target);
  let score = Math.round(understood * 0.4 + landedPct * 0.3 + del.score * 0.3);
  const caps = [];
  const cap = (max, why) => { if (score > max) { score = max; caps.push({ max, why }); } };
  if (!comp.find((c) => c.key === 'ask')?.answered) cap(60, aud === 'investors' ? 'No clear ask or next step' : 'No clear reason to pick you (what is new, or what you want)');
  if (!comp.find((c) => c.key === 'what')?.answered) cap(50, 'A listener could not say what it does');
  if (target && m.seconds > target * 1.25) cap(55, `Ran ${Math.round((m.seconds / target - 1) * 100)}% over time (judges cut you off)`);
  if (target && m.seconds < target * 0.5) cap(50, 'Under half the time: points were skipped');
  const tags = [...new Set([...del.tags, ...comp.filter((c) => !c.answered).map((c) => ({ what: 'unclear_what', who: 'unclear_who', problem: 'unclear_problem', proof: 'no_proof', ask: 'no_ask' }[c.key])), ...fixes.map((f) => f.tag), ...(points.some((p) => p.landed === 'no') ? ['missed_points'] : [])])];
  const weakest = [['understood', understood], ['landed', landedPct], ['delivery', del.score]].sort((a, b) => a[1] - b[1])[0][0];
  return { score, parts: { understood, landed: landedPct, delivery: del.score }, caps, comprehension: comp, points, fixes, headline: clip(j.headline, 200), tags, weakest };
}

async function grill(b) {
  const aud = b.audience === 'investors' ? 'investors' : 'judges';
  const prompt = `You are one of the ${AUDIENCE[aud]}. You heard this pitch: "${clip(b.transcript, 3000)}"
Background: ${clip(b.context, 1200)}
Weak spots found: ${(Array.isArray(b.gaps) ? b.gaps : []).slice(0, 6).map((x) => clip(x, 120)).join('; ') || 'none listed'}
Ask the 3 hardest questions you would really ask in the room, aimed at the weak spots (missing proof, unclear customer, competition, why them, money / feasibility). One sentence each, direct, the way a real ${aud === 'investors' ? 'investor' : 'judge'} talks. No compliments.
JSON only: {"questions":["...","...","..."]}`;
  const j = parseJSON(await nvidiaChat({ prompt, system: 'You output only valid JSON.', temperature: 0.5, maxTokens: 400 })) || {};
  return { questions: (Array.isArray(j.questions) ? j.questions : []).slice(0, 3).map((q) => clip(q, 220)).filter(Boolean) };
}

async function grade(b) {
  const answer = clip(b.answer, 2500);
  const secs = num(b.seconds, 0, 600);
  const prompt = `A founder/builder was asked, live: "${clip(b.question, 300)}"
They answered (speech-to-text, ${Math.round(secs)} s): "${answer || '(silence)'}"
Background facts you may use: ${clip(b.context, 1200)}
Grade it like the person who asked. Strong answers answer in the FIRST sentence, then give one piece of evidence, then stop (15-30 s).
JSON only: {"direct":true,"first_sentence":"their first sentence","verdict":"strong|ok|weak","why":"max 20 words, specific","better":"a stronger spoken answer, 2-3 short sentences, only facts from the background, [ADD: ...] where a fact is missing"}`;
  const j = parseJSON(await nvidiaChat({ prompt, system: 'You output only valid JSON. Strict, specific, no praise padding.', temperature: 0.2, maxTokens: 500 })) || {};
  let verdict = ['strong', 'ok', 'weak'].includes(j.verdict) ? j.verdict : 'weak';
  const notes = [];
  if (!answer || answer.split(/\s+/).length < 6) { verdict = 'weak'; notes.push('Too short to answer it'); }
  if (secs > 50) { if (verdict === 'strong') verdict = 'ok'; notes.push(`${Math.round(secs)} s is long: aim for 15-30 s`); }
  if (j.direct === false && verdict === 'strong') verdict = 'ok';
  return { verdict, direct: j.direct !== false, why: [clip(j.why, 160), ...notes].filter(Boolean).join('. '), better: clip(j.better, 500), seconds: Math.round(secs) };
}

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const b = req.body || {};
  try {
    if (b.action === 'analyze') return res.status(200).json(await analyze(b));
    if (b.action === 'grill') return res.status(200).json(await grill(b));
    if (b.action === 'grade') return res.status(200).json(await grade(b));
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(502).json({ error: 'The coach is busy right now. Try again in a minute.' });
  }
}
