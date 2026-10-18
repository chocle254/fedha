// Shared helpers for the Hackathon Coach (pages/hackathon/[id].js): the
// phases a hackathon goes through, time maths, and the mentor's check-in.
// Everything the coach knows is kept on the hackathon itself under
// `hack.coach`; the build plan lives in `hack.tasks` (marked coach: true) so
// the Tech Hub card and the planner see the same tasks.
import { todayISO, localISO } from './utils';

export const PHASES = [
  { id: 'brief', label: 'Brief', emoji: '📋', color: '#3B82F6', blurb: 'Paste the hackathon details so the mentor knows the rules, tracks and judging criteria.' },
  { id: 'ideate', label: 'Ideate', emoji: '💡', color: '#F59E0B', blurb: 'Pick one idea that fits a track and that you can finish in the time you have.' },
  { id: 'build', label: 'Build', emoji: '🛠️', color: '#10B981', blurb: 'Build the smallest version that shows the idea working end to end.' },
  { id: 'polish', label: 'Polish', emoji: '✨', color: '#A855F7', blurb: 'Stop adding features. Fix the demo path, record the video, write the README.' },
  { id: 'submit', label: 'Submit', emoji: '📨', color: '#EC4899', blurb: 'Fill every submission field and submit before the deadline, not at it.' },
];

// Devpost's standard story fields, used when the brief lists none.
export const DEFAULT_FIELDS = [
  { key: 'tagline', name: 'Tagline', hint: 'One short line: what it is and who it is for', limit: 200 },
  { key: 'inspiration', name: 'Inspiration', hint: 'The real moment or problem that started it' },
  { key: 'what_it_does', name: 'What it does', hint: 'What a user can actually do with it today' },
  { key: 'how_built', name: 'How we built it', hint: 'Stack, architecture and the interesting parts' },
  { key: 'challenges', name: 'Challenges we ran into', hint: 'Specific problems and how you got past them' },
  { key: 'accomplishments', name: "Accomplishments that we're proud of", hint: 'What works that you did not expect to pull off' },
  { key: 'learned', name: 'What we learned', hint: 'Concrete things, not "teamwork"' },
  { key: 'next', name: "What's next", hint: 'The realistic next step' },
  { key: 'built_with', name: 'Built with', hint: 'Comma-separated tools, languages and APIs' },
];
export const VIDEO_FIELD = { key: 'video_script', name: 'Demo video script', hint: 'What to say and show, second by second' };

export const fieldKey = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'field';

export function submissionFields(coach) {
  const listed = (coach?.brief?.submission_fields || []).filter((f) => f && f.name);
  const base = listed.length ? listed.map((f) => ({ key: fieldKey(f.name), name: f.name, hint: f.hint || '', limit: f.limit || null })) : DEFAULT_FIELDS;
  return base.some((f) => /video/i.test(f.name)) ? base : [...base, VIDEO_FIELD];
}

// The deadline as a moment in time. A bare date means the end of that day.
export function deadlineMs(hack) {
  const d = hack?.deadline || hack?.coach?.brief?.deadline;
  if (!d) return null;
  const s = String(d);
  const ms = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:00` : s).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function hoursLeft(hack, now = Date.now()) {
  const ms = deadlineMs(hack);
  return ms == null ? null : (ms - now) / 3600000;
}

export function fmtHours(h) {
  if (h == null) return 'No deadline';
  if (h <= 0) return 'Deadline passed';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min left`;
  if (h < 48) return `${Math.round(h)}h left`;
  const d = Math.floor(h / 24);
  return `${d}d ${Math.round(h - d * 24)}h left`;
}

export const coachTasks = (hack) => (hack?.tasks || []).filter((t) => t.coach);

