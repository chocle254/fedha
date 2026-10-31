// lib/byte-kb.js — Professor Byte's knowledge base: what he researched for each lesson, stored once and reused
// every time that lesson is taught (lesson plans, explanations, the learner brief), so nothing is regenerated.
// One settings key 'byte_kb' = { "<courseId>|<lessonId>": { summary, keyterms, concepts, prerequisites, connects, at } },
// capped at 150 lessons (oldest dropped) to keep the database small.
import { getSetting, setSetting } from './db';
import { askStudy } from './study';

const KEY = 'byte_kb';
const CAP = 150;
let cache = null;

export const kbKey = (courseId, lessonId) => `${courseId || 'free'}|${lessonId || ''}`;
async function all() { if (!cache) { const v = await getSetting(KEY, {}); cache = v && typeof v === 'object' ? v : {}; } return cache; }
export async function getKb(courseId, lessonId) { return (await all())[kbKey(courseId, lessonId)] || null; }
export async function kbStatus(course) {
  const a = await all();
  const mods = course?.modules || [];
  return { ready: mods.filter((m) => a[kbKey(course.id, m.id)]).length, total: mods.length };
}
async function put(k, kb) {
  const a = { ...(await all()), [k]: kb };
  const keys = Object.keys(a);
  if (keys.length > CAP) keys.sort((x, y) => String(a[x].at || '').localeCompare(String(a[y].at || ''))).slice(0, keys.length - CAP).forEach((x) => delete a[x]);
  cache = a;
  await setSetting(KEY, a);
}

// Byte studies one lesson: its place in the curriculum, any notes already there, and a quick web search.
export async function buildKb(course, lesson) {
  const mods = course?.modules || [];
  const i = mods.findIndex((m) => m.id === lesson.id);
  const outline = mods.slice(Math.max(0, i - 3), i + 4).map((m) => (m.id === lesson.id ? `[${m.title}]` : m.title)).join(' -> ');
  const context = [lesson.aiNotes, lesson.notes && `Learner's notes: ${lesson.notes}`, course.description && `Course: ${course.description}`].filter(Boolean).join('\n\n').slice(0, 6000);
  const j = await askStudy({ type: 'lesson_kb', course: `${course.title}${course.provider ? ` (${course.provider})` : ''}`, section: lesson.section, lesson: lesson.title, outline, context });
  await put(kbKey(course.id, lesson.id), j.kb);
  return j.kb;
}

// The stored research as study notes (used as the lesson's AI notes when it has none).
export function kbToMarkdown(kb, title = '') {
  if (!kb) return '';
  const out = [];
  if (title) out.push(`# ${title}`);
  if (kb.summary) out.push(kb.summary);
  if (kb.keyterms?.length) out.push(`## Key terms\n${kb.keyterms.map((k) => `- **${k.term}**: ${k.def}`).join('\n')}`);
  for (const c of kb.concepts || []) {
    out.push([`## ${c.name}`, c.idea, c.deep && `**Deeper:** ${c.deep}`, c.example && `**Example:**\n${c.example}`, c.mistakes?.length && `**Common mistakes:**\n${c.mistakes.map((m) => `- ${m}`).join('\n')}`, c.check && `**Check yourself:** ${c.check}${c.answer ? `\n*Answer:* ${c.answer}` : ''}`].filter(Boolean).join('\n\n'));
  }
  if (kb.prerequisites?.length) out.push(`## Know first\n${kb.prerequisites.map((x) => `- ${x}`).join('\n')}`);
  if (kb.connects?.length) out.push(`## How it connects\n${kb.connects.map((x) => `- ${x}`).join('\n')}`);
  return out.join('\n\n');
}

// The research as compact teaching material for Byte's prompts.
export function kbForPrompt(kb) {
  if (!kb) return '';
  return `BYTE'S STORED RESEARCH ON THIS LESSON (teach from this, it is checked):\n${kb.summary || ''}\n${(kb.concepts || []).map((c, i) => `${i + 1}. ${c.name}: ${c.idea} Deeper: ${c.deep} Example: ${String(c.example || '').slice(0, 400)} Mistakes: ${(c.mistakes || []).join('; ')} Check: ${c.check}`).join('\n')}${kb.prerequisites?.length ? `\nPrerequisites: ${kb.prerequisites.join('; ')}` : ''}`.slice(0, 6000);
}
