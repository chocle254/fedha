// lib/materials.js — a course's own materials for Professor Byte to research and teach from: PDFs (read on the phone
// with PDF.js), GitHub repos and web links (read by /api/materials), and pasted text. Stored in one settings key
// 'course_materials' = { "<courseId>": [{ id, kind, title, source, text, chars, added_at }] }, capped so the database
// stays small: 8 items a course, 20 KB of text each, about 800 KB in all (oldest dropped first).
import { getSetting, setSetting } from './db';
import { genId } from './utils';

const KEY = 'course_materials';
const PER_COURSE = 8;
const TEXT_CAP = 20000;
const TOTAL_CAP = 800000;
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/';
let cache = null;

async function all() { if (!cache) { const v = await getSetting(KEY, {}); cache = v && typeof v === 'object' ? v : {}; } return cache; }
export async function getMaterials(courseId) { return courseId ? (await all())[courseId] || [] : []; }

async function store(next) {
  // Keep the total small: drop the oldest items across all courses until it fits.
  const flat = Object.entries(next).flatMap(([c, list]) => list.map((m) => ({ c, m })));
  let size = flat.reduce((s, x) => s + (x.m.text?.length || 0), 0);
  flat.sort((a, b) => String(a.m.added_at).localeCompare(String(b.m.added_at)));
  for (const x of flat) { if (size <= TOTAL_CAP) break; next[x.c] = next[x.c].filter((m) => m.id !== x.m.id); size -= x.m.text?.length || 0; }
  cache = next;
  await setSetting(KEY, next);
}
export async function addMaterial(courseId, { kind, title, source, text }) {
  const clean = String(text || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length < 40) throw new Error('There was hardly any text in that. Try another file or link.');
  const item = { id: genId(), kind, title: String(title || source || 'Material').slice(0, 120), source: String(source || '').slice(0, 400), text: clean.slice(0, TEXT_CAP), chars: clean.length, added_at: new Date().toISOString() };
  const a = { ...(await all()) };
  a[courseId] = [item, ...(a[courseId] || [])].slice(0, PER_COURSE);
  await store(a);
  return item;
}
export async function removeMaterial(courseId, id) {
  const a = { ...(await all()) };
  a[courseId] = (a[courseId] || []).filter((m) => m.id !== id);
  await store(a);
}

// A PDF's text, read on the phone (PDF.js is loaded from the CDN only when you add a PDF). Up to 150 pages.
export async function pdfText(file, onPage) {
  const lib = await import(/* webpackIgnore: true */ `${PDFJS}pdf.min.mjs`);
  lib.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.mjs`;
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = Math.min(doc.numPages, 150);
  const out = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = '', lastY = null;
    const lines = [];
    for (const it of tc.items) {
      const y = it.transform?.[5];
      if (lastY != null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; }
      line += it.str + (it.hasEOL ? '\n' : '');
      lastY = y;
    }
    lines.push(line);
    out.push(`--- page ${i} ---\n${lines.join('\n')}`);
    onPage?.(i, pages);
    if (out.join('\n').length > TEXT_CAP * 1.5) break;
  }
  return out.join('\n');
}

// The parts of a course's materials that matter for one lesson or question (simple keyword scoring over chunks).
export function relevantMaterial(materials, query, maxChars = 5000) {
  if (!materials?.length) return '';
  const words = [...new Set(String(query || '').toLowerCase().match(/[a-z0-9+#]{4,}/g) || [])];
  const chunks = [];
  for (const m of materials) {
    const parts = m.text.split(/\n(?=---|#{1,3} )|\n\n/);
    let buf = '';
    for (const p of parts) {
      if ((buf + p).length > 1300 && buf) { chunks.push({ m, t: buf }); buf = ''; }
      buf += `${p}\n\n`;
    }
    if (buf.trim()) chunks.push({ m, t: buf });
  }
  const scored = chunks.map((c, i) => {
    const low = c.t.toLowerCase();
    const score = words.reduce((s, w) => s + (low.split(w).length - 1), 0);
    return { ...c, score, i };
  }).filter((c) => c.score > 0 || !words.length).sort((a, b) => b.score - a.score || a.i - b.i);
  let out = '', used = 0;
  for (const c of scored) {
    const piece = `[${c.m.kind.toUpperCase()}: ${c.m.title}]\n${c.t.trim()}\n\n`;
    if (used + piece.length > maxChars) continue;
    out += piece; used += piece.length;
  }
  return out.trim();
}
