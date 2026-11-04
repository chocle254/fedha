// lib/study.js — the Learning hub's engine: flashcards with spaced repetition, the study log, XP, streaks,
// medals and mastery. Everything lives in settings keys (offline first, synced like the rest of Luxe), each
// with a cap so the database never grows without limit.
//
// Mastery is earned only from evidence: how well you recall flashcards and how you score in quizzes.
// Time spent studying earns XP and medals, but never mastery on its own.
import { getSetting, setSetting } from './db';
import { genId, todayISO } from './utils';

export const KEYS = { cards: 'study_cards', log: 'study_log', stats: 'study_stats', notes: 'study_notes', projects: 'study_projects', prefs: 'study_prefs', homework: 'study_homework' };
const CAP = { cards: 1500, log: 1200, notes: 300, projects: 100 };

export const DEFAULT_PREFS = { focus: 25, short: 5, long: 15, every: 4 };
export const EMPTY_STATS = { xp: 0, streak: 0, best_streak: 0, last_day: null, medals: {}, counts: { focus: 0, focus_min: 0, reviews: 0, quizzes: 0, perfect: 0, lessons: 0, milestones: 0, projects_done: 0, recaps: 0 } };

export const loadAll = async () => {
  const [cards, log, stats, notes, projects, prefs] = await Promise.all([
    getSetting(KEYS.cards, []), getSetting(KEYS.log, []), getSetting(KEYS.stats, null),
    getSetting(KEYS.notes, []), getSetting(KEYS.projects, []), getSetting(KEYS.prefs, null),
  ]);
  return {
    cards: Array.isArray(cards) ? cards : [], log: Array.isArray(log) ? log : [],
    stats: { ...EMPTY_STATS, ...(stats || {}), counts: { ...EMPTY_STATS.counts, ...(stats?.counts || {}) }, medals: { ...(stats?.medals || {}) } },
    notes: Array.isArray(notes) ? notes : [], projects: Array.isArray(projects) ? projects : [],
    prefs: { ...DEFAULT_PREFS, ...(prefs || {}) },
  };
};
export const saveCards = (cards) => setSetting(KEYS.cards, keepNewest(cards, CAP.cards));
export const saveNotes = (notes) => setSetting(KEYS.notes, keepNewest(notes, CAP.notes, 'updated_at'));
export const saveProjects = (p) => setSetting(KEYS.projects, keepNewest(p, CAP.projects));
export const savePrefs = (p) => setSetting(KEYS.prefs, p);

function keepNewest(list, cap, field = 'created_at') {
  if (list.length <= cap) return list;
  return [...list].sort((a, b) => String(b[field] || '').localeCompare(String(a[field] || ''))).slice(0, cap);
}

// ── Dates ────────────────────────────────────────────────────────────────────
const dayMs = 864e5;
export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / dayMs);

