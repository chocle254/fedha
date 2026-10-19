// pages/api/hack-coach.js — the Hackathon Coach's mentor (see
// pages/hackathon/[id].js). Same Groq chat model as pages/api/ai.js; the
// brief step also runs real web searches (lib/web-search.js) so the
// mentor's research is grounded in what is actually published about the
// hackathon, never invented.
import { requireUser } from '../../lib/require-user';
import { webSearchMulti } from '../../lib/web-search';
import { weightedOverall } from '../../lib/hack-coach';

// Criteria weights are real only when every criterion has one and they add up to about 100.
function validWeights(crit) {
  const w = (crit || []).map((c) => Number(c.weight) || 0);
  const sum = w.reduce((a, x) => a + x, 0);
  return w.length > 0 && w.every((x) => x > 0) && sum >= 90 && sum <= 110;
}

export const config = { maxDuration: 60 };

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
// Judging is the hardest reasoning job here, so it always uses the larger model.
const JUDGE_MODEL = process.env.GROQ_JUDGE_MODEL || 'openai/gpt-oss-120b';
const TYPES = new Set(['hack_brief', 'hack_app', 'hack_ideas', 'hack_chat', 'hack_plan', 'hack_scope', 'hack_judge', 'hack_submission']);
const clip = (v, n) => String(v ?? '').slice(0, n);
const list = (v, n, len = 300) => (Array.isArray(v) ? v : []).filter((x) => x != null && String(x).trim()).slice(0, n).map((x) => clip(x, len));
const num = (v, lo, hi, d = 0) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : d));

const BUILDER = 'The builder usually works solo with little money and a modest laptop, so builds must use free tiers and be finishable by one person. They compete in international hackathons: aim at the hackathon\'s own audience and the global problem space, not at the builder\'s home country, unless the hackathon itself is regional.';

// How submissions must read: like the builder wrote them on a tired night,
// not like a press release.
const HUMAN = `Write like the builder talking about their own project to another developer:
- First person ("I" if solo, "we" if a team is mentioned). Plain words, contractions, varied sentence length.
- Concrete details from the project: real features, real tools, real problems hit. One specific detail beats three adjectives.
- Never use: revolutionize, seamless, leverage, cutting-edge, game-changer, empower, robust, harness, delve, unlock, elevate, in today's fast-paced world, transformative, innovative solution, "not just X but Y". No emoji. Avoid em dashes.
- Be honest about what is not finished. Never invent users, numbers, awards, team members or features. Where a fact is missing write [ADD: what is needed].`;

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set in environment variables' });

  const b = req.body || {};
  if (!TYPES.has(b.type)) return res.status(400).json({ error: 'Unknown request type' });
  if (!b.hack) return res.status(400).json({ error: 'Hackathon data required' });

  try {
    if (b.type === 'hack_brief') return res.status(200).json(await brief(b, GROQ_API_KEY));
    if (b.type === 'hack_chat' && !String(b.question || '').trim()) return res.status(400).json({ error: 'Question required' });
    if (b.type === 'hack_ideas') b.found = await ideaResearch(b);
    let obj;
    try {
      obj = await groqJSON(GROQ_API_KEY, prompts[b.type](b), b.type === 'hack_submission' ? 0.75 : b.type === 'hack_judge' ? 0.3 : 0.6, 6000, b.type === 'hack_judge' ? JUDGE_MODEL : GROQ_MODEL);
    } catch (e) {
      // Groq's free tier caps tokens per request/minute. If the code
      // evidence made the prompt too big, try once more with less of it.
      const tooBig = e.status === 413 || /too large|reduce|tokens per minute/i.test(e.message || '');
      const ev = b.hack?.coach?.app?.evidence;
      if (!tooBig || !ev) throw e;
      ev.sources = (ev.sources || []).slice(0, 4).map((f) => ({ ...f, text: String(f.text || '').slice(0, 600), outline: (f.outline || []).slice(0, 20), truncated: true }));
      ev.readme = String(ev.readme || '').slice(0, 2000);
      ev.files = (ev.files || []).slice(0, 80);
      ev.deps = (ev.deps || []).slice(0, 1);
      if (b.hack.coach.presentation?.text) b.hack.coach.presentation.text = String(b.hack.coach.presentation.text).slice(0, 2500);
      obj = await groqJSON(GROQ_API_KEY, prompts[b.type](b), 0.6, 3000, b.type === 'hack_judge' ? JUDGE_MODEL : GROQ_MODEL);
    }
    const out = shape[b.type](obj, b);
    if (out.error) return res.status(500).json(out);
    return res.status(200).json(out);
  } catch (e) {
    console.error('[fedha] hack-coach', b.type, 'failed:', e.status, e.message);
    return res.status(500).json({ error: e.status === 429 ? 'The AI is rate limited right now. Try again in a minute.' : 'The mentor could not answer right now. Try again in a moment.' });
  }
}

async function groqJSON(key, prompt, temperature = 0.6, maxTokens = 6000, model = GROQ_MODEL) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You output only valid JSON. No markdown, no commentary.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error?.message || 'Groq API error'); e.status = r.status; throw e; }
  const raw = data.choices?.[0]?.message?.content || '';
  return parseObject(raw);
}