// Hours the plan still needs vs. hours you can realistically give before the
// deadline. Over 1 = the plan does not fit (overbuilding).
export function workload(hack, now = Date.now()) {
  const open = (hack?.tasks || []).filter((t) => !t.done);
  const needMin = open.reduce((s, t) => s + (Number(t.minutes) || 90), 0);
  const left = hoursLeft(hack, now);
  const perDay = Number(hack?.coach?.hours_per_day) || 4;
  const availH = left == null ? null : Math.max(0, (left / 24) * perDay);
  return { needH: needMin / 60, availH, ratio: availH ? needMin / 60 / availH : null, open: open.length };
}

export function minutesLogged(coach) {
  return (coach?.log || []).reduce((s, l) => s + (Number(l.minutes) || 0), 0);
}

export function phaseOf(hack, now = Date.now()) {
  const c = hack?.coach || {};
  if (!c.brief) return 'brief';
  if (!c.idea) return 'ideate';
  if (c.submission?.submitted_at || hack.status === 'submitted' || hack.status === 'completed') return 'submit';
  const left = hoursLeft(hack, now);
  const tasks = coachTasks(hack);
  const done = tasks.filter((t) => t.done).length;
  const filled = Object.values(c.submission?.fields || {}).filter((v) => String(v || '').trim()).length;
  if (filled >= 3 || (left != null && left < 6)) return 'submit';
  if ((left != null && left < 24) || (tasks.length && done / tasks.length >= 0.8)) return 'polish';
  return 'build';
}

// The mentor "checks in": the one thing worth saying right now.
// Returns { tone, text, action } — action is a tab id or 'log'.
export function mentorNotice(hack, now = Date.now()) {
  if (!hack) return null;
  const c = hack.coach || {};
  const left = hoursLeft(hack, now);
  const today = todayISO();
  if (!c.brief) return { tone: 'info', text: 'Paste the hackathon page (rules, tracks, judging criteria, submission requirements) and I will research it and break it down for you.', action: 'brief' };
  if (left != null && left <= 0 && !c.submission?.submitted_at) return { tone: 'warn', text: 'The deadline has passed. If submissions are still open, submit what you have now. A working demo with an honest write-up beats nothing.', action: 'submit' };
  if (c.app && !c.app.analysis && !c.idea) return { tone: 'info', text: `${c.app.name || 'Your app'} is connected but not checked yet. Let me scan it against this hackathon.`, action: 'ideas' };
  if (!c.idea) {
    return { tone: left != null && left < 24 ? 'warn' : 'info', text: left != null && left < 24 ? `Only ${fmtHours(left)} and no idea picked yet. Choose the simplest idea that fits a track, right now.` : c.app ? `I've checked ${c.app.name} against this hackathon. Use it as your project, or pick another idea.` : 'Next: pick an idea. Already built something for this? Connect your app and I will check how it fits. Otherwise I can suggest ideas or stress-test yours.', action: 'ideas' };
  }
  const tasks = coachTasks(hack);
  if (!tasks.length) return { tone: 'info', text: `Let me turn "${c.idea.title}" into a timed build plan that fits the ${fmtHours(left).replace(' left', '')} you have left.`, action: 'plan' };
  const w = workload(hack, now);
  if (w.ratio != null && w.ratio > 1.15) {
    return { tone: 'warn', text: `You're overbuilding. The open tasks need about ${Math.round(w.needH)}h and you have about ${Math.round(w.availH)}h of working time before the deadline. Cut features now, not on the last night.`, action: 'plan' };
  }
  const overdue = tasks.filter((t) => !t.done && t.due && t.due < today);
  if (overdue.length) return { tone: 'warn', text: `${overdue.length} task${overdue.length === 1 ? ' is' : 's are'} behind schedule, starting with "${overdue[0].text}". Do it next or cut it.`, action: 'plan' };
  const lastLog = (c.log || [])[0];
  const lastCommit = c.app?.repo?.commits?.[0]?.date ? new Date(c.app.repo.commits[0].date).getTime() : null;
  const lastAt = Math.max(lastLog?.at || 0, lastCommit || 0) || null;
  const quietH = lastAt ? (now - lastAt) / 3600000 : null;
  if (quietH != null && quietH > 24 && (left == null || left > 0)) return { tone: 'warn', text: `No progress logged for ${Math.round(quietH / 24) || 1} day${quietH >= 48 ? 's' : ''}. What did you get done? Even 30 minutes counts.`, action: 'log' };
  const filled = Object.values(c.submission?.fields || {}).filter((v) => String(v || '').trim()).length;
  if (left != null && left < 24 && filled < 3) return { tone: 'warn', text: `${fmtHours(left)}. Start the submission now: draft the write-up and record the demo video while the build is still fresh.`, action: 'submit' };
  if (!(c.judged || []).length && tasks.filter((t) => t.done).length >= Math.ceil(tasks.length / 2)) return { tone: 'info', text: 'You are halfway through the plan. Let the judges score it now, while there is still time to act on what they say.', action: 'judges' };
  const next = tasks.find((t) => !t.done);
  if (next) return { tone: 'info', text: `Next up: "${next.text}"${next.minutes ? ` (about ${Math.round(next.minutes)} min)` : ''}. Log it when it's done.`, action: 'plan' };
  return { tone: 'win', text: 'Every task on the plan is done. Run the judges one last time, then finish the submission.', action: 'submit' };
}