// ── Flashcards: SM-2 style spacing ──────────────────────────────────────────
// grade: 0 again, 1 hard, 2 good, 3 easy.
export function newCard({ q, a, course_id = null, lesson_id = null, topic = '', source = 'ai' }) {
  return { id: genId(), q: String(q).trim(), a: String(a).trim(), course_id, lesson_id, topic, source, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: todayISO(), created_at: new Date().toISOString(), last: null };
}
export function schedule(card, grade) {
  let { ease = 2.5, interval = 0, reps = 0, lapses = 0 } = card;
  if (grade === 0) { reps = 0; lapses += 1; interval = 0; ease = Math.max(1.3, ease - 0.2); }
  else {
    reps += 1;
    if (reps === 1) interval = grade === 1 ? 1 : grade === 2 ? 1 : 3;
    else if (reps === 2) interval = grade === 1 ? 3 : grade === 2 ? 6 : 8;
    else interval = Math.round(interval * (grade === 1 ? 1.2 : grade === 2 ? ease : ease * 1.3));
    ease = Math.max(1.3, ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
  }
  const due = addDays(todayISO(), interval);
  return { ...card, ease: Math.round(ease * 100) / 100, interval, reps, lapses, due, last: new Date().toISOString() };
}
export const isDue = (c) => !c.due || c.due <= todayISO();
// How firmly a card is known, 0..1. A card you can recall three weeks out counts as mastered.
export const strength = (c) => Math.min(1, (Number(c.interval) || 0) / 21);
export const isMastered = (c) => (Number(c.interval) || 0) >= 21;

// ── XP, levels ───────────────────────────────────────────────────────────────
export const XP = { focusMin: 1, lesson: 15, reviewGood: 3, reviewAgain: 1, quizRight: 5, quizPerfect: 20, milestone: 30, project: 100, recap: 10 };
export const levelOf = (xp) => {
  const lvl = Math.floor(Math.sqrt((Number(xp) || 0) / 50)) + 1;
  const base = 50 * (lvl - 1) ** 2, next = 50 * lvl ** 2;
  return { level: lvl, into: xp - base, need: next - base, pct: Math.round(((xp - base) / (next - base)) * 100) };
};
export const RANKS = [[1, 'Curious'], [3, 'Learner'], [6, 'Scholar'], [10, 'Expert'], [15, 'Sage'], [21, 'Grandmaster']];
export const rankOf = (level) => RANKS.filter(([l]) => level >= l).pop()[1];

// ── Mastery (evidence only) ─────────────────────────────────────────────────
export const MASTERY = [[0, 'No evidence yet', '#94A3B8'], [1, 'Novice', '#F87171'], [25, 'Learner', '#F59E0B'], [45, 'Practitioner', '#60A5FA'], [65, 'Proficient', '#34D399'], [85, 'Master', '#E9D8A6']];
export function masteryFor({ cards, log }, courseId) {
  const cs = cards.filter((c) => (courseId ? c.course_id === courseId : true));
  const quizzes = log.filter((e) => e.kind === 'quiz' && (courseId ? e.course_id === courseId : true) && e.total > 0).slice(-6);
  const reviewed = cs.filter((c) => c.reps > 0 || c.lapses > 0);
  const cardScore = reviewed.length ? (reviewed.reduce((s, c) => s + strength(c), 0) / Math.max(reviewed.length, Math.min(cs.length, reviewed.length + 10))) * 100 : null;
  const quizScore = quizzes.length ? (quizzes.reduce((s, e) => s + e.score / e.total, 0) / quizzes.length) * 100 : null;
  const raw = cardScore == null && quizScore == null ? null : cardScore == null ? quizScore * 0.8 : quizScore == null ? cardScore : cardScore * 0.6 + quizScore * 0.4;
  // Little evidence = less certain: one good quiz can't make you a Master. Full weight from ~3 quizzes or 30 reviewed cards.
  const evidence = quizzes.length + reviewed.length / 10;
  const score = raw == null ? null : Math.round(raw * Math.min(1, 0.5 + evidence / 6));
  const tier = score == null ? MASTERY[0] : [...MASTERY].filter(([min], i) => i > 0 && score >= min).pop() || MASTERY[1];
  return { score, label: tier[1], color: tier[2], cards: cs.length, mastered: cs.filter(isMastered).length, quizzes: quizzes.length, quizAvg: quizScore == null ? null : Math.round(quizScore) };
}

// ── Medals ───────────────────────────────────────────────────────────────────
export const MEDALS = [
  { id: 'first_focus', icon: '🍅', name: 'First Pomodoro', desc: 'Finish one focus block', test: (s) => s.counts.focus >= 1 },
  { id: 'focus_10', icon: '🔥', name: 'In the Zone', desc: '10 focus blocks', test: (s) => s.counts.focus >= 10 },
  { id: 'focus_50', icon: '⚡', name: 'Deep Worker', desc: '50 focus blocks', test: (s) => s.counts.focus >= 50 },
  { id: 'hours_10', icon: '⏳', name: '10 Focus Hours', desc: '600 minutes of focused study', test: (s) => s.counts.focus_min >= 600 },
  { id: 'hours_50', icon: '🏔️', name: '50 Focus Hours', desc: '3,000 minutes of focused study', test: (s) => s.counts.focus_min >= 3000 },
  { id: 'streak_3', icon: '🌱', name: '3-Day Streak', desc: 'Study 3 days in a row', test: (s) => s.best_streak >= 3 },
  { id: 'streak_7', icon: '🌿', name: 'Week Warrior', desc: '7 days in a row', test: (s) => s.best_streak >= 7 },
  { id: 'streak_30', icon: '🌳', name: 'Unbreakable', desc: '30 days in a row', test: (s) => s.best_streak >= 30 },
  { id: 'reviews_100', icon: '🃏', name: 'Card Shark', desc: 'Review 100 flashcards', test: (s) => s.counts.reviews >= 100 },
  { id: 'reviews_1000', icon: '🧠', name: 'Memory Palace', desc: 'Review 1,000 flashcards', test: (s) => s.counts.reviews >= 1000 },
  { id: 'mastered_25', icon: '💎', name: '25 Mastered', desc: '25 cards you recall 3 weeks out', test: (s, x) => x.mastered >= 25 },
  { id: 'mastered_100', icon: '👑', name: '100 Mastered', desc: '100 cards mastered', test: (s, x) => x.mastered >= 100 },
  { id: 'quiz_first', icon: '❓', name: 'Quiz Taker', desc: 'Finish a fast quiz', test: (s) => s.counts.quizzes >= 1 },
  { id: 'quiz_perfect', icon: '🎯', name: 'Perfect Score', desc: 'Get every question right', test: (s) => s.counts.perfect >= 1 },
  { id: 'quiz_perfect_10', icon: '🏹', name: 'Sharpshooter', desc: '10 perfect quizzes', test: (s) => s.counts.perfect >= 10 },
  { id: 'project_first', icon: '🛠️', name: 'Builder', desc: 'Ship a learning project', test: (s) => s.counts.projects_done >= 1 },
  { id: 'project_5', icon: '🚀', name: 'Maker', desc: 'Ship 5 projects', test: (s) => s.counts.projects_done >= 5 },
  { id: 'course_first', icon: '🎓', name: 'Graduate', desc: 'Complete a course', test: (s, x) => x.coursesDone >= 1 },
  { id: 'course_5', icon: '📜', name: 'Lifelong Learner', desc: 'Complete 5 courses', test: (s, x) => x.coursesDone >= 5 },
  { id: 'master_course', icon: '🏆', name: 'True Mastery', desc: 'Reach Master (85+) in a course', test: (s, x) => x.bestMastery >= 85 },
  { id: 'level_10', icon: '⭐', name: 'Level 10', desc: 'Reach level 10', test: (s) => levelOf(s.xp).level >= 10 },
];

// Records one study event: adds XP, keeps the streak, counts it, and awards any medals now earned.
// Returns { stats, log, newMedals }.
export async function record(state, event, extra = {}) {
  const day = todayISO();
  const stats = { ...state.stats, counts: { ...state.stats.counts }, medals: { ...state.stats.medals } };
  stats.xp = (Number(stats.xp) || 0) + (Number(event.xp) || 0);
  if (stats.last_day !== day) {
    stats.streak = stats.last_day && daysBetween(stats.last_day, day) === 1 ? (stats.streak || 0) + 1 : 1;
    stats.last_day = day;
    stats.best_streak = Math.max(stats.best_streak || 0, stats.streak);
  }
  for (const [k, v] of Object.entries(event.count || {})) stats.counts[k] = (stats.counts[k] || 0) + v;
  const { count, ...rest } = event;
  // Card reviews fold into one entry per day and course, so a long review session doesn't fill the log.
  const last = state.log[state.log.length - 1];
  const log = rest.kind === 'review' && last?.kind === 'review' && last.day === day && last.course_id === rest.course_id
    ? [...state.log.slice(0, -1), { ...last, n: (last.n || 1) + 1, xp: (last.xp || 0) + (rest.xp || 0), at: new Date().toISOString() }]
    : [...state.log, { id: genId(), at: new Date().toISOString(), day, ...rest }].slice(-CAP.log);
  const ctx = { mastered: (state.cards || []).filter(isMastered).length, coursesDone: extra.coursesDone || 0, bestMastery: extra.bestMastery || 0 };
  const newMedals = MEDALS.filter((m) => !stats.medals[m.id] && m.test(stats, ctx));
  for (const m of newMedals) stats.medals[m.id] = day;
  await Promise.all([setSetting(KEYS.stats, stats), setSetting(KEYS.log, log)]);
  return { stats, log, newMedals };
}

// The current streak, allowing for today not studied yet.
export const liveStreak = (stats) => (stats.last_day && daysBetween(stats.last_day, todayISO()) <= 1 ? stats.streak || 0 : 0);

// Minutes of focus per day for the last n days (for the gains chart).
export function focusByDay(log, n = 14) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(todayISO(), -i);
    out.push({ day: d, min: log.filter((e) => e.day === d && e.kind === 'focus').reduce((s, e) => s + (e.minutes || 0), 0), xp: log.filter((e) => e.day === d).reduce((s, e) => s + (e.xp || 0), 0) });
  }
  return out;
}

