// pages/api/materials.js — reads a GitHub repo or a web page into text for Professor Byte (lib/materials.js stores it).
// POST { type: 'github', url } → README, the file tree and the main code files (up to 8, small ones first)
// POST { type: 'link', url }   → the page as markdown (Firecrawl, falling back to the plain page)
import { requireUser } from '../../lib/require-user';

export const config = { maxDuration: 60 };
const CODE = /\.(py|ipynb|js|jsx|ts|tsx|java|c|cpp|cs|go|rs|rb|php|sql|sh|r|kt|swift|md)$/i;
const SKIP = /(^|\/)(node_modules|dist|build|\.git|venv|\.venv|__pycache__|vendor|site-packages|\.next|coverage)\//i;

async function getJSON(url) {
  const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Luxe', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) }, signal: AbortSignal.timeout(12000) });
  if (r.status === 403) throw new Error('GitHub is limiting requests right now. Try again in a few minutes.');
  if (r.status === 404) throw new Error('That repo was not found (is it public?).');
  if (!r.ok) throw new Error('Could not read the repo.');
  return r.json();
}
const raw = async (owner, repo, ref, path) => {
  const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`, { signal: AbortSignal.timeout(10000) });
  return r.ok ? r.text() : '';
};
// Notebooks: keep the markdown and code cells, drop outputs.
const notebook = (txt) => { try { const nb = JSON.parse(txt); return (nb.cells || []).map((c) => (c.cell_type === 'code' ? `\`\`\`python\n${[].concat(c.source).join('')}\n\`\`\`` : [].concat(c.source).join(''))).join('\n\n'); } catch { return txt; } };

async function github(url) {
  const m = String(url).match(/github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\/tree\/([^/\s]+)(?:\/(.+))?)?/i);
  if (!m) throw new Error('That does not look like a GitHub repo link.');
  const [, owner, repo0, branch, sub] = m;
  const repo = repo0.replace(/\.git$/, '');
  const info = await getJSON(`https://api.github.com/repos/${owner}/${repo}`);
  const ref = branch || info.default_branch || 'main';
  const tree = await getJSON(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const files = (tree.tree || []).filter((f) => f.type === 'blob' && CODE.test(f.path) && !SKIP.test(f.path) && (!sub || f.path.startsWith(sub)) && (f.size || 0) < 60000);
  const readme = files.find((f) => /(^|\/)readme\.md$/i.test(f.path) && f.path.split('/').length <= (sub ? sub.split('/').length + 1 : 1));
  // Main code first: shallow paths and smaller files, notebooks and source before other markdown.
  const pick = files.filter((f) => f !== readme && !/\.md$/i.test(f.path)).sort((a, b) => a.path.split('/').length - b.path.split('/').length || (a.size || 0) - (b.size || 0)).slice(0, 8);
  const parts = [`# ${info.full_name}${info.description ? ` - ${info.description}` : ''}`, `Files:\n${files.slice(0, 80).map((f) => `- ${f.path}`).join('\n')}`];
  if (readme) parts.push(`## README\n${(await raw(owner, repo, ref, readme.path)).slice(0, 8000)}`);
  for (const f of pick) {
    let t = await raw(owner, repo, ref, f.path);
    if (/\.ipynb$/i.test(f.path)) t = notebook(t);
    if (t) parts.push(`## ${f.path}\n\`\`\`\n${t.slice(0, 6000)}\n\`\`\``);
  }
  return { title: `GitHub: ${info.full_name}`, text: parts.join('\n\n') };
}

async function link(url) {
  try {
    const r = await fetch('https://api.firecrawl.dev/v2/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.FIRECRAWL_API_KEY ? { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` } : {}) }, body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }), signal: AbortSignal.timeout(30000) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && (d?.data?.markdown || '').length > 200) return { title: d.data.metadata?.title || url, text: d.data.markdown };
  } catch { /* plain fetch below */ }
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Luxe)' }, signal: AbortSignal.timeout(15000) });
  const html = await r.text();
  const title = (html.match(/<title[^>]*>([^<]+)/i) || [])[1] || url;
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<(li|h\d|p|br|div|tr|pre)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return { title: title.trim(), text };
}

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { type, url } = req.body || {};
  if (!/^https?:\/\//.test(url || '')) return res.status(400).json({ error: 'Paste a full link (https://…).' });
  try {
    const out = type === 'github' || /github\.com\//i.test(url) ? await github(url) : await link(url);
    if ((out.text || '').length < 100) return res.status(422).json({ error: 'That page had hardly any readable text (it may need a login). Try a PDF or paste the text.' });
    return res.status(200).json({ title: out.title.slice(0, 120), text: out.text.slice(0, 40000) });
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Could not read that.' });
  }
}