function parseObject(raw) {
  const clean = String(raw || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try { return JSON.parse(clean); } catch {}
  const s = clean.indexOf('{'); const e = clean.lastIndexOf('}');
  if (s === -1 || e <= s) return null;
  try { return JSON.parse(clean.slice(s, e + 1)); } catch { return null; }
}

// ── Context every prompt shares ──
function ctx(hack) {
  const c = hack.coach || {};
  const br = c.brief || {};
  const lines = [
    `Hackathon: ${hack.name || br.name || '(unnamed)'}${hack.organizer || br.organizer ? ` by ${hack.organizer || br.organizer}` : ''}`,
    hack.hours_left != null ? `Time left until the deadline: ${Math.round(hack.hours_left)} hours (${hack.hours_left <= 0 ? 'deadline passed' : `${(hack.hours_left / 24).toFixed(1)} days`}).` : 'Deadline: unknown.',
    c.hours_per_day ? `Builder can work about ${c.hours_per_day} hours a day.` : '',
    br.summary ? `What it is: ${clip(br.summary, 600)}` : '',
    br.tracks?.length ? `Tracks / prizes:\n${br.tracks.map((t) => `  - ${t.name}${t.prize ? ` (${t.prize})` : ''}: ${clip(t.description, 250)}`).join('\n')}` : (hack.themes ? `Themes: ${hack.themes}` : ''),
    br.requirements?.length ? `Hard requirements:\n${br.requirements.map((r) => `  - ${clip(r, 250)}`).join('\n')}` : '',
    br.criteria?.length ? `Judging criteria:\n${br.criteria.map((k) => `  - ${k.name}${k.weight ? ` (${k.weight}%)` : ''}: ${clip(k.description, 200)}`).join('\n')}` : '',
    br.sponsor_tech?.length ? `Sponsor tools/APIs that may earn extra prizes: ${br.sponsor_tech.join(', ')}` : '',
    c.research?.insights?.length ? `Mentor's research on this hackathon:\n${c.research.insights.map((x) => `  - ${clip(x, 300)}`).join('\n')}` : '',
    c.research?.winning_pattern ? `What past winners had in common: ${clip(c.research.winning_pattern, 400)}` : '',
    c.idea ? `Chosen idea: ${c.idea.title} — ${clip(c.idea.pitch, 500)}${c.idea.track ? ` (track: ${c.idea.track})` : ''}\n  Core features: ${(c.idea.features || []).join('; ')}${c.idea.twists?.length ? `\n  Twists added: ${c.idea.twists.join('; ')}` : ''}` : 'No idea chosen yet.',
    appLines(c.app),
    hack.project_name ? `Project name: ${hack.project_name}` : '',
    hack.repo_url ? `Repo: ${hack.repo_url}` : '',
    hack.tasks?.length ? `Build plan (x = done):\n${hack.tasks.map((t) => `  [${t.done ? 'x' : ' '}] ${t.due || ''} ${clip(t.text, 120)}${t.minutes ? ` (${t.minutes}m)` : ''}`).join('\n')}` : '',
    hack.minutes_logged ? `Time logged so far: ${Math.round(hack.minutes_logged / 6) / 10} hours.` : '',
    c.log?.length ? `Progress log (newest first):\n${c.log.map((l) => `  ${l.date}: ${clip(l.text, 200)}${l.minutes ? ` (${l.minutes}m)` : ''}`).join('\n')}` : '',
    c.notes ? `Builder's own notes about the project: ${clip(c.notes, 1500)}` : '',
    c.last_judging ? `Last mock judging: ${c.last_judging.overall}/100 — fixes suggested: ${(c.last_judging.fixes || []).join(' | ')}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

// Before suggesting ideas: real problems in the hackathon's space, and what
// the sponsor's platform can do that most entrants never try. Fail-soft.
async function ideaResearch(b) {
  const h = b.hack || {};
  const br = h.coach?.brief || {};
  const theme = [br.summary, (br.tracks || []).map((t) => t.name).join(', '), h.themes].filter(Boolean).join(' ').slice(0, 160) || h.name || '';
  const host = br.organizer || h.organizer || '';
  const tech = (br.sponsor_tech || []).slice(0, 2).join(' ');
  if (!theme) return null;
  const queries = [
    `biggest unsolved problems ${theme} 2026`,
    `${theme} problem statistics report 2026`,
    host || tech ? `${tech || host} API platform capabilities advanced features developers rarely use` : `${theme} emerging technology breakthroughs 2026`,
    `${h.name || br.name || theme} hackathon winning projects`,
  ];
  try {
    const r = await webSearchMulti(queries, { limitEach: 5 });
    return r.text.slice(0, 9000);
  } catch (e) {
    console.warn('[fedha] hack-coach idea research failed:', e.message);
    return null;
  }
}

// Build dates worked out on the device from GitHub (lib/hack-coach.js
// timelineOf). These are facts; the AI must not contradict them.
function timelineFact(t) {
  if (!t || t.verdict === 'no_repo') return '';
  const where = t.folder ? `the project folder ${t.folder}/` : "the repo";
  if (t.verdict === 'during') return `BUILD TIMELINE (verified from GitHub, treat as fact): the hackathon opened ${t.start}; the first commit to ${where} was ${t.first_commit} (${t.commit_count} commits). All of this work was made DURING the hackathon, so any "new work only" / "built during the event" rule is MET. Do NOT call it pre-existing, and do not use repo or folder creation dates to argue otherwise.`;
  if (t.verdict === 'before') return `BUILD TIMELINE (verified from GitHub, treat as fact): the hackathon opened ${t.start}; the first commit to ${where} was ${t.first_commit}, ${t.days_before} days earlier (${t.commit_count} commits). Work before ${t.start} is pre-existing.`;
  if (t.verdict === 'no_start') return `BUILD TIMELINE: the hackathon start date is unknown; the repo's first commit was ${t.first_commit || 'unknown'}. Do not assume the work is pre-existing; tell the builder to confirm the start date.`;
  return 'BUILD TIMELINE: unknown. Do not assume the work is pre-existing.';
}

// What the judges actually look at: README, the file list and excerpts of
// the main source files (fetched on the device, lib/hack-coach.js).
function evidenceText(hack) {
  const ev = hack.coach?.app?.evidence;
  if (!ev) return hack.coach?.app ? 'CODE: the builder connected an app but no files could be read.' : 'CODE: no repo connected; judge the code only from what the presentation and write-up say.';
  return [
    `CODE EVIDENCE${hack.coach.app.repo?.folder ? ` (project folder ${hack.coach.app.repo.folder}/)` : ''}:`,
    ev.readme ? `README:\n${clip(ev.readme, 5000)}` : 'README: none',
    ev.files?.length ? `Files (${ev.files.length} shown):\n${ev.files.join('\n')}` : '',
    ev.deps?.length ? `Dependencies:\n${ev.deps.map((d) => `${d.path}: ${clip(d.text, 600)}`).join('\n')}` : '',
    ...(ev.sources || []).map((f) => `--- ${f.path}${f.size ? ` (${Math.round(f.size / 100) / 10} KB)` : ''} ---\n${clip(f.text, 1800)}${f.outline?.length ? `\n[outline of the whole file]\n${f.outline.join('\n').slice(0, 2200)}` : ''}`),
  ].filter(Boolean).join('\n\n');
}

// The app the builder already made, as the mentor sees it on every request.
function appLines(app) {
  if (!app) return '';
  const a = app.analysis || {};
  const r = app.repo;
  return [
    `EXISTING APP the builder connected: ${app.name || r?.full_name || 'their app'}${app.live_url ? ` (live: ${app.live_url})` : ''}${r ? ` — repo ${r.full_name}, ${r.file_count || '?'} files, ${(r.languages || []).join(', ')}` : ''}`,
    a.what_it_does ? `  What it does: ${clip(a.what_it_does, 500)}` : '',
    a.features?.length ? `  Already built: ${a.features.join('; ')}` : '',
    a.fit ? `  Fit with this hackathon: ${a.fit} — ${clip(a.fit_note, 300)}` : '',
    a.gaps?.length ? `  Gaps for this hackathon: ${a.gaps.join('; ')}` : '',
    app.timeline ? `  ${timelineFact(app.timeline)}` : '',
    a.new_code_risk && app.timeline?.verdict !== 'during' ? `  Eligibility warning: ${clip(a.new_code_risk, 300)}` : '',
    r?.commits?.length ? `  Recent commits (newest first): ${r.commits.slice(0, 8).map((c) => `${String(c.date || '').slice(0, 10)} ${c.message}`).join(' | ')}` : '',
    app.linked?.text ? `  From the builder's Fedha ${app.linked.kind}: ${clip(app.linked.text, 900)}` : '',
  ].filter(Boolean).join('\n');
}

// ── Brief: read the paste, research the hackathon, break it down ──
async function brief(b, key) {
  const raw = clip(b.hack?.coach?.raw || b.raw, 12000);
  if (!raw.trim() && !b.hack?.name) return { error: 'Paste the hackathon details first.' };
  const parsed = await groqJSON(key, `Read these hackathon details and extract the facts a participant needs. Use ONLY what the text says; leave a field empty or [] if it is not stated. Do not guess dates or prizes.

Known so far: name "${clip(b.hack.name, 120)}", organizer "${clip(b.hack.organizer, 120)}", page ${clip(b.hack.url, 200) || 'unknown'}, today is ${new Date().toISOString().slice(0, 10)}.

HACKATHON DETAILS:
"""
${raw}
"""

Return JSON: {"name":"","organizer":"","start_date":"YYYY-MM-DD when the hackathon or its submission period opened, else empty","deadline":"YYYY-MM-DD or YYYY-MM-DDTHH:MM if a time is given, else empty","timezone":"","mode":"online|in-person|hybrid|","summary":"2 sentences: what it is and what they want built","tracks":[{"name":"","prize":"","description":""}],"prize_total":"","requirements":["every hard rule a submission must meet, e.g. must use X API, video under 3 minutes, public repo, new code only, team size"],"criteria":[{"name":"","weight":0,"description":"what the judges look for"}],"submission_fields":[{"name":"","hint":"","limit":0}],"sponsor_tech":["sponsor tools/APIs mentioned"],"key_dates":["date: what happens"],"judges":["judge names or roles if listed"],"unclear":["important things the details do not say that the builder should check"]}
weight = percentage if stated, else 0. submission_fields = the fields/questions the submission form asks for, if listed.`, 0.2);
  if (!parsed) return { error: 'Could not read those details. Try pasting the rules and judging section again.' };

  const name = clip(parsed.name || b.hack.name, 120);
  const org = clip(parsed.organizer || b.hack.organizer, 120);
  let found = null;
  if (name) {
    try {
      found = await webSearchMulti([
        `${name} ${org} hackathon judging criteria rules`,
        `${name} hackathon winners winning projects`,
        `${org || name} hackathon tips what judges look for`,
      ], { limitEach: 5 });
    } catch (e) {
      console.warn('[fedha] hack-coach research search failed:', e.message);
    }
  }

  const research = await groqJSON(key, `You are an experienced hackathon mentor who has judged and won many hackathons (Devpost, Devfolio, MLH, ETHGlobal, African hackathons). Research this hackathon and tell the builder what actually wins it.

${BUILDER}

THE BRIEF:
${JSON.stringify(parsed).slice(0, 7000)}

${found ? `WEB SEARCH RESULTS (only use what is relevant to THIS hackathon; results about other events are context at most):\n${found.text.slice(0, 9000)}` : 'No web results were available. Rely on the brief and general hackathon experience, and say so.'}

Return JSON: {"insights":["5-7 specific, practical insights about winning THIS hackathon: what the organizer and sponsors care about, how the criteria are likely applied, which track is least crowded, what to show in the demo"],"winning_pattern":"what past winners of this or similar hackathons had in common, or empty if unknown","sponsor_angles":["how to use sponsor tools to also qualify for sponsor prizes"],"pitfalls":["common ways entries lose or get disqualified here"],"sources":["urls you actually used"],"confidence":"high|medium|low"}
Never claim something about this hackathon that is not in the brief or the search results; general advice is fine but must not be presented as a fact about this event.`, 0.4);

  const crit = (parsed.criteria || []).filter((k) => k && k.name).slice(0, 10).map((k) => ({ name: clip(k.name, 80), weight: num(k.weight, 0, 100), description: clip(k.description, 300) }));
  return {
    brief: {
      name, organizer: org,
      start_date: /^\d{4}-\d{2}-\d{2}/.test(String(parsed.start_date || '')) ? String(parsed.start_date).slice(0, 10) : '',
      deadline: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(String(parsed.deadline || '')) ? parsed.deadline : '',
      timezone: clip(parsed.timezone, 40), mode: clip(parsed.mode, 20), summary: clip(parsed.summary, 600),
      tracks: (parsed.tracks || []).filter((t) => t && t.name).slice(0, 12).map((t) => ({ name: clip(t.name, 100), prize: clip(t.prize, 100), description: clip(t.description, 400) })),
      prize_total: clip(parsed.prize_total, 100),
      requirements: list(parsed.requirements, 15),
      criteria: crit,
      submission_fields: (parsed.submission_fields || []).filter((f) => f && f.name).slice(0, 15).map((f) => ({ name: clip(f.name, 80), hint: clip(f.hint, 200), limit: num(f.limit, 0, 20000) || null })),
      sponsor_tech: list(parsed.sponsor_tech, 12, 80),
      key_dates: list(parsed.key_dates, 10, 160),
      judges: list(parsed.judges, 10, 120),
      unclear: list(parsed.unclear, 6, 200),
    },
    research: {
      insights: list(research?.insights, 8, 400),
      winning_pattern: clip(research?.winning_pattern, 600),
      sponsor_angles: list(research?.sponsor_angles, 6),
      pitfalls: list(research?.pitfalls, 6),
      sources: list(research?.sources, 8, 300).filter((u) => /^https?:\/\//.test(u)),
      confidence: ['high', 'medium', 'low'].includes(research?.confidence) ? research.confidence : (found ? 'medium' : 'low'),
      searched: !!found,
    },
  };
}

const prompts = {
  hack_app(b) {
    const app = b.hack.coach?.app || {};
    const r = app.repo;
    const facts = [
      app.name ? `Name: ${app.name}` : '',
      app.live_url ? `Live link: ${app.live_url}` : '',
      app.linked?.text ? `What the builder wrote about it in Fedha (${app.linked.kind}):\n${clip(app.linked.text, 5000)}` : '',
      r ? `GitHub repo ${r.full_name}: ${r.description || ''}${r.homepage ? ` (homepage ${r.homepage})` : ''}\nCreated ${String(r.created_at || '').slice(0, 10)}, last push ${String(r.pushed_at || '').slice(0, 10)}. Languages: ${(r.languages || []).join(', ')}. Topics: ${(r.topics || []).join(', ')}` : '',
      r?.readme ? `README:\n${clip(r.readme, 7000)}` : '',
      r?.deps?.length ? `Dependencies:\n${r.deps.map((d) => `${d.path}:\n${clip(d.text, 1200)}`).join('\n')}` : '',
      r?.files?.length ? `Files (${r.file_count} total, first ${r.files.length}):\n${r.files.join('\n')}` : '',
      r?.commits?.length ? `Recent commits:\n${r.commits.map((c) => `${String(c.date || '').slice(0, 10)} ${c.message}`).join('\n')}` : '',
      ...(app.evidence?.sources || []).map((f) => `--- ${f.path} ---\n${clip(f.text, 1500)}${f.outline?.length ? `\n[outline]\n${f.outline.join('\n').slice(0, 1500)}` : ''}`),
      timelineFact(app.timeline),
    ].filter(Boolean).join('\n\n');
    return `You are a hackathon mentor. The builder wants to enter THIS hackathon with an app they have already started or built. Read what the app really is from the evidence below, and judge how to take it into this hackathon.

THE HACKATHON:
${ctx({ ...b.hack, coach: { ...b.hack.coach, app: null, idea: null } })}

THE APP:
${facts || '(no details)'}

${BUILDER}

Return JSON: {"name":"","what_it_does":"2 sentences","features":["features that clearly exist, from the README, files and commits"],"stack":["main tools"],"maturity":"idea|prototype|working_mvp|production","fit":"strong|partial|weak","fit_note":"one sentence on how well it matches the theme, tracks and criteria","track":"best track to enter","requirements":[{"rule":"","status":"met|missing|unclear","note":""}],"new_code_risk":"ONLY if the BUILD TIMELINE says work started before the hackathon AND the rules require new work: say what that means (e.g. only new features count, disclose prior work). If the timeline says it was built during the hackathon, or the rules allow existing projects, this MUST be empty","gaps":["what this hackathon wants that the app lacks"],"upgrades":[{"title":"a hackathon-specific feature or twist to build on top","why":"which criterion it lifts","hours":0}],"demo_path":["3-5 steps of the demo the judges should see"],"idea":{"title":"","pitch":"2 sentences framing the app for this hackathon","features":["3-4 things that must work in the demo, existing or new"],"track":""}}
Rules: never claim a feature exists unless the evidence shows it. requirements = every hard requirement from the brief. upgrades: 3-4, each under 6 hours. Be honest if the app is a poor fit.`;
  },

  hack_ideas(b) {
    const own = clip(b.own_idea, 1500).trim();
    const mix = { bold: '4 bold ideas', wild: '4 wild ideas', mix: '1 safe, 2 bold and 1 wild idea' }[b.ambition] || '1 safe, 2 bold and 1 wild idea';
    return `You are a hackathon mentor who has judged and won many international hackathons. ${own ? "Stress-test the builder's own idea against this hackathon and push it to its most impressive version." : `Suggest ${mix} built to win THIS hackathon.`}

${ctx(b.hack)}

${BUILDER}

${b.found ? `RESEARCH (real problems in this space and what the host's/sponsors' platforms can do — ground ideas in it):\n${b.found}\n` : 'No web research was available: rely on what you know, and do not invent statistics.\n'}
WHAT MAKES AN IDEA HERE:
- Start from a real, painful problem people have worldwide in this hackathon's theme. Who has it, and how big is it? Cite the research when it gives a number, never invent one.
- The "wow": the hackathon's host or sponsor should watch the demo and think "I didn't know our platform could do that". Use their API/product in an unexpected, ambitious way: chain it with other tools, point it at a problem they never marketed it for, or make it do something live and visible.
- Ambition levels: "safe" = clearly finishable and solid; "bold" = an ambitious idea with a demo slice one person can finish; "wild" = sounds almost impossible, but a narrow, real, working slice of it can be shown in the demo (no faked results).
- Every idea still needs a demo slice that one person can build in the time left. Scope the slice, not the dream.
- Avoid the ideas every other team will submit (generic chatbot, to-do app, "AI summarizer") unless you twist them into something no one expects.

${own ? 'Return JSON: {"ideas":[ONE idea object: the builder\'s idea, sharpened and made bolder, still theirs]}' : 'Return JSON: {"ideas":[idea objects, each aimed at a different track, problem or angle]}'}
Idea object: {"title":"short memorable name","ambition":"safe|bold|wild","problem":"the real-world problem and who has it, one or two sentences, with a figure only if the research gives one","source":"url from the research backing the problem, or empty","pitch":"2 sentences: what it does","wow":"the demo moment that makes the host say 'our platform can do THAT?'","track":"which track/prize it targets","why_wins":"how it scores on the judging criteria, one or two sentences","features":["3-4 things that MUST work in the demo slice"],"cut":["tempting parts to NOT build"],"twists":[{"twist":"an add-on that would surprise the judges","why":"which criterion it lifts","hours":0}],"sponsor_use":"exactly how it uses the host/sponsor tools, or empty","risk":"the biggest way this could fail in the time left","hours":0,"fit":"fits|tight|too_big"}
Rules: every idea must meet every hard requirement. hours = realistic build hours for the demo slice for this solo builder; fit compares that with the working time left. Twists: 2-3, under 4 hours each: a live demo moment, a surprising sponsor-API use, real users tested, a striking visual, a measurable result.${own ? ' If the idea does not fit the hackathon or is too big, say so plainly in risk and set fit honestly.' : ''}`;
  },

  hack_chat(b) {
    const past = (Array.isArray(b.history) ? b.history : []).slice(-8).map((m) => `${m.role === 'user' ? 'Builder' : 'Mentor'}: ${clip(m.text, 600)}`).join('\n');
    return `You are this builder's hackathon mentor. You have researched the hackathon below and you keep them on track: you stop them overbuilding and overthinking, keep them aimed at the judging criteria and requirements, and watch the clock.

${ctx(b.hack)}

${BUILDER}

${past ? `Conversation so far:\n${past}\n\n` : ''}Builder: ${clip(b.question, 1500)}

Reply as the mentor: specific to this hackathon and project, honest and direct. If they are adding scope they cannot finish, polishing too early, or stuck deciding, say so and give the decision. Tie advice to the judging criteria and the time left. Plain text, no headings, at most 150 words; up to 4 short lines starting with "• " for steps.
Return JSON: {"reply":"..."}`;
  },

  hack_plan(b) {
    const hours = num(b.hours_per_day, 1, 16, 4);
    const left = b.hack.hours_left;
    const days = left != null ? Math.max(1, Math.ceil(left / 24)) : 7;
    return `You are a hackathon mentor. Make a timed build plan for the chosen idea that FITS the time left. Overbuilding is the most common way solo builders lose.

${ctx(b.hack)}

${BUILDER}
The builder will work about ${hours} hours a day, for ${days} day(s) until the deadline${left != null ? ` (about ${Math.round(left)} hours away)` : ''}. Total working time ≈ ${Math.round(Math.min(days * hours, left != null ? Math.max(1, left) : days * hours))} hours. Today is day 0.

Return JSON: {"tasks":[{"day":0,"title":"...","how":["..."],"minutes":60,"phase":"setup|core|demo|polish|submit"}],"cut":["features you are deliberately leaving out and why, in a few words"],"must_haves":["what must exist at submission: e.g. working demo path, 2-min video, README with setup, deployed link"],"note":"one honest sentence about whether this is achievable"}
Rules:
- 6 to 14 tasks in order. Total minutes must be at most 80% of the working time, leaving a buffer.
- Core features first, then a working end-to-end demo path, then polish. The final 15-20% of the time goes to the demo video, README, screenshots and the submission write-up — never skip these.
- Skip tasks already done in the plan or log. Each "how": 2-4 concrete steps (what to build, which library, what to test).
- day must be between 0 and ${days - 1}; each day's minutes must fit in ${Math.round(hours * 60)}.`;
  },

  hack_scope(b) {
    return `You are a hackathon mentor doing a scope check. The builder says what they are working on or planning to add. Decide if they are overbuilding, overthinking or on track, given the time left and the judging criteria.

${ctx(b.hack)}

${BUILDER}

BUILDER SAYS: ${clip(b.question, 1500) || '(nothing — judge the current plan)'}

Return JSON: {"verdict":"on_track|overbuilding|overthinking|underbuilding","headline":"one direct sentence","keep":["what to keep doing"],"cut":["what to drop or postpone, specifically"],"do_next":["the next 1-3 actions, in order"],"time_check":"one sentence comparing remaining work with the time left"}`;
  },

  hack_judge(b) {
    const br = b.hack.coach?.brief || {};
    const crit = br.criteria || [];
    const realWeights = validWeights(crit);
    const criteria = crit.length ? crit.map((k) => `${k.name}${realWeights ? ` (${k.weight}%)` : ''}`).join(', ') : 'Innovation / originality, Technical difficulty & execution, Impact / usefulness, Design & user experience, Presentation & demo, Fit with theme';
    const verified = clip(b.hack.coach?.facts || b.hack.coach?.app?.verified, 3000);
    return `You are the judging panel of THIS hackathon. Build a panel of 3 judges that fits the event (for example an organizer representative, a sponsor engineer, a domain expert) — describe each by role only, never by a real person's name. Judge exactly as this hackathon's criteria say, as strictly as real judges: most entries score 45-70.

${ctx(b.hack)}

${evidenceText(b.hack)}
${verified ? `
VERIFIED FACTS (checked in code from GitHub and the builder's entries; these are true, never contradict them):
${verified}
- Never call a document "missing" if it appears in the document list above, whatever folder it is in.
- Never suggest doing something these facts show is already done (for example deploying when a live app is listed).
- Judge the video only from these facts and THE PRESENTATION below. You cannot watch it: never invent its length, pacing or content.
` : ''}
THE PRESENTATION / DEMO THE BUILDER WILL SHOW:
${clip(b.hack.coach?.presentation?.text, 6000) || '(not provided)'}${b.hack.coach?.presentation?.links ? `\nLinks (deck, video, live demo): ${clip(b.hack.coach.presentation.links, 500)}` : ''}

SUBMISSION WRITE-UP:
${clip(b.pitch, 4000) || '(not written yet)'}

HOW TO JUDGE FAIRLY — real judges read the code and watch the presentation:
- Base every score note on the evidence above and name it: a file path, a README section, a slide or a submission field.
- Only say something is missing if you looked where it would be (presentation, README, files, source excerpts, submission) and it is not there. You only see excerpts of some files: if something might be in code you were not shown, mark it "unclear" and ask about it in questions instead of calling it missing.
- For any rule about new/original work, start dates or building during the event, use ONLY the BUILD TIMELINE. Ignore folder names and file layout for that rule.
- If something is not shown in the presentation, say so as advice, not as an accusation.

Return JSON: {"overall":0,"verdict":"one sentence the panel would say","judges":[{"role":"","comment":"2 sentences in this judge's voice"}],"scores":[{"criterion":"","weight":0,"score":0,"note":""}],"requirements":[{"rule":"","status":"met|missing|unclear","note":""}],"strengths":[""],"fixes":[""],"twists":[{"idea":"","why":"","hours":0}],"questions":[""],"prize_odds":"one honest sentence on their chances and which track/prize is most winnable"}
- scores: exactly these criteria: ${criteria}. score 1-10, note = one sentence why.${realWeights ? '' : ' The hackathon gives no weights: set weight to 0.'} overall 0-100 = the weighted result (it is recalculated from your scores).
- requirements: check every hard requirement from the brief (empty list if none).
- fixes: the 3 changes that would raise the score most for the time left, most important first, concrete.
- twists: 3 add-ons or presentation moves that would beat the judges' expectations, each doable in the time left (hours = estimate). Think memorable demo moments, a real user story, using the host's or sponsors' platform in a way they never expected, a live metric — not more features for their own sake.
- questions: 3 hard questions these judges would ask.
- Penalise anything that looks invented, unfinished core features, and missing requirements.
- prize_odds: only what the evidence supports; no invented percentages or rankings.
- Score each criterion on what that criterion asks. A missing requirement belongs in requirements, not in the design or innovation score.`;
  },

  hack_submission(b) {
    const fields = (Array.isArray(b.fields) ? b.fields : []).slice(0, 16);
    return `Write this hackathon submission for the builder, field by field, so it reads like they wrote it themselves and scores well with these judges.

${ctx(b.hack)}

${b.extra ? `Extra facts from the builder: ${clip(b.extra, 2000)}\n` : ''}
FIELDS TO WRITE:
${fields.map((f) => `- key "${f.key}": ${clip(f.name, 80)}${f.hint ? ` (${clip(f.hint, 160)})` : ''}${f.limit ? ` — max ${f.limit} characters` : ''}`).join('\n')}

${HUMAN}

Also: answer exactly what each field asks; make the judging criteria easy to tick without naming them; mention the track and sponsor tools where relevant. For a demo video script: 2-3 minutes, timestamps like "0:00", show the working product within the first 20 seconds, end with impact. "Built with" is a plain comma-separated list.
Return JSON: {"fields":{"<key>":"text"}}`;
  },
};

const shape = {
  hack_app(o) {
    if (!o?.what_it_does) return { error: 'Could not read your app right now. Try again.' };
    const idea = o.idea || {};
    return {
      name: clip(o.name, 80), what_it_does: clip(o.what_it_does, 500), features: list(o.features, 10, 200), stack: list(o.stack, 10, 60),
      maturity: ['idea', 'prototype', 'working_mvp', 'production'].includes(o.maturity) ? o.maturity : 'prototype',
      fit: ['strong', 'partial', 'weak'].includes(o.fit) ? o.fit : 'partial', fit_note: clip(o.fit_note, 300), track: clip(o.track, 120),
      requirements: (o.requirements || []).filter((r) => r && r.rule).slice(0, 15).map((r) => ({ rule: clip(r.rule, 200), status: ['met', 'missing', 'unclear'].includes(r.status) ? r.status : 'unclear', note: clip(r.note, 200) })),
      new_code_risk: clip(o.new_code_risk, 400), gaps: list(o.gaps, 6), demo_path: list(o.demo_path, 6, 200),
      upgrades: (o.upgrades || []).filter((u) => u && u.title).slice(0, 4).map((u) => ({ title: clip(u.title, 200), why: clip(u.why, 200), hours: num(u.hours, 0, 48) })),
      idea: { title: clip(idea.title || o.name, 80), pitch: clip(idea.pitch, 500), features: list(idea.features, 5, 200), track: clip(idea.track || o.track, 120) },
    };
  },
  hack_ideas(o) {
    const ideas = (o?.ideas || []).filter((x) => x && x.title).slice(0, 5).map((x) => ({
      title: clip(x.title, 80), pitch: clip(x.pitch, 500), track: clip(x.track, 120), why_wins: clip(x.why_wins, 500),
      ambition: ['safe', 'bold', 'wild'].includes(x.ambition) ? x.ambition : 'bold', problem: clip(x.problem, 500), wow: clip(x.wow, 400),
      source: /^https?:\/\//.test(String(x.source || '')) ? clip(x.source, 300) : '',
      features: list(x.features, 5, 200), cut: list(x.cut, 5, 200),
      twists: (x.twists || []).filter((t) => t && (t.twist || t.idea)).slice(0, 3).map((t) => ({ twist: clip(t.twist || t.idea, 200), why: clip(t.why, 200), hours: num(t.hours, 0, 48) })),
      sponsor_use: clip(x.sponsor_use, 300), risk: clip(x.risk, 300), hours: num(x.hours, 0, 500),
      fit: ['fits', 'tight', 'too_big'].includes(x.fit) ? x.fit : 'tight',
    }));
    return ideas.length ? { ideas } : { error: 'No ideas came back. Try again.' };
  },
  hack_chat(o) {
    const reply = clip(o?.reply, 2000).trim();
    return reply ? { reply } : { error: 'The mentor had nothing to say. Try again.' };
  },
  hack_plan(o, b) {
    const hours = num(b.hours_per_day, 1, 16, 4);
    const start = new Date(); start.setHours(12, 0, 0, 0);
    const tasks = (o?.tasks || []).filter((t) => t && t.title).slice(0, 16).map((t) => {
      const d = new Date(start); d.setDate(d.getDate() + Math.round(num(t.day, 0, 60)));
      return {
        text: clip(t.title, 140),
        how: list(Array.isArray(t.how) ? t.how : [t.how], 5, 300),
        minutes: Math.round(num(t.minutes, 15, hours * 60, 60)),
        phase: ['setup', 'core', 'demo', 'polish', 'submit'].includes(t.phase) ? t.phase : 'core',
        due: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      };
    });
    return tasks.length ? { tasks, cut: list(o.cut, 8, 200), must_haves: list(o.must_haves, 8, 200), note: clip(o.note, 300) } : { error: 'Could not make a plan right now. Try again.' };
  },
  hack_scope(o) {
    if (!o?.headline) return { error: 'Could not check the scope right now. Try again.' };
    return {
      verdict: ['on_track', 'overbuilding', 'overthinking', 'underbuilding'].includes(o.verdict) ? o.verdict : 'on_track',
      headline: clip(o.headline, 300), keep: list(o.keep, 5), cut: list(o.cut, 6), do_next: list(o.do_next, 3), time_check: clip(o.time_check, 300),
    };
  },
  hack_judge(o, b) {
    // Weights come from the hackathon brief, not the AI, and only when they add up to about 100.
    const crit = b?.hack?.coach?.brief?.criteria || [];
    const real = validWeights(crit);
    const weightOf = (name) => {
      if (!real) return 0;
      const k = crit.find((c) => String(c.name).toLowerCase() === String(name).toLowerCase()) || crit.find((c) => String(name).toLowerCase().includes(String(c.name).toLowerCase().split(/[\s/&]/)[0]));
      return k ? num(k.weight, 0, 100) : 0;
    };
    const scores = (o?.scores || []).filter((x) => x && x.criterion).slice(0, 10).map((x) => ({ criterion: clip(x.criterion, 80), weight: weightOf(x.criterion), score: num(x.score, 0, 10), note: clip(x.note, 300) }));
    if (!scores.length) return { error: 'The judges could not score it. Try again.' };
    return {
      overall: weightedOverall(scores), verdict: clip(o.verdict, 300), prize_odds: clip(o.prize_odds, 300),
      judges: (o.judges || []).filter((j) => j && j.role).slice(0, 4).map((j) => ({ role: clip(j.role, 80), comment: clip(j.comment, 400) })),
      scores,
      requirements: (o.requirements || []).filter((r) => r && r.rule).slice(0, 15).map((r) => ({ rule: clip(r.rule, 200), status: ['met', 'missing', 'unclear'].includes(r.status) ? r.status : 'unclear', note: clip(r.note, 200) })),
      strengths: list(o.strengths, 4), fixes: list(o.fixes, 4), questions: list(o.questions, 4),
      twists: (o.twists || []).filter((t) => t && (t.idea || t.twist)).slice(0, 4).map((t) => ({ idea: clip(t.idea || t.twist, 250), why: clip(t.why, 250), hours: num(t.hours, 0, 48) })),
    };
  },
  hack_submission(o, b) {
    const allowed = new Set((b.fields || []).map((f) => f.key));
    const limits = Object.fromEntries((b.fields || []).map((f) => [f.key, f.limit || 6000]));
    const fields = {};
    Object.entries(o?.fields || {}).forEach(([k, v]) => { if (allowed.has(k) && String(v || '').trim()) fields[k] = clip(String(v).trim(), limits[k]); });
    return Object.keys(fields).length ? { fields } : { error: 'Could not write the submission right now. Try again.' };
  },
};
