import { getSetting } from './db';
import { todayISO } from './utils';

// Which course today's planner has you on, so Study mode opens that course (not just the last one you studied).
// Planner course blocks are labelled "Course — <title>" (pages/planner.js). Picks the block happening now, else the
// next one today, else the latest one earlier today. `label` (a block's label, e.g. from its notification) wins.
const titleOf = (label) => String(label || '').replace(/^Course —\s*/, '').replace(/\s*\(continued\)\s*$/, '').trim().toLowerCase();
const match = (courses, label) => {
  const t = titleOf(label);
  return t ? courses.find((c) => c.status !== 'completed' && String(c.title || '').trim().toLowerCase() === t) : null;
};

export async function plannedCourseId(courses, label = null) {
  if (label) { const c = match(courses, label); if (c) return c.id; }
  try {
    const [blocks, date] = await Promise.all([getSetting('planner_blocks', []), getSetting('planner_blocks_date', null)]);
    if (date !== todayISO() || !Array.isArray(blocks)) return null;
    const now = new Date(); const mins = now.getHours() * 60 + now.getMinutes();
    const study = blocks
      .filter((b) => b.type === 'learning' && /^\d{1,2}:\d{2}$/.test(b.time || ''))
      .map((b) => { const [h, m] = b.time.split(':').map(Number); return { b, start: h * 60 + m, end: h * 60 + m + Number(b.duration || 0) }; })
      .filter((x) => match(courses, x.b.label));
    const pick = study.find((x) => mins >= x.start && mins < x.end)
      || study.filter((x) => x.start > mins).sort((a, b) => a.start - b.start)[0]
      || study.filter((x) => x.end <= mins).sort((a, b) => b.end - a.end)[0];
    return pick ? match(courses, pick.b.label).id : null;
  } catch { return null; }
}
