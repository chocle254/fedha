// The "what comes next" engine. A pack knows one kind of project (ML, cybersecurity log analysis, Express server,
// SQL schema, Dockerfile...). It reads the code so far and returns its remaining STAGES in order; each stage is a
// list of choices. The editor offers the first stage's choices (plus a peek at the one after).
// Everything is plain rules on the text: no AI, no network.
import { mlStages } from '../ml-flow';

export const R = String.raw;
// Snippet fields are written «1:name» in the sources so templates stay readable; CodeMirror wants ${1:name}.
export const T = (s) => s.replace(/«/g, '${').replace(/»/g, '}');
// `before`: insert above the last line containing this text (e.g. </body>) instead of after the cursor line.
export const S = (id, title, done, text, before) => ({ id, title, done, text, before });

// A chain is a list of steps (or arrays of alternative steps), done in order. A step is "done" once its regex
// matches the code. `detect` says the code is this kind of project; `domains` are lab domains (cyber, data, ...)
// that suggest it even in an empty file; `name` matches the file name.
export function chain({ id, langs, detect, domains = [], name, steps }) {
  return {
    id, langs,
    score: (code, ctx) => ((detect && detect.test(code)) || (name && name.test(ctx.name || '')) ? 2 : domains.includes(ctx.domain) ? 1 : 0),
    stages: (code, ctx) => steps
      .map((g) => (Array.isArray(g) ? g : [g]))
      .filter((alts) => !alts.some((a) => a.done && a.done.test(code)))
      .map((alts) => alts.map((a) => ({ id: a.id, title: a.title, before: a.before, text: T(typeof a.text === 'function' ? a.text(code, ctx) : a.text) }))),
  };
}
// Used when nothing more specific matches the language: a gentle general checklist.
export const fallback = (packArgs) => ({ ...chain({ ...packArgs, detect: null }), score: () => 0.5 });

export const mlPack = {
  id: 'ml', langs: ['python'],
  score: (code, ctx) => (/\b(pandas|sklearn|torch|keras|tensorflow|seaborn|xgboost|lightgbm)\b|read_csv|train_test_split/.test(code) ? 2 : ['ai', 'data'].includes(ctx.domain) ? 1 : 0),
  stages: (code) => mlStages(code),
};

const PACKS = [];
export const register = (...packs) => PACKS.push(...packs);

export function nextSteps(code, ctx = {}) {
  if (typeof code !== 'string' || code.length > 60000) return [];
  const lang = ctx.lang || 'python';
  const scored = PACKS.filter((p) => p.langs.includes(lang)).map((p) => ({ p, score: p.score(code, ctx) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  // Several equally likely kinds of project (e.g. an empty cybersecurity lab): one starting point from each.
  const top = scored[0]?.score;
  const tied = scored.filter((x) => x.score === top).slice(0, 3);
  if (tied.length > 1) {
    const starts = tied.map(({ p }) => p.stages(code, ctx)[0]?.[0]).filter(Boolean);
    if (starts.length) return starts;
  }
  for (const { p } of scored) {
    const st = p.stages(code, ctx);
    if (!st.length) continue;
    const first = st[0].slice(0, 3);
    return st[1] && first.length < 3 ? [...first, st[1][0]] : first;
  }
  return [];
}

// Where a step goes. Most steps go after the line the cursor is on (or the end of the file). Steps with `before`
// (HTML inside <body>, Solidity inside the contract) go above the last line containing that text.
export function placement(doc, st, caretLineEnd) {
  if (st.before) {
    const i = doc.lastIndexOf(st.before);
    if (i >= 0) return { from: doc.lastIndexOf('\n', i - 1) + 1, text: st.text.endsWith('\n') ? st.text : st.text + '\n' };
  }
  const from = caretLineEnd == null ? doc.length : Math.min(caretLineEnd, doc.length);
  const tail = doc.slice(Math.max(0, from - 2), from);
  const gap = doc.length === 0 ? '' : tail.endsWith('\n\n') ? '' : tail.endsWith('\n') ? '\n' : '\n\n';
  return { from, text: gap + st.text };
}