// Study text for a course or lesson: AI notes + your own notes + standalone notes, for the AI to work from.
export function studyText(course, lesson, notes = []) {
  const parts = [];
  if (lesson) {
    parts.push(`Lesson: ${lesson.title} (${lesson.section || 'Course content'})`);
    if (lesson.aiNotes) parts.push(lesson.aiNotes);
    if (lesson.notes) parts.push('My notes:\n' + lesson.notes);
  } else if (course) {
    parts.push(`Course: ${course.title}${course.provider ? ' by ' + course.provider : ''}`);
    if (course.description) parts.push(course.description);
    for (const m of course.modules || []) {
      if (m.aiNotes || m.notes) parts.push(`## ${m.title}\n${m.aiNotes || ''}\n${m.notes || ''}`);
    }
    if (course.notes) parts.push('Course notes:\n' + course.notes);
  }
  for (const n of notes) parts.push(`## ${n.title}\n${n.body}`);
  return parts.join('\n\n').slice(0, 14000);
}

// Calls the study AI (/api/study).
// Byte's sass dial (chill | cheeky | savage), chosen in the tutor and kept on the phone.
export const getSass = () => { try { const v = localStorage.getItem('luxe_byte_sass'); return ['chill', 'cheeky', 'savage'].includes(v) ? v : 'savage'; } catch { return 'savage'; } };
export const setSass = (v) => { try { localStorage.setItem('luxe_byte_sass', v); } catch { /* private mode */ } };

