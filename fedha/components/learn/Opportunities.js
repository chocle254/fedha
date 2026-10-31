import { useEffect, useMemo, useState } from 'react';
import { getSetting, setSetting } from '../../lib/db';

// Free learning, found for you: the AI researches the live web for sponsored bootcamps, free courses with
// certificates, scholarships, fellowships and excellence programmes (pages/api/learn-opps.js), with a short
// list of always-free schools underneath. Hackathons live in the Tech Hub, so they are left out here. Anything can be saved or turned into a course in one tap.
// Stored in one capped settings key: the last research (18 items) and what you saved (60).
const KEY = 'study_opps';
const SAVED_CAP = 60;
const FILTERS = [['all', '✨ All'], ['bootcamp', '🏕️ Bootcamps'], ['course', '📚 Free courses'], ['scholarship', '🎓 Scholarships'], ['fellowship', '🤝 Fellowships'], ['program', '⭐ Programmes']];
const FIELDS = ['AI & machine learning', 'Cybersecurity', 'Data science', 'Cloud & DevOps', 'Software development', 'Web development'];
const DEFAULT_FIELDS = ['AI & machine learning', 'Cybersecurity'];
const ICON = { bootcamp: '🏕️', course: '📚', scholarship: '🎓', fellowship: '🤝', program: '⭐' };

// Well-known schools that stay free. Intakes change: the link is the source of truth.
const ALWAYS_FREE = [
  { title: 'ALX Africa programmes', org: 'ALX', kind: 'bootcamp', cost: 'Sponsored', url: 'https://www.alxafrica.com', why: 'Sponsored software, data and AI tracks for young Africans, with career support.' },
  { title: 'Power Learn Project', org: 'PLP Africa', kind: 'bootcamp', cost: 'Sponsored', url: 'https://powerlearnprojectafrica.org', why: 'Sponsored software development training across Africa, Kenya included.' },
  { title: 'Ajira Digital', org: 'Government of Kenya', kind: 'program', cost: 'Free', url: 'https://ajiradigital.go.ke', why: 'Free training for online and digital work, run in Kenya.' },
  { title: 'KamiLimu mentorship', org: 'KamiLimu', kind: 'fellowship', cost: 'Free', url: 'https://www.kamilimu.org', why: 'Kenyan mentorship programme for tech students: skills, innovation, career.' },
  { title: 'CS50', org: 'Harvard', kind: 'course', cost: 'Free certificate', url: 'https://cs50.harvard.edu', why: 'The classic computer science course, with AI, Python and web tracks.' },
  { title: 'freeCodeCamp', org: 'freeCodeCamp', kind: 'course', cost: 'Free certificate', url: 'https://www.freecodecamp.org', why: 'Full web, Python and data curricula with free certifications.' },
  { title: 'Hugging Face courses', org: 'Hugging Face', kind: 'course', cost: 'Free', url: 'https://huggingface.co/learn', why: 'LLMs, agents, diffusion and NLP from the people who build the tools.' },
  { title: 'fast.ai Practical Deep Learning', org: 'fast.ai', kind: 'course', cost: 'Free', url: 'https://course.fast.ai', why: 'Hands-on deep learning, code first.' },
  { title: 'Kaggle Learn', org: 'Kaggle', kind: 'course', cost: 'Free certificate', url: 'https://www.kaggle.com/learn', why: 'Short, practical Python, ML and SQL courses with notebooks.' },
  { title: 'Microsoft Learn', org: 'Microsoft', kind: 'course', cost: 'Free', url: 'https://learn.microsoft.com/training', why: 'Free Azure, AI and developer paths; sometimes free exam vouchers.' },
  { title: 'Cisco Networking Academy', org: 'Cisco', kind: 'course', cost: 'Free', url: 'https://www.netacad.com', why: 'Free networking, cybersecurity and Python courses with badges.' },
];

