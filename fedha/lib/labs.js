// lib/labs.js — Project Labs: after each unit (a section of a course) Byte takes you to a hands-on project built
// from it. A lab is a learning project (study_projects) with a `lab` part:
//   { course_id, section, unit, brief, why, domain, lang, files: [{ name, content }], milestones: [{ id, title, goal,
//     criteria: [], hint, done, score, review }], current, reviews: [{ at, milestone, score }], explained: [lessonIds] }
// Files are capped (6 files, 8 KB each) so the settings key stays small.
import { genId } from './utils';

export const FILE_CAP = 8000;
export const MAX_FILES = 6;

// The course's units in order: { section, lessons, done, total, complete, index }.
export function unitsOf(course) {
  const out = [];
  for (const m of course?.modules || []) {
    const sec = m.section || 'Course content';
    let u = out.find((x) => x.section === sec);
    if (!u) { u = { section: sec, lessons: [], index: out.length }; out.push(u); }
    u.lessons.push(m);
  }
  return out.map((u) => ({ ...u, total: u.lessons.length, done: u.lessons.filter((l) => l.completed).length, complete: u.lessons.length > 0 && u.lessons.every((l) => l.completed) }));
}

export const labOf = (projects, courseId, section) => (projects || []).find((p) => p.lab && p.lab.course_id === courseId && p.lab.section === section) || null;

// Lessons you skipped: unfinished lessons in this unit or any earlier one, while you have moved on past them.
export function missedLessons(course, section, explained = []) {
  const units = unitsOf(course);
  const at = units.findIndex((u) => u.section === section);
  if (at < 0) return [];
  const all = units.slice(0, at + 1).flatMap((u) => u.lessons);
  const lastDone = all.map((l) => !!l.completed).lastIndexOf(true);
  // Only lessons with a finished lesson after them were skipped; the ones you have not reached yet are just next.
  return all.filter((l, i) => !l.completed && i < lastDone && !explained.includes(l.id));
}

// A new lab project from the AI's answer.
export function newLab(course, unit, j) {
  const milestones = (j.milestones || []).map((m) => ({ id: genId(), title: m.title, goal: m.goal, criteria: m.criteria || [], hint: m.hint || '', done: false, score: null, review: null }));
  return {
    id: genId(), title: j.title, goal: j.brief, course_id: course.id, link: '', status: 'active', created_at: new Date().toISOString(),
    milestones: milestones.map((m) => ({ id: m.id, title: m.title, done: false })),
    lab: {
      course_id: course.id, section: unit.section, unit: unit.index + 1, brief: j.brief, why: j.why || '', domain: j.domain || 'concept', lang: j.lang || 'python',
      files: (j.files || []).slice(0, MAX_FILES).map((f) => ({ name: String(f.name).slice(0, 60), content: String(f.content || '').slice(0, FILE_CAP) })),
      milestones, current: 0, reviews: [], explained: [], stretch: j.stretch || [],
    },
  };
}

// Your sharpness over time: the review scores, oldest first, and whether you are improving.
export function sharpness(projects, courseId = null) {
  const pts = (projects || []).filter((p) => p.lab && (!courseId || p.lab.course_id === courseId)).flatMap((p) => p.lab.reviews || []).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const last = pts.slice(-5), prev = pts.slice(-10, -5);
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x.score, 0) / a.length : null);
  return { points: pts.slice(-20), now: avg(last), before: avg(prev) };
}