// How fast Byte teaches: 'slow' (step by step, every line of code explained, write it yourself), 'normal', 'quick'.
export const PACES = [['slow', '🐢 Step by step'], ['normal', '🚶 Normal'], ['quick', '🏃 Quick revision']];
export const getPace = () => { try { const v = localStorage.getItem('luxe_byte_pace'); return PACES.some(([k]) => k === v) ? v : 'slow'; } catch { return 'slow'; } };
export const setPace = (v) => { try { localStorage.setItem('luxe_byte_pace', v); } catch { /* private mode */ } };

export async function askStudy(body) {
  const r = await fetch('/api/study', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sass: getSass(), pace: getPace(), ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'The AI could not answer right now.');
  return j;
}

// Everything Professor Byte reads before he teaches: the material (lesson or whole course, AI notes and your
// own notes, every related saved note) plus a brief on you as a learner: where you are in the course, your
// mastery, weak spots from flashcards you keep missing and quiz misses, and what you studied lately.
// Returns { text, read } where read counts what went in (shown so you can see he did his homework).
export function learnerBrief({ course, lesson, topic = '', notes = [], cards = [], log = [] }) {
  const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 3);
  const keys = words(topic || lesson?.title || '');
  const hit = (t) => keys.length > 0 && keys.some((k) => String(t || '').toLowerCase().includes(k));
  const relNotes = notes.filter((n) => (course && n.course_id === course.id) || hit(n.title) || hit(n.body)).slice(0, 12);
  const relCards = cards.filter((c) => (course ? c.course_id === course.id : hit(c.topic) || hit(c.q)));
  const parts = [];

  // The material, lesson first.
  if (lesson) {
    parts.push(`CURRENT LESSON: ${lesson.title} (${lesson.section || 'Course content'})${lesson.completed ? ' [already marked done]' : ''}`);
    if (lesson.aiNotes) parts.push(`Lesson notes:\n${lesson.aiNotes}`);
    if (lesson.notes) parts.push(`Learner's own notes on this lesson:\n${lesson.notes}`);
  }
  if (course) {
    const mods = course.modules || [];
    parts.push(`COURSE: ${course.title}${course.provider ? ` by ${course.provider}` : ''}${course.description ? ` - ${course.description}` : ''}`);
    if (mods.length) parts.push(`Course outline (done = ✓):\n${mods.map((m) => `${m.completed ? '✓' : '·'} ${m.title}${lesson && m.id === lesson.id ? '  <- now' : ''}`).join('\n').slice(0, 2500)}`);
    if (course.notes) parts.push(`Course notes:\n${course.notes}`);
    for (const m of mods) if (m !== lesson && (m.aiNotes || m.notes) && (!lesson || m.completed)) parts.push(`Earlier lesson "${m.title}":\n${(m.aiNotes || '').slice(0, 900)}${m.notes ? `\nLearner's notes: ${m.notes.slice(0, 500)}` : ''}`);
  }
  for (const n of relNotes) parts.push(`Saved note "${n.title}":\n${String(n.body).slice(0, 1500)}`);

  // The learner.
  const weak = relCards.filter((c) => (c.lapses || 0) > 0 || (c.ease || 2.5) < 2.2).sort((a, b) => (b.lapses || 0) - (a.lapses || 0)).slice(0, 10);
  const quizMiss = relCards.filter((c) => c.source === 'quiz').slice(-8);
  const strong = relCards.filter(isMastered).slice(0, 8);
  const quizzes = log.filter((e) => e.kind === 'quiz' && e.total > 0 && (course ? e.course_id === course.id : hit(e.topic))).slice(-5);
  const recent = [...new Set(log.filter((e) => e.kind === 'focus' && e.topic).slice(-12).map((e) => e.topic))].slice(-6);
  const m = course ? masteryFor({ cards, log }, course.id) : null;
  const me = ['ABOUT THE LEARNER: self-taught, no degree, learning AI/ML and cybersecurity.'];
  if (m) me.push(`Mastery in this course: ${m.score == null ? 'no evidence yet' : `${m.score}/100 (${m.label})`}; ${m.cards} flashcards, ${m.mastered} mastered.`);
  if (quizzes.length) me.push(`Recent quiz scores: ${quizzes.map((e) => `${e.score}/${e.total}`).join(', ')}.`);
  if (weak.length) me.push(`Weak spots (flashcards they keep missing):\n${weak.map((c) => `- ${c.q}`).join('\n')}`);
  if (quizMiss.length) me.push(`Questions they got wrong in quizzes:\n${quizMiss.map((c) => `- ${c.q}`).join('\n')}`);
  if (strong.length) me.push(`Already solid (do not over-teach):\n${strong.map((c) => `- ${c.q}`).join('\n')}`);
  if (recent.length) me.push(`Recently studied: ${recent.join(', ')}.`);
  if (!course && !relNotes.length) me.push(`No saved notes on "${topic}" yet: teach it from accurate general knowledge.`);

  const material = parts.join('\n\n').slice(0, 11000);
  return {
    text: `${material}\n\n${me.join('\n')}`.slice(0, 14000),
    read: { lessons: course ? (course.modules || []).filter((x) => x.aiNotes || x.notes).length : 0, notes: relNotes.length, cards: relCards.length, weak: weak.length + quizMiss.length },
  };
}

// ── Homework from Professor Byte ────────────────────────────────────────────
// One list, newest first, capped at 40. An assignment is set at the end of a class and checked at the start of
// the next class on the same course (or free-study topic). Skipping it keeps it open and counts a miss.
export const homeworkKey = (courseId, topic) => (courseId ? `c:${courseId}` : `t:${String(topic || '').trim().toLowerCase().slice(0, 60)}`);
export async function loadHomework() { const l = await getSetting(KEYS.homework, []); return Array.isArray(l) ? l : []; }
export async function saveHomework(list) { return setSetting(KEYS.homework, keepNewest(list, 40, 'given_at')); }
export const pendingHomework = (list, key) => list.find((h) => h.key === key && h.status === 'pending') || null;