// What the coach endpoint needs — without images or long chat history.
// full: send the whole repo snapshot (only the app check needs it); every
// other request gets a short summary so prompts stay small.
export function hackForAI(hack, { full = false, evidence = null } = {}) {
  const { project_image, certificate_image, coach = {}, tasks = [], ...rest } = hack || {};
  const { chat, judged, raw, ideas, ...c } = coach;
  if (c.app) {
    const r = c.app.repo;
    // Always recompute: the start date may have been set after the scan.
    const timeline = timelineOf(hack, r);
    c.app = full ? { ...c.app, timeline } : {
      ...c.app,
      timeline,
      linked: c.app.linked ? { ...c.app.linked, text: String(c.app.linked.text || '').slice(0, 900) } : null,
      repo: r ? { full_name: r.full_name, url: r.url, folder: r.folder || '', languages: r.languages, pushed_at: r.pushed_at, file_count: r.file_count, commits: (r.commits || []).slice(0, 8) } : null,
    };
    // The judges get the real evidence: README, file list and source files.
    if (evidence && r) c.app.evidence = { readme: r.readme || '', files: (r.files || []).slice(0, 250), deps: r.deps || [], sources: evidence };
  }
  return {
    ...rest,
    tasks: tasks.slice(0, 40).map((t) => ({ text: t.text, done: !!t.done, due: t.due || null, minutes: t.minutes || null })),
    coach: { ...c, last_judging: (judged || [])[0] || null, log: (c.log || []).slice(0, 12) },
    hours_left: hoursLeft(hack),
    minutes_logged: minutesLogged(coach),
  };
}

