// pages/api/hack-coach.js — the Hackathon Coach's mentor (see
// pages/hackathon/[id].js). Same Groq chat model as pages/api/ai.js; the
// brief step also runs real web searches (lib/web-search.js) so the
// mentor's research is grounded in what is actually published about the
// hackathon, never invented.
import { requireUser } from '../../lib/require-user';
import { webSearchMulti } from '../../lib/web-search';

export const config = { maxDuration: 60 };

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const TYPES = new Set(['hack_brief', 'hack_ideas', 'hack_chat', 'hack_plan', 'hack_scope', 'hack_judge', 'hack_submission']);
const clip = (v, n) => String(v ?? '').slice(0, n);
const list = (v, n, len = 300) => (Array.isArray(v) ? v : []).filter((x) => x != null && String(x).trim()).slice(0, n).map((x) => clip(x, len));
const num = (v, lo, hi, d = 0) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : d));

const BUILDER = 'The builder is a student developer in Kenya, usually working solo with little money and a phone or modest laptop. Prefer free tiers, simple stacks and things one person can finish.';

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
    const obj = await groqJSON(GROQ_API_KEY, prompts[b.type](b), b.type === 'hack_submission' ? 0.75 : 0.6);
    const out = shape[b.type](obj, b);
    if (out.error) return res.status(500).json(out);
    return res.status(200).json(out);
  } catch (e) {
    console.error('[fedha] hack-coach', b.type, 'failed:', e.status, e.message);
    return res.status(500).json({ error: e.status === 429 ? 'The AI is rate limited right now. Try again in a minute.' : 'The mentor could not answer right now. Try again in a moment.' });
  }
}

async function groqJSON(key, prompt, temperature = 0.6) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature,
      max_tokens: 6000,
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

Return JSON: {"name":"","organizer":"","deadline":"YYYY-MM-DD or YYYY-MM-DDTHH:MM if a time is given, else empty","timezone":"","mode":"online|in-person|hybrid|","summary":"2 sentences: what it is and what they want built","tracks":[{"name":"","prize":"","description":""}],"prize_total":"","requirements":["every hard rule a submission must meet, e.g. must use X API, video under 3 minutes, public repo, new code only, team size"],"criteria":[{"name":"","weight":0,"description":"what the judges look for"}],"submission_fields":[{"name":"","hint":"","limit":0}],"sponsor_tech":["sponsor tools/APIs mentioned"],"key_dates":["date: what happens"],"judges":["judge names or roles if listed"],"unclear":["important things the details do not say that the builder should check"]}
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
  hack_ideas(b) {
    const own = clip(b.own_idea, 1500).trim();
    return `You are a hackathon mentor who has judged many hackathons. ${own ? 'Stress-test the builder\'s own idea against this hackathon and sharpen it.' : 'Suggest ideas built to win THIS hackathon.'}

${ctx(b.hack)}

${BUILDER}

${own ? `THE BUILDER'S IDEA:\n${own}\n\nReturn JSON: {"ideas":[ONE idea object: the builder's idea, sharpened but still theirs]}` : 'Return JSON: {"ideas":[4 idea objects, each aimed at a different track or angle]}'}
Idea object: {"title":"short catchy name","pitch":"2 sentences: who it helps and what it does","track":"which track/prize it targets","why_wins":"how it scores on each judging criterion, in one or two sentences","features":["3-4 core features that MUST work in the demo"],"cut":["tempting features to NOT build"],"twists":[{"twist":"an add-on that would surprise the judges","why":"which criterion it lifts","hours":0}],"sponsor_use":"how it uses sponsor tools, or empty","risk":"the biggest way this could fail in the time left","hours":0,"fit":"fits|tight|too_big"}
Rules: ideas must meet every hard requirement. hours = realistic build hours for the core features for this solo builder. fit compares hours with the working time left. Twists: 2-3, cheap (under 4 hours each) and memorable — a live demo moment, a local angle (M-Pesa, Swahili, USSD, offline), a surprising use of a sponsor API, real users tested. Avoid generic "add AI chatbot" ideas unless AI is the theme.${own ? ' If the idea does not fit the hackathon or is too big, say so plainly in risk and set fit honestly.' : ''}`;
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
    const criteria = br.criteria?.length ? br.criteria.map((k) => `${k.name}${k.weight ? ` (${k.weight}%)` : ''}`).join(', ') : 'Innovation / originality, Technical difficulty & execution, Impact / usefulness, Design & user experience, Presentation & demo, Fit with theme';
    return `You are the judging panel of THIS hackathon. Build a panel of 3 judges that fits the event (for example an organizer representative, a sponsor engineer, a domain expert) — describe each by role only, never by a real person's name. Judge exactly as this hackathon's criteria say, as strictly as real judges: most entries score 45-70.

${ctx(b.hack)}

WHAT THE BUILDER SUBMITS FOR JUDGING:
${clip(b.pitch, 3000) || '(no write-up — judge from the idea, plan, progress and notes above)'}

Return JSON: {"overall":0,"verdict":"one sentence the panel would say","judges":[{"role":"","comment":"2 sentences in this judge's voice"}],"scores":[{"criterion":"","weight":0,"score":0,"note":""}],"requirements":[{"rule":"","status":"met|missing|unclear","note":""}],"strengths":[""],"fixes":[""],"twists":[{"idea":"","why":"","hours":0}],"questions":[""],"prize_odds":"one honest sentence on their chances and which track/prize is most winnable"}
- scores: exactly these criteria: ${criteria}. score 1-10, note = one sentence why. overall 0-100 = the weighted result.
- requirements: check every hard requirement from the brief (empty list if none).
- fixes: the 3 changes that would raise the score most for the time left, most important first, concrete.
- twists: 3 add-ons or presentation moves that would beat the judges' expectations, each doable in the time left (hours = estimate). Think memorable demo moments, a real user story, a local Kenyan angle, a clever sponsor-API use, a live metric — not more features for their own sake.
- questions: 3 hard questions these judges would ask.
- Penalise anything that looks invented, unfinished core features, and missing requirements.`;
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
  hack_ideas(o) {
    const ideas = (o?.ideas || []).filter((x) => x && x.title).slice(0, 5).map((x) => ({
      title: clip(x.title, 80), pitch: clip(x.pitch, 500), track: clip(x.track, 120), why_wins: clip(x.why_wins, 500),
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
  hack_judge(o) {
    const scores = (o?.scores || []).filter((x) => x && x.criterion).slice(0, 10).map((x) => ({ criterion: clip(x.criterion, 80), weight: num(x.weight, 0, 100), score: num(x.score, 0, 10), note: clip(x.note, 300) }));
    if (!scores.length) return { error: 'The judges could not score it. Try again.' };
    return {
      overall: Math.round(num(o.overall, 0, 100)), verdict: clip(o.verdict, 300), prize_odds: clip(o.prize_odds, 300),
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
