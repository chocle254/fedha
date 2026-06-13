import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import { useApp } from '../context/AppContext';
import { genId, countdownTo, formatCountdown, formatDate, resizeImage } from '../lib/utils';
import { fetchRepos, sortRepos, REPO_SORTS } from '../lib/github';
import { getSetting, setSetting } from '../lib/db';

// ─── LIVE COUNTDOWN ───────────────────────────────────────────────────────────
function Countdown({ deadline }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);
  const c = countdownTo(deadline);
  if (!c) return null;
  const urgent = !c.past && c.total < 3 * 86400000;
  const color = c.past ? 'var(--text-3)' : urgent ? 'var(--red)' : 'var(--green)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color }}>
      {c.past ? '⏳ Ended' : `⏱ ${formatCountdown(deadline)}`}
    </span>
  );
}

// ─── GITHUB REPO PICKER ───────────────────────────────────────────────────────
function RepoPicker({ onPick }) {
  const [username, setUsername] = useState('');
  const [repos, setRepos] = useState([]);
  const [sort, setSort] = useState('updated');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { getSetting('github_username', '').then((v) => v && setUsername(v)); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await fetchRepos(username);
      setRepos(r);
      await setSetting('github_username', username.trim());
    } catch (e) { setError(e.message); setRepos([]); }
    finally { setLoading(false); }
  }

  const sorted = sortRepos(repos, sort);

  return (
    <div style={{ background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
      <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Pull code from your GitHub</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input className="input" placeholder="github username or URL" value={username} onChange={(e) => setUsername(e.target.value)} style={{ flex: 1 }} />
        <button onClick={load} disabled={loading || !username.trim()}
          style={{ padding: '0 16px', background: 'var(--blue)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit' }}>
          {loading ? '…' : 'Load'}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>⚠ {error}</div>}
      {repos.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Sort:</span>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: '6px 10px', fontSize: 12, flex: 1 }}>
              {REPO_SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sorted.map((r) => (
              <button key={r.id} onClick={() => onPick(r)}
                style={{ textAlign: 'left', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 10, marginTop: 2 }}>
                  {r.language && <span>● {r.language}</span>}
                  <span>★ {r.stars}</span>
                  <span>⑂ {r.forks}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── HACKATHON MODAL ──────────────────────────────────────────────────────────
const EMPTY_HACK = { name: '', prize_pool: '', project_name: '', themes: '', deadline: '', repo_url: '', project_image: '', mode: '', organizer: '' };

function HackathonModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({ ...EMPTY_HACK, ...initial });
  const [imgBusy, setImgBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgBusy(true);
    try { const data = await resizeImage(file); setForm((f) => ({ ...f, project_image: data })); }
    catch {} finally { setImgBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet" style={{ maxHeight: '92vh' }}>
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>{initial?.id ? 'Edit Hackathon' : 'Register a Hackathon'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          <Field label="Hackathon Name"><input className="input" placeholder="e.g. ETHGlobal Nairobi" value={form.name} onChange={set('name')} autoFocus /></Field>
          <Field label="Prize Pool"><input className="input" placeholder="e.g. $50,000" value={form.prize_pool} onChange={set('prize_pool')} /></Field>
          <Field label="Deadline"><input className="input" type="date" value={form.deadline} onChange={set('deadline')} /></Field>
          <Field label="Project Name"><input className="input" placeholder="Your project's name" value={form.project_name} onChange={set('project_name')} /></Field>
          <Field label="Themes / Tracks"><input className="input" placeholder="e.g. AI, DeFi, Climate" value={form.themes} onChange={set('themes')} /></Field>

          {/* Project image */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Project Picture</label>
            {form.project_image ? (
              <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.project_image || "/placeholder.svg"} alt="Project preview" style={{ width: '100%', display: 'block', maxHeight: 180, objectFit: 'cover' }} />
                <button onClick={() => setForm((f) => ({ ...f, project_image: '' }))}
                  style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 100, color: '#fff', width: 28, height: 28, cursor: 'pointer' }}>✕</button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={imgBusy}
                style={{ width: '100%', padding: '14px', background: 'var(--card-2)', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit' }}>
                {imgBusy ? 'Processing…' : '📷 Add a project picture'}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} style={{ display: 'none' }} />
          </div>

          {/* GitHub repo */}
          {form.repo_url ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
              <span style={{ fontSize: 16 }}>🔗</span>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.repo_url}</span>
              <button onClick={() => setForm((f) => ({ ...f, repo_url: '' }))} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>change</button>
            </div>
          ) : (
            <RepoPicker onPick={(r) => setForm((f) => ({ ...f, repo_url: r.html_url, project_name: f.project_name || r.name }))} />
          )}

          <button className="btn-primary" disabled={!form.name.trim()} onClick={() => onSave(form)}>
            {initial?.id ? 'Save Changes' : 'Register Hackathon'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>{label}</label>
      {children}
    </div>
  );
}

// ─── REGISTERED HACKATHON CARD ────────────────────────────────────────────────
function MyHackathonCard({ hack, onEdit, onDelete, onToggleTask, onAddTask, onDeleteTask }) {
  const [newTask, setNewTask] = useState('');
  const tasks = hack.tasks || [];
  const done = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const c = countdownTo(hack.deadline);

  return (
    <div className="card" style={{ padding: 0, marginBottom: 12, overflow: 'hidden', borderColor: c && !c.past && c.total < 3 * 86400000 ? 'rgba(239,68,68,0.4)' : 'var(--border)' }}>
      {hack.project_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hack.project_image || "/placeholder.svg"} alt={hack.project_name || hack.name} style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
      )}
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{hack.name}</div>
            {hack.project_name && <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, marginTop: 2 }}>📦 {hack.project_name}</div>}
          </div>
          <button onClick={onEdit} className="btn-icon" aria-label="Edit">✏️</button>
          <button onClick={onDelete} className="btn-icon" aria-label="Delete">🗑️</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {hack.prize_pool && <span style={{ background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--green)', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 100 }}>🏆 {hack.prize_pool}</span>}
          {hack.deadline && <span style={{ background: 'var(--card-2)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 100 }}><Countdown deadline={hack.deadline} /></span>}
          {hack.themes && <span style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 12, padding: '3px 10px', borderRadius: 100 }}>{hack.themes}</span>}
        </div>

        {hack.deadline && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>Deadline: {formatDate(hack.deadline)}</div>}

        {hack.repo_url && (
          <a href={hack.repo_url} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', textDecoration: 'none', color: 'var(--text)', marginBottom: 12 }}>
            <span>🔗</span><span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hack.repo_url.replace('https://github.com/', '')}</span><span style={{ color: 'var(--blue)', fontSize: 12 }}>open ↗</span>
          </a>
        )}

        {/* Tasks */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>Tasks {tasks.length > 0 && `(${done}/${tasks.length})`}</span>
          {tasks.length > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? 'var(--green)' : 'var(--text-3)' }}>{pct}%</span>}
        </div>
        {tasks.length > 0 && (
          <div className="progress-bar" style={{ marginBottom: 10 }}>
            <div className="progress-fill" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--green)' : 'var(--blue)' }} />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {tasks.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => onToggleTask(t.id)}
                style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, border: `2px solid ${t.done ? 'var(--green)' : 'var(--border)'}`, background: t.done ? 'var(--green)' : 'transparent', color: '#000', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                {t.done && '✓'}
              </button>
              <span style={{ flex: 1, fontSize: 13, color: t.done ? 'var(--text-3)' : 'var(--text)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
              <button onClick={() => onDeleteTask(t.id)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (newTask.trim()) { onAddTask(newTask.trim()); setNewTask(''); } }} style={{ display: 'flex', gap: 8 }}>
          <input className="input" placeholder="Add a task…" value={newTask} onChange={(e) => setNewTask(e.target.value)} style={{ flex: 1, padding: '8px 12px', fontSize: 13 }} />
          <button type="submit" style={{ padding: '0 14px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: 18, cursor: 'pointer' }}>+</button>
        </form>
      </div>
    </div>
  );
}

// ─── DISCOVERED CARD (AI hackathon / event) ────────────────────────────────────
function DiscoverCard({ item, kind, onAdd }) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{item.emoji || (kind === 'hack' ? '🏆' : '📅')}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{item.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{item.organizer}</div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 10 }}>{item.description}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {kind === 'hack' && item.prize_pool && <span style={{ background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--green)', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 100 }}>🏆 {item.prize_pool}</span>}
        {item.mode && <span style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 12, padding: '3px 10px', borderRadius: 100 }}>{item.mode}</span>}
        {item.category && <span style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 12, padding: '3px 10px', borderRadius: 100 }}>{item.category}</span>}
        {item.location && <span style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 12, padding: '3px 10px', borderRadius: 100 }}>📍 {item.location}</span>}
        {item.venue && <span style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 12, padding: '3px 10px', borderRadius: 100 }}>📍 {item.venue}</span>}
        {item.is_free && <span style={{ background: 'var(--green-dim)', color: 'var(--green)', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 100 }}>FREE</span>}
        {(item.deadline || item.date) && <span style={{ background: 'var(--card-2)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 100 }}><Countdown deadline={item.deadline || item.date} /></span>}
      </div>
      {item.themes && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>🏷 {item.themes}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        {kind === 'hack' && (
          <button onClick={() => onAdd(item)}
            style={{ flex: 1, padding: '10px', background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, color: 'var(--green)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit' }}>
            ➕ I'm registering
          </button>
        )}
        {item.url_hint && (
          <a href={`https://${item.url_hint.replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer"
            style={{ flex: kind === 'hack' ? 0 : 1, padding: '10px 16px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 13, fontWeight: 600, textDecoration: 'none', textAlign: 'center', whiteSpace: 'nowrap' }}>
            {item.url_hint} ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function TechHubPage() {
  const { hackathons, addHackathon, updateHackathon, removeHackathon, startups, addStartup, removeStartup } = useApp();
  const [tab, setTab] = useState('hackathons');
  const [showTxn, setShowTxn] = useState(false);

  // location (shared by AI fetches)
  const [location, setLocation] = useState(null);
  const [locStatus, setLocStatus] = useState('idle');

  // AI data
  const [discHacks, setDiscHacks] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingHacks, setLoadingHacks] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [aiError, setAiError] = useState(null);

  // modals
  const [hackModal, setHackModal] = useState(null); // {} for new, object for edit
  const [startupName, setStartupName] = useState('');
  const [startupAcc, setStartupAcc] = useState('');
  const [showStartupForm, setShowStartupForm] = useState(false);

  useEffect(() => { getSetting('last_location', null).then((v) => { if (v) { setLocation(v); setLocStatus('got'); } }); }, []);

  function getLocation() {
    if (!navigator.geolocation) { setLocStatus('denied'); return; }
    setLocStatus('loading');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      let city = 'your area';
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const d = await r.json();
        city = d.address?.city || d.address?.town || d.address?.county || d.address?.state || 'your area';
      } catch {}
      const loc = { lat, lng, city };
      setLocation(loc); setLocStatus('got');
      await setSetting('last_location', loc);
    }, () => setLocStatus('denied'));
  }

  async function fetchAI(type) {
    const setLoading = type === 'hackathons' ? setLoadingHacks : setLoadingEvents;
    setLoading(true); setAiError(null);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, location, currency: 'KES', currency_symbol: 'KSh', nonce: Date.now() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (type === 'hackathons') setDiscHacks(data.results || []);
      else setEvents(data.results || []);
    } catch (e) { setAiError(e.message); }
    finally { setLoading(false); }
  }

  // hackathon save
  async function saveHack(form) {
    if (hackModal?.id) await updateHackathon({ ...hackModal, ...form });
    else await addHackathon({ ...form, tasks: [] });
    setHackModal(null);
  }
  function registerFromDiscover(item) {
    setHackModal({ name: item.name, prize_pool: item.prize_pool || '', themes: item.themes || '', deadline: item.deadline || '', organizer: item.organizer || '', mode: item.mode || '', project_name: '', repo_url: '', project_image: '' });
  }
  // task ops
  function toggleTask(hack, taskId) {
    const tasks = (hack.tasks || []).map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
    updateHackathon({ ...hack, tasks });
  }
  function addTask(hack, text) {
    updateHackathon({ ...hack, tasks: [...(hack.tasks || []), { id: genId(), text, done: false }] });
  }
  function deleteTask(hack, taskId) {
    updateHackathon({ ...hack, tasks: (hack.tasks || []).filter((t) => t.id !== taskId) });
  }

  async function createStartup() {
    if (!startupName.trim()) return;
    await addStartup({ name: startupName.trim(), accelerator: startupAcc.trim(), stages: {} });
    setStartupName(''); setStartupAcc(''); setShowStartupForm(false);
  }

  const sortedHacks = [...hackathons].sort((a, b) => {
    if (!a.deadline) return 1; if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  return (
    <Layout onFab={() => setShowTxn(true)}>
      <div className="page">
        <div style={{ padding: '52px 20px 0' }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Tech Hub 🚀</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Hackathons, events & your startup journey</div>
          </div>

          {/* Location banner */}
          <div style={{ marginBottom: 16 }}>
            {locStatus === 'got' ? (
              <div style={{ padding: '8px 14px', background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 8 }}>
                📍 {location?.city} <button onClick={getLocation} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>rescan</button>
              </div>
            ) : (
              <button onClick={getLocation} disabled={locStatus === 'loading'}
                style={{ width: '100%', padding: '10px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit' }}>
                {locStatus === 'loading' ? '📍 Scanning your location…' : locStatus === 'denied' ? '📍 Location denied — tap to retry' : '📍 Scan my location for nearby events'}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`chip ${tab === 'hackathons' ? 'active' : ''}`} onClick={() => setTab('hackathons')}>🏆 Hackathons</button>
            <button className={`chip ${tab === 'events' ? 'active' : ''}`} onClick={() => setTab('events')}>📅 Events</button>
            <button className={`chip ${tab === 'startups' ? 'active' : ''}`} onClick={() => setTab('startups')}>💡 Startups</button>
          </div>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {aiError && (
            <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--red)', marginBottom: 16 }}>
              ⚠ {aiError}{aiError.includes('GROQ') && <div style={{ marginTop: 6, color: 'var(--text-3)' }}>Add GROQ_API_KEY to your environment variables.</div>}
            </div>
          )}

          {/* ── HACKATHONS ─────────────────────────────────── */}
          {tab === 'hackathons' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="section-title" style={{ marginBottom: 0 }}>My Hackathons</div>
                <button onClick={() => setHackModal({})} style={{ padding: '7px 14px', background: 'var(--green)', border: 'none', borderRadius: 100, color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit' }}>+ Register</button>
              </div>
              {sortedHacks.length === 0 ? (
                <div className="empty-state"><div className="icon">🏆</div><h3>No hackathons yet</h3><p>Register one to track your project, tasks and deadline countdown</p></div>
              ) : sortedHacks.map((h) => (
                <MyHackathonCard key={h.id} hack={h}
                  onEdit={() => setHackModal(h)}
                  onDelete={() => removeHackathon(h.id)}
                  onToggleTask={(tid) => toggleTask(h, tid)}
                  onAddTask={(text) => addTask(h, text)}
                  onDeleteTask={(tid) => deleteTask(h, tid)} />
              ))}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 12px' }}>
                <div className="section-title" style={{ marginBottom: 0 }}>Upcoming on Devpost & more</div>
                <button onClick={() => fetchAI('hackathons')} disabled={loadingHacks}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 100, color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit' }}>
                  🔄 {loadingHacks ? 'Finding…' : discHacks.length ? 'Refresh' : 'Discover'}
                </button>
              </div>
              {discHacks.length === 0 && !loadingHacks ? (
                <div style={{ padding: '12px 14px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 12, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  💡 Tap Discover to find upcoming hackathons you can join — then register the ones you enter.
                </div>
              ) : discHacks.map((h) => <DiscoverCard key={h.id} item={h} kind="hack" onAdd={registerFromDiscover} />)}
            </div>
          )}

          {/* ── EVENTS ─────────────────────────────────────── */}
          {tab === 'events' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="section-title" style={{ marginBottom: 0 }}>Tech Events Near You</div>
                <button onClick={() => fetchAI('tech_events')} disabled={loadingEvents}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 100, color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit' }}>
                  🔄 {loadingEvents ? 'Scanning…' : events.length ? 'Refresh' : 'Find events'}
                </button>
              </div>
              {events.length === 0 && !loadingEvents ? (
                <div className="empty-state"><div className="icon">📅</div><h3>Find tech events near you</h3><p>{location ? `Scanning around ${location.city}.` : 'Share your location above, then'} tap "Find events" for nearby meetups, conferences & demo days</p></div>
              ) : events.map((e) => <DiscoverCard key={e.id} item={e} kind="event" />)}
            </div>
          )}

          {/* ── STARTUPS ───────────────────────────────────── */}
          {tab === 'startups' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="section-title" style={{ marginBottom: 0 }}>My Startups</div>
                <button onClick={() => setShowStartupForm((s) => !s)} style={{ padding: '7px 14px', background: 'var(--green)', border: 'none', borderRadius: 100, color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit' }}>+ Add</button>
              </div>

              {showStartupForm && (
                <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                  <Field label="Startup Name"><input className="input" placeholder="e.g. Fedha" value={startupName} onChange={(e) => setStartupName(e.target.value)} autoFocus /></Field>
                  <div style={{ height: 12 }} />
                  <Field label="Accelerator / Program"><input className="input" placeholder="e.g. Y Combinator, ALX" value={startupAcc} onChange={(e) => setStartupAcc(e.target.value)} /></Field>
                  <button className="btn-primary" style={{ marginTop: 14 }} disabled={!startupName.trim()} onClick={createStartup}>Create Startup</button>
                </div>
              )}

              {startups.length === 0 ? (
                <div className="empty-state"><div className="icon">💡</div><h3>No startups yet</h3><p>Add a startup to map its journey from ideation to MVP</p></div>
              ) : startups.map((s) => (
                <Link key={s.id} href={`/startup/${s.id}`} style={{ textDecoration: 'none' }}>
                  <div className="card" style={{ padding: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--green-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>💡</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{s.name}</div>
                      {s.accelerator && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>🏛 {s.accelerator}</div>}
                    </div>
                    <button onClick={(e) => { e.preventDefault(); removeStartup(s.id); }} className="btn-icon" aria-label="Delete">🗑️</button>
                    <span style={{ color: 'var(--text-3)', fontSize: 18 }}>›</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {hackModal !== null && (
        <HackathonModal initial={hackModal} onClose={() => setHackModal(null)} onSave={saveHack} />
      )}
      {showTxn && <TransactionModal onClose={() => setShowTxn(false)} />}
    </Layout>
  );
}