export async function coachAsk(type, payload) {
  const res = await fetch('/api/hack-coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Spread plan tasks over the days until the deadline.
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localISO(d);
}

// ── Connecting an app you already built ──
// Reads a public GitHub repo with the unauthenticated API (60 requests an
// hour per device; a scan uses about 5) plus raw.githubusercontent.com for
// manifest files, which is not rate limited.
export function parseRepo(input) {
  const s = String(input || '').trim().replace(/\.git$/, '');
  const m = s.match(/github\.com[/:]([^/\s?#]+)\/([^/\s?#]+)/i) || s.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? `${m[1]}/${m[2]}` : '';
}

const MANIFESTS = ['package.json', 'requirements.txt', 'pyproject.toml', 'pubspec.yaml', 'go.mod', 'Cargo.toml', 'composer.json', 'Gemfile', 'build.gradle', 'pom.xml'];

async function gh(path, accept) {
  const res = await fetch(`https://api.github.com${path}`, { headers: accept ? { Accept: accept } : undefined });
  if (res.status === 404) { const e = new Error('not_found'); e.status = 404; throw e; }
  if (res.status === 403 || res.status === 429) throw new Error('GitHub is rate limiting this device. Try again in an hour, or paste your README into the project notes.');
  if (!res.ok) throw new Error('Could not reach GitHub right now.');
  return accept?.includes('raw') ? res.text() : res.json();
}

const rawUrl = (name, branch, p) => `https://raw.githubusercontent.com/${name}/${encodeURIComponent(branch)}/${p.split('/').map(encodeURIComponent).join('/')}`;

// The source files a judge would open first: entry points, routes, pages
// and main components, plus any slides or demo script kept in the repo.
const CODE = /\.(jsx?|tsx?|py|go|rs|dart|java|kt|swift|vue|svelte|rb|php|cs|sol|ipynb)$/i;
const DOC = /\.(md|txt)$/i;
const OUTLINE = /^\s{0,4}(export\s|async\s+def\s|def\s|class\s|function\s|(pub\s+)?fn\s|func\s|@(app|router|bp|api)\.(get|post|put|patch|delete|route|websocket)|(app|router)\.(get|post|put|patch|delete|use)\(|const\s+[A-Z]\w*\s*=)/;

export function rankFile(p, size = 0) {
  const f = p.toLowerCase();
  const base = f.split('/').pop();
  if (/(^|\/)(test|tests|__tests__|spec|e2e|fixtures|migrations|alembic|scripts?|seeds?|examples?|public|static|assets)\//.test(f)) return -1;
  if (/\.(test|spec|config|min|d)\.[a-z]+$/.test(base) || /^(__init__|env|conftest|setup|setuptests|reportwebvitals|serviceworker|next-env|clear_.*|seed.*|manage)\.[a-z]+$/.test(base)) return -1;
  let r = 0;
  if (DOC.test(f) && /(pitch|slides?|deck|presentation|demo|submission|devpost)/.test(f)) r += 12;
  if (!CODE.test(f)) return DOC.test(f) && r ? r : -1;
  if (size && size < 300) return -1; // re-exports and stubs
  if (/^(main|app|index|server|api|routes?|router)\.[a-z]+$/.test(base)) r += 4;
  if (/(^|\/)(routers?|routes|pages|app|screens|views|components|services|agents|api|controllers|handlers|lib|hooks|models)\//.test(f)) r += 3;
  if (size) r += Math.min(4, Math.log2(size / 1000 + 1)); // substantial files tell judges more
  r -= f.split('/').length * 0.4;
  return r;
}
export async function gatherEvidence(repo, { maxFiles = 8, perFile = 1800 } = {}) {
  if (!repo?.full_name) return [];
  // Best-ranked first, but at most 2 files from any one folder, so the
  // judges see pages, components and the backend, not eight API helpers.
  const sizes = repo.sizes || {};
  const ranked = (repo.files || []).map((p) => [p, rankFile(p, sizes[p])]).filter(([, r]) => r >= 0).sort((a, b) => b[1] - a[1]);
  const perDir = {};
  const picks = [];
  for (const [p] of ranked) {
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.';
    if ((perDir[dir] || 0) >= 2) continue;
    perDir[dir] = (perDir[dir] || 0) + 1;
    picks.push(p);
    if (picks.length >= maxFiles) break;
  }
  const got = await Promise.all(picks.map(async (p) => {
    try {
      const r = await fetch(rawUrl(repo.full_name, repo.branch || 'main', p));
      if (!r.ok) return null;
      const text = await r.text();
      // An outline of the whole file (functions, classes, components, API
      // routes), so judges see what is in it beyond the first lines.
      const outline = text.length > perFile ? text.split('\n').filter((l) => OUTLINE.test(l)).map((l) => l.trim().slice(0, 110)).slice(0, 45) : [];
      return { path: p, text: text.slice(0, outline.length ? Math.round(perFile * 0.55) : perFile), outline, size: text.length, truncated: text.length > perFile };
    } catch { return null; }
  }));
  return got.filter(Boolean);
}

const commitOf = (c) => ({ sha: c.sha?.slice(0, 7), date: c.commit?.author?.date, message: String(c.commit?.message || '').split('\n')[0].slice(0, 140) });

// The repo's very first commit and how many commits it has. GitHub lists
// commits newest first; with one per page, the "last" page link is the
// first commit and its page number is the total count.
async function firstCommit(name, folder = '') {
  const path = folder ? `&path=${encodeURIComponent(folder)}` : '';
  const res = await fetch(`https://api.github.com/repos/${name}/commits?per_page=1${path}`);
  if (!res.ok) return null;
  const newest = await res.json();
  const last = (res.headers.get('link') || '').match(/[?&]page=(\d+)>;\s*rel="last"/);
  if (!last) return Array.isArray(newest) && newest[0] ? { first: commitOf(newest[0]), count: 1 } : null;
  const count = Number(last[1]);
  const r2 = await fetch(`https://api.github.com/repos/${name}/commits?per_page=1&page=${count}${path}`);
  if (!r2.ok) return { first: null, count };
  const oldest = await r2.json();
  return { first: Array.isArray(oldest) && oldest[0] ? commitOf(oldest[0]) : null, count };
}

export async function scanRepo(fullName, { folder = '' } = {}) {
  folder = String(folder || '').replace(/^\/+|\/+$/g, '');
  const name = parseRepo(fullName);
  if (!name) throw new Error('That does not look like a GitHub repo. Use owner/repo or the repo URL.');
  let repo;
  try { repo = await gh(`/repos/${name}`); } catch (e) {
    if (e.status === 404) throw new Error(`Can't see ${name}. If it's private, make it public for the hackathon (most require that anyway), or paste the README into your project notes.`);
    throw e;
  }
  const branch = repo.default_branch || 'main';
  const [languages, readme, tree, commits, history] = await Promise.all([
    gh(`/repos/${name}/languages`).catch(() => ({})),
    gh(`/repos/${name}/readme`, 'application/vnd.github.raw').catch(() => ''),
    gh(`/repos/${name}/git/trees/${encodeURIComponent(branch)}?recursive=1`).catch(() => ({ tree: [] })),
    gh(`/repos/${name}/commits?per_page=20${folder ? `&path=${encodeURIComponent(folder)}` : ''}`).catch(() => []),
    firstCommit(name, folder).catch(() => null),
  ]);
  const blobs = (tree.tree || []).filter((t) => t.type === 'blob' && !/(^|\/)(node_modules|\.git|dist|build|\.next|vendor|__pycache__|venv)\//.test(t.path));
  const allPaths = blobs.map((t) => t.path);
  const sizeOf = Object.fromEntries(blobs.map((t) => [t.path, t.size || 0]));
  const dirs = [...new Set(allPaths.map((p) => p.split('/')).filter((x) => x.length > 1).flatMap((x) => [x[0], x.length > 2 ? `${x[0]}/${x[1]}` : null]).filter(Boolean))].sort().slice(0, 60);
  const paths = folder ? allPaths.filter((p) => p === folder || p.startsWith(folder + '/')) : allPaths;
  let folderReadme = '';
  if (folder) {
    const rp = paths.find((p) => /^readme(\.md)?$/i.test(p.slice(folder.length + 1)));
    if (rp) { try { const rr = await fetch(rawUrl(name, branch, rp)); if (rr.ok) folderReadme = await rr.text(); } catch {} }
  }
  const manifests = paths.filter((p) => MANIFESTS.includes(p.split('/').pop()) && p.split('/').length <= 3 && !/(^|\/)(examples?|docs|test|tests|fixtures)\//.test(p))
    .sort((x, y) => x.split('/').length - y.split('/').length).slice(0, 4);
  const deps = await Promise.all(manifests.map(async (p) => {
    try {
      const r = await fetch(rawUrl(name, branch, p));
      if (!r.ok) return null;
      let text = await r.text();
      if (p.endsWith('package.json')) {
        try { const j = JSON.parse(text); text = `dependencies: ${Object.keys(j.dependencies || {}).join(', ')}\ndevDependencies: ${Object.keys(j.devDependencies || {}).join(', ')}`; } catch {}
      }
      return { path: p, text: text.slice(0, 1500) };
    } catch { return null; }
  }));
  const total = Object.values(languages).reduce((s, n) => s + n, 0) || 1;
  return {
    full_name: repo.full_name,
    url: repo.html_url,
    description: repo.description || '',
    homepage: repo.homepage || '',
    topics: repo.topics || [],
    branch,
    created_at: repo.created_at,
    pushed_at: repo.pushed_at,
    stars: repo.stargazers_count,
    languages: Object.entries(languages).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${Math.round((n / total) * 100)}%`),
    readme: String(folderReadme || readme || '').slice(0, 7000),
    folder,
    dirs,
    file_count: paths.length,
    files: paths.slice(0, 250),
    sizes: Object.fromEntries(paths.slice(0, 250).map((p) => [p, sizeOf[p] || 0])),
    deps: deps.filter(Boolean),
    commits: (Array.isArray(commits) ? commits : []).map(commitOf),
    first_commit: history?.first || null,
    commit_count: history?.count || (Array.isArray(commits) ? commits.length : 0),
    scanned_at: Date.now(),
  };
}

// A startup or Showroom project from Fedha, as plain facts for the coach.
export function linkedFacts(kind, item) {
  if (!item) return null;
  if (kind === 'startup') {
    const st = item.stages || {};
    const pick = (o) => Object.entries(o || {}).filter(([, v]) => String(v || '').trim()).map(([k, v]) => `${k}: ${String(v).slice(0, 600)}`);
    return { kind, id: item.id, name: item.name, text: [item.mission ? `mission: ${item.mission}` : '', ...pick(st.ideation), ...pick(st.prototyping), ...pick(st.mvp), item.pitch?.one_liner ? `one-liner: ${item.pitch.one_liner}` : ''].filter(Boolean).join('\n').slice(0, 5000) };
  }
  return { kind, id: item.id, name: item.name, text: [item.description, item.site_url ? `live: ${item.site_url}` : '', ...(item.notes || []).map((n) => (typeof n === 'string' ? n : n.text)).filter(Boolean)].filter(Boolean).join('\n').slice(0, 5000) };
}

// When the hackathon opened: your own correction first, then the brief.
export function startDateOf(hack) {
  const d = hack?.coach?.start_date || hack?.coach?.brief?.start_date || '';
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : '';
}

// Was the repo built during the hackathon? Worked out from dates, not
// guessed by the AI. Dates are compared by calendar day, with one day of
// grace for time zones.
export function timelineOf(hack, repo) {
  const start = startDateOf(hack);
  const firstIso = repo?.first_commit?.date || '';
  const first = firstIso.slice(0, 10);
  const created = String(repo?.created_at || '').slice(0, 10);
  const out = { start, first_commit: first, repo_created: created, commit_count: repo?.commit_count || 0, folder: repo?.folder || '' };
  if (!repo) return { ...out, verdict: 'no_repo' };
  if (!start) return { ...out, verdict: 'no_start' };
  if (!first) return { ...out, verdict: 'unknown' };
  const day = 86400000;
  const gap = (new Date(first + 'T12:00:00') - new Date(start + 'T12:00:00')) / day;
  return { ...out, verdict: gap >= -1 ? 'during' : 'before', days_before: gap < -1 ? Math.round(-gap) : 0 };
}

export function timelineText(t) {
  if (!t) return '';
  const fmt = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '?');
  if (t.verdict === 'during') return `Built during the hackathon: first commit${t.folder ? ` in ${t.folder}/` : ''} ${fmt(t.first_commit)}, the hackathon opened ${fmt(t.start)}.`;
  if (t.verdict === 'before') return `Started before the hackathon: first commit${t.folder ? ` in ${t.folder}/` : ''} ${fmt(t.first_commit)}, ${t.days_before} days before it opened on ${fmt(t.start)}.`;
  if (t.verdict === 'no_start') return 'Add the date the hackathon opened so I can check whether the app was built during it.';
  if (t.verdict === 'unknown') return "Couldn't read the repo's first commit, so the build dates are unknown.";
  return '';
}