const daysTo = (iso) => (iso ? Math.ceil((new Date(iso + 'T23:59:59') - Date.now()) / 864e5) : null);
const host = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
const noHack = (it) => it.kind !== 'hackathon'; // older searches had them; the Tech Hub has hackathons now
const perk = (it) => (it.stay && it.meals ? 4 : 0) + (it.stay ? 2 : 0) + (it.meals ? 1 : 0) + (it.stipend ? 0.5 : 0);
const idOf = (it) => String(it.url || it.title).toLowerCase();

export default function Opportunities({ courses, onAddCourse }) {
  const [data, setData] = useState({ at: null, items: [], saved: [], fields: DEFAULT_FIELDS });
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [added, setAdded] = useState({});

  useEffect(() => { getSetting(KEY, null).then((d) => d && setData({ at: d.at || null, items: (d.items || []).filter(noHack).filter((it) => it.open), // older searches weren't checked for fields or degree rules saved: (d.saved || []).filter(noHack), fields: d.fields?.length ? d.fields : DEFAULT_FIELDS })); }, []);

  const store = async (next) => { setData(next); await setSetting(KEY, { at: next.at, items: next.items.slice(0, 18), saved: next.saved.slice(0, SAVED_CAP), fields: next.fields }); };
  const interests = useMemo(() => courses.filter((c) => c.status !== 'completed').slice(0, 4).map((c) => c.title), [courses]);

  const research = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/learn-opps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interests, fields: data.fields, focus: filter }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Research failed.');
      if (!j.items?.length) throw new Error('Nothing open and free came back this time. Try another filter.');
      await store({ ...data, at: new Date().toISOString(), items: j.items });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const isSaved = (it) => data.saved.some((s) => idOf(s) === idOf(it));
  const toggleField = (f) => { const has = data.fields.includes(f); if (has && data.fields.length === 1) return; store({ ...data, fields: has ? data.fields.filter((x) => x !== f) : [...data.fields, f].slice(-4) }); };
  const toggleSave = (it) => store({ ...data, saved: isSaved(it) ? data.saved.filter((s) => idOf(s) !== idOf(it)) : [{ ...it, saved_at: new Date().toISOString() }, ...data.saved] });
  const hasCourse = (it) => courses.some((c) => (c.url && idOf({ url: c.url }) === idOf(it)) || c.title.toLowerCase() === it.title.toLowerCase());
  const addCourse = async (it) => {
    await onAddCourse({ title: it.title, provider: it.org || host(it.url), url: it.url, description: [it.why, it.cost, it.deadline ? `Apply by ${it.deadline}` : ''].filter(Boolean).join(' · '), deadline: it.deadline || '' });
    setAdded((a) => ({ ...a, [idOf(it)]: true }));
  };
  // Full accommodation and meals always first, in every list.
  const show = (list) => (filter === 'all' ? list : list.filter((it) => it.kind === filter)).map((it, i) => [it, i]).sort((a, b) => (perk(b[0]) - perk(a[0])) || (a[1] - b[1])).map(([it]) => it);

  const Item = ({ it }) => {
    const d = daysTo(it.deadline), inCourses = added[idOf(it)] || hasCourse(it);
    return (
      <div className="card-2" style={{ padding: 12, marginBottom: 8, ...(it.stay && it.meals ? { border: '1px solid rgba(245,197,107,.45)', background: 'linear-gradient(135deg,rgba(245,197,107,.10),transparent)' } : {}) }}>
        <div style={{ display: 'flex', gap: 9 }}>
          <div style={{ fontSize: 20 }}>{ICON[it.kind] || '⭐'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>{it.title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{[it.org, it.where, host(it.url)].filter(Boolean).join(' · ')}</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
              <span className="chip" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--green)' }}>{it.cost}</span>
              {d != null && <span className="chip" style={{ fontSize: 11, padding: '2px 8px', color: d <= 7 ? 'var(--red)' : 'var(--text-2)' }}>{d <= 0 ? 'Closes today' : `${d} day${d === 1 ? '' : 's'} left`}</span>}
              {it.stay && it.meals && <span className="chip" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--gold)', borderColor: 'rgba(245,197,107,.5)' }}>🏠🍽️ Housing + meals</span>}
              {it.stay && !it.meals && <span className="chip" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--gold)' }}>🏠 Housing</span>}
              {it.meals && !it.stay && <span className="chip" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--gold)' }}>🍽️ Meals</span>}
              {it.stipend && <span className="chip" style={{ fontSize: 11, padding: '2px 8px' }}>💵 Stipend</span>}
              {it.open === 'anyone' && <span className="chip" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--green)' }}>✓ No degree needed</span>}
              {it.field && <span className="chip" style={{ fontSize: 11, padding: '2px 8px' }}>{it.field}</span>}
              {it.match > 0 && <span className="chip" style={{ fontSize: 11, padding: '2px 8px' }}>{it.match}% match</span>}
                          </div>
            {it.eligibility && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5 }}>Who can apply: {it.eligibility}</div>}
            {it.why && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.5 }}>{it.why}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
          <a className="btn-primary" href={it.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Open ↗</a>
          <button className="btn-ghost" onClick={() => toggleSave(it)}>{isSaved(it) ? '★ Saved' : '☆ Save'}</button>
          {<button className="btn-ghost" disabled={inCourses} onClick={() => addCourse(it)}>{inCourses ? '✓ In courses' : '＋ Add as course'}</button>}
        </div>
      </div>
    );
  };
  const Head = ({ children, sub }) => (
    <div style={{ margin: '18px 0 8px' }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-3)' }}>{children}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div className="card" style={{ padding: 14, background: 'linear-gradient(135deg,rgba(59,130,246,.10),rgba(16,185,129,.07))' }}>
        <div style={{ fontWeight: 800 }}>🌍 Free learning, found for you</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '4px 0 10px', lineHeight: 1.5 }}>
          Searches the web now for sponsored bootcamps, free courses with certificates, scholarships, fellowships and excellence programmes in your fields, open to self-taught people with no degree, in Kenya or online. Free housing and meals come first; degree-only offers are dropped. Only real links from the search are shown.
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: 0.8, marginBottom: 6 }}>MY FIELDS</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {FIELDS.map((f) => <button key={f} className={`chip ${data.fields.includes(f) ? 'active' : ''}`} onClick={() => toggleField(f)}>{data.fields.includes(f) ? '✓ ' : ''}{f}</button>)}
        </div>
        <div className="tab-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10 }}>
          {FILTERS.map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <button className="btn-primary" style={{ width: '100%' }} disabled={busy} onClick={research}>{busy ? '🔎 Searching the web…' : `🔎 Research ${filter === 'all' ? 'opportunities' : FILTERS.find(([k]) => k === filter)[1].replace(/^\S+\s/, '').toLowerCase()} now`}</button>
        {data.at && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6, textAlign: 'center' }}>Last searched {new Date(data.at).toLocaleString()}</div>}
        {err && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      </div>

      {data.saved.length > 0 && show(data.saved).length > 0 && <><Head>★ Saved ({show(data.saved).length})</Head>{show(data.saved).map((it) => <Item key={'s' + idOf(it)} it={it} />)}</>}

      {show(data.items).length > 0 && <><Head sub="From the live web, best match first. Check the details on the site before applying.">🔎 Found this search</Head>{show(data.items).map((it) => <Item key={'f' + idOf(it)} it={it} />)}</>}
      {data.items.length > 0 && !show(data.items).length && <div className="card-2" style={{ padding: 14, marginTop: 12, fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center' }}>None of this type in the last search. Tap Research to look for them.</div>}

      {show(ALWAYS_FREE).length > 0 && <><Head sub="Well-known and free. Intakes change, so check the site.">📌 Always worth a look</Head>{show(ALWAYS_FREE).map((it) => <Item key={'a' + idOf(it)} it={it} />)}</>}
    </div>
  );
}
