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
  if (!c.idea) {
    return { tone: left != null && left < 24 ? 'warn' : 'info', text: left != null && left < 24 ? `Only ${fmtHours(left)} and no idea picked yet. Choose the simplest idea that fits a track, right now.` : 'Next: pick an idea. I will suggest ones that fit the tracks and judging criteria, or you can bring your own and I will stress-test it.', action: 'ideas' };
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
  const quietH = lastLog?.at ? (now - lastLog.at) / 3600000 : null;
  if (quietH != null && quietH > 24 && (left == null || left > 0)) return { tone: 'warn', text: `No progress logged for ${Math.round(quietH / 24) || 1} day${quietH >= 48 ? 's' : ''}. What did you get done? Even 30 minutes counts.`, action: 'log' };
  const filled = Object.values(c.submission?.fields || {}).filter((v) => String(v || '').trim()).length;
  if (left != null && left < 24 && filled < 3) return { tone: 'warn', text: `${fmtHours(left)}. Start the submission now: draft the write-up and record the demo video while the build is still fresh.`, action: 'submit' };
  if (!(c.judged || []).length && tasks.filter((t) => t.done).length >= Math.ceil(tasks.length / 2)) return { tone: 'info', text: 'You are halfway through the plan. Let the judges score it now, while there is still time to act on what they say.', action: 'judges' };
  const next = tasks.find((t) => !t.done);
  if (next) return { tone: 'info', text: `Next up: "${next.text}"${next.minutes ? ` (about ${Math.round(next.minutes)} min)` : ''}. Log it when it's done.`, action: 'plan' };
  return { tone: 'win', text: 'Every task on the plan is done. Run the judges one last time, then finish the submission.', action: 'submit' };
}

// What the coach endpoint needs — without images or long chat history.
export function hackForAI(hack) {
  const { project_image, certificate_image, coach = {}, tasks = [], ...rest } = hack || {};
  const { chat, judged, raw, ...c } = coach;
  return {
    ...rest,
    tasks: tasks.slice(0, 40).map((t) => ({ text: t.text, done: !!t.done, due: t.due || null, minutes: t.minutes || null })),
    coach: { ...c, raw: String(raw || '').slice(0, 9000), last_judging: (judged || [])[0] || null, log: (c.log || []).slice(0, 12) },
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
