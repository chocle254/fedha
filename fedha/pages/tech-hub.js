import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { genId, countdownTo, formatCountdown, formatDate, resizeImage, toNairobi, TZ_ABBREVIATIONS, URGENT_MS, todayISO } from '../lib/utils';
import { fetchRepos, sortRepos, REPO_SORTS } from '../lib/github';
import { getSetting, setSetting } from '../lib/db';

// ─── HACKATHON STATUS ─────────────────────────────────────────────────────────
// Backward-compatible with older records that only have the `submitted` boolean:
// if `status` was never set, derive it from `submitted` instead of migrating data.
export function hackStatus(h) {
  return h.status || (h.submitted ? 'submitted' : 'active');
}
// "Almost hitting deadline but haven't submitted" — the higher-priority bucket.
export function isUrgent(h) {
  if (hackStatus(h) !== 'active' || !h.deadline) return false;
  const c = countdownTo(h.deadline);
  return !!c && !c.past && c.total < URGENT_MS;
}

// ─── LIVE COUNTDOWN ───────────────────────────────────────────────────────────
function Countdown({ deadline }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);
  const c = countdownTo(deadline);
  if (!c) return null;
  const urgent = !c.past && c.total < URGENT_MS;
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
const EMPTY_HACK = { name: '', prize_pool: '', project_name: '', themes: '', deadline: '', repo_url: '', project_image: '', mode: '', organizer: '', status: 'active', submitted: false, certificate_image: '', results_date: '', results_time: '', results_tz: 'ET', meeting_link: '' };

function HackathonModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({ ...EMPTY_HACK, ...initial });
  const [imgBusy, setImgBusy] = useState(false);
  const [certBusy, setCertBusy] = useState(false);
  const fileRef = useRef(null);
  const certFileRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgBusy(true);
    try { const data = await resizeImage(file); setForm((f) => ({ ...f, project_image: data })); }
    catch {} finally { setImgBusy(false); }
  }

  async function handleCertImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCertBusy(true);
    try { const data = await resizeImage(file, 1000); setForm((f) => ({ ...f, certificate_image: data })); }
    catch {} finally { setCertBusy(false); }
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

          {/* Status + results scheduling */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Status</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'active', label: '🛠 Active' },
                { id: 'submitted', label: '📨 Submitted' },
                { id: 'completed', label: '🏁 Completed' },
              ].map((s) => (
                <button key={s.id} type="button" onClick={() => setForm((f) => ({ ...f, status: s.id }))}
                  style={{
                    flex: 1, padding: '9px 4px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit',
                    background: form.status === s.id ? 'var(--green-dim)' : 'var(--card-2)',
                    border: `1px solid ${form.status === s.id ? 'var(--green)' : 'var(--border)'}`,
                    color: form.status === s.id ? 'var(--green)' : 'var(--text-2)',
                  }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {form.status === 'completed' && (
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Certificate</label>
              {form.certificate_image ? (
                <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(245,197,107,0.35)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.certificate_image} alt="Certificate preview" style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }} />
                  <button onClick={() => setForm((f) => ({ ...f, certificate_image: '' }))}
                    style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 100, color: '#fff', width: 28, height: 28, cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <button onClick={() => certFileRef.current?.click()} disabled={certBusy}
                  style={{ width: '100%', padding: '14px', background: 'var(--gold-dim)', border: '1px dashed rgba(245,197,107,0.4)', borderRadius: 12, color: 'var(--gold)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit' }}>
                  {certBusy ? 'Processing…' : '🎓 Add your certificate'}
                </button>
              )}
              <input ref={certFileRef} type="file" accept="image/*" onChange={handleCertImage} style={{ display: 'none' }} />
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>Shows up framed in the Certificates Room ✨</div>
            </div>
          )}

          {form.status !== 'active' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>📣 Results announcement — enter the time in its original timezone and Fedha converts it to Kenya time (EAT) and alerts you.</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}><Field label="Results date"><input className="input" type="date" value={form.results_date} onChange={set('results_date')} /></Field></div>
                <div style={{ width: 110 }}><Field label="Time"><input className="input" type="time" value={form.results_time} onChange={set('results_time')} /></Field></div>
              </div>
              <Field label="Timezone (as announced)">
                <select className="input" value={form.results_tz} onChange={set('results_tz')}>
                  {TZ_ABBREVIATIONS.map((z) => <option key={z.abbr} value={z.abbr}>{z.abbr} — {z.name} (UTC{z.offset >= 0 ? '+' : ''}{z.offset})</option>)}
                </select>
              </Field>
              {form.results_date && form.results_time && (() => {
                const k = toNairobi(form.results_date, form.results_time, form.results_tz);
                return k ? <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 700 }}>🇰🇪 In Kenya: {k.label}</div> : null;
              })()}
              <Field label="Meeting / results link (optional)"><input className="input" placeholder="e.g. Zoom or Meet link to join" value={form.meeting_link} onChange={set('meeting_link')} /></Field>
            </div>
          )}

          <button className="btn-primary" disabled={!form.name.trim()} onClick={() => onSave({ ...form, submitted: form.status !== 'active' })}>
            {initial?.id ? 'Save Changes' : 'Register Hackathon'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>{label}</label>
      {children}
    </div>
  );
}

// ─── RESULTS ANNOUNCEMENT BANNER ───────────────────────────────────────────────
function ResultsBanner({ hack }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  if (!hack.submitted || !hack.results_date || !hack.results_time) return null;
  const k = toNairobi(hack.results_date, hack.results_time, hack.results_tz);
  if (!k) return null;
  const c = countdownTo(k.iso);
  const live = c && !c.past;
  return (
    <div style={{ background: c?.past ? 'var(--green-dim)' : 'rgba(59,130,246,0.1)', border: `1px solid ${c?.past ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.25)'}`, borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>📣 Results announcement</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{k.label}</div>
      <div style={{ fontSize: 12, color: c?.past ? 'var(--green)' : 'var(--blue)', fontWeight: 700, marginTop: 2 }}>
        {c?.past ? '🎉 Results are out — check now!' : `⏱ in ${formatCountdown(k.iso)}`}
      </div>
      {hack.meeting_link && (
        <a href={hack.meeting_link.startsWith('http') ? hack.meeting_link : `https://${hack.meeting_link}`} target="_blank" rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, padding: '9px', background: live ? 'var(--blue)' : 'var(--card-2)', border: live ? 'none' : '1px solid var(--border)', borderRadius: 8, color: live ? '#fff' : 'var(--text)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          🎥 Join results meeting ↗
        </a>
      )}
    </div>
  );
}

// ─── REGISTERED HACKATHON CARD ────────────────────────────────────────────────
function MyHackathonCard({ hack, onEdit, onDelete, onToggleTask, onAddTask, onDeleteTask, onSetStatus }) {
  const [newTask, setNewTask] = useState('');
  const tasks = hack.tasks || [];
  const done = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const st = hackStatus(hack);

  return (
    <div className="card" style={{ padding: 0, marginBottom: 12, overflow: 'hidden', borderColor: isUrgent(hack) ? 'rgba(239,68,68,0.4)' : 'var(--border)' }}>
      {hack.project_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hack.project_image} alt={hack.project_name || hack.name} style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
      )}
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{hack.name}</div>
            {hack.project_name && <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, marginTop: 2 }}>📦 {hack.project_name}</div>}
          </div>
          {onSetStatus && (
            <button onClick={() => onSetStatus(st === 'completed' ? 'submitted' : 'completed')} className="btn-icon"
              aria-label={st === 'completed' ? 'Reopen' : 'Mark as completed'} title={st === 'completed' ? 'Reopen' : 'Mark as completed'}>
              {st === 'completed' ? '↩️' : '🏁'}
            </button>
          )}
          <button onClick={onEdit} className="btn-icon" aria-label="Edit">✏️</button>
          <button onClick={onDelete} className="btn-icon" aria-label="Delete">🗑️</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {st === 'submitted' && <span style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', color: 'var(--blue)', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 100 }}>📨 Awaiting judging</span>}
          {st === 'completed' && <span style={{ background: 'var(--gold-dim)', border: '1px solid rgba(245,197,107,0.3)', color: 'var(--gold)', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 100 }}>🏁 Completed</span>}
          {hack.prize_pool && <span style={{ background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--green)', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 100 }}>🏆 {hack.prize_pool}</span>}
          {hack.deadline && st === 'active' && <span style={{ background: 'var(--card-2)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 100 }}><Countdown deadline={hack.deadline} /></span>}
          {hack.themes && <span style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 12, padding: '3px 10px', borderRadius: 100 }}>{hack.themes}</span>}
        </div>

        {hack.deadline && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>Deadline: {formatDate(hack.deadline)}</div>}

        {st === 'completed' && !hack.certificate_image && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>🎓 Add your certificate from Edit — it'll be framed in the Certificates Room</div>
        )}

        <ResultsBanner hack={hack} />

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
        {kind === 'event' && onAdd && (
          <button onClick={() => onAdd(item)}
            style={{ flex: 1, padding: '10px', background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, color: 'var(--green)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit' }}>
            ➕ Add to My Events
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

// ─── MY EVENTS (upcoming you're tracking + past ones you joined) ──────────────
function MyEventCard({ event, onOpen, onJoinToggle, onDelete }) {
  const isPast = event.date && new Date(event.date) < new Date();
  return (
    <div className="card" style={{ padding: 14, marginBottom: 10, cursor: 'pointer' }} onClick={() => onOpen(event)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          {event.mode === 'online' ? '🌐' : '📍'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{event.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {event.date ? formatDate(event.date) : 'No date set'} · {event.mode === 'online' ? 'Online' : (event.location || 'Physical')}
          </div>
          {event.topic && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.4 }}>{event.topic}</div>}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onDelete(event.id); }} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>🗑️</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {event.mode === 'online' && event.meet_link && (
          <a href={event.meet_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            style={{ flex: 1, padding: '8px', textAlign: 'center', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
            🔗 Join Link
          </a>
        )}
        <button onClick={(e) => { e.stopPropagation(); onJoinToggle(event); }}
          style={{ flex: 1, padding: '8px', background: event.joined ? 'var(--green-dim)' : 'var(--card-2)', border: `1px solid ${event.joined ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`, borderRadius: 8, color: event.joined ? 'var(--green)' : 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit' }}>
          {event.joined ? '✓ Joined' : isPast ? 'Mark as Joined' : "I'm Attending"}
        </button>
      </div>
    </div>
  );
}

function MyEventModal({ initial, onClose, onSave }) {
  const EMPTY = { title: '', mode: 'physical', topic: '', meet_link: '', location: '', date: todayISO(), joined: false };
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>{initial?.id ? 'Edit Event' : 'Add Event'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <Field label="Event Name"><input className="input" placeholder="e.g. Nairobi DevFest 2026" value={form.title} onChange={set('title')} autoFocus /></Field>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Location Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['physical', '📍 Physical'], ['online', '🌐 Online']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setForm((f) => ({ ...f, mode: id }))}
                  style={{
                    flex: 1, padding: '10px 4px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit',
                    background: form.mode === id ? 'var(--green-dim)' : 'var(--card-2)',
                    border: `1px solid ${form.mode === id ? 'var(--green)' : 'var(--border)'}`,
                    color: form.mode === id ? 'var(--green)' : 'var(--text-2)',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {form.mode === 'online' ? (
            <Field label="Meet Link"><input className="input" type="url" placeholder="https://meet.google.com/…" value={form.meet_link} onChange={set('meet_link')} /></Field>
          ) : (
            <Field label="Location"><input className="input" placeholder="e.g. iHub, Senteu Plaza, Nairobi" value={form.location} onChange={set('location')} /></Field>
          )}

          <Field label="Date"><input className="input" type="date" value={form.date} onChange={set('date')} /></Field>
          <Field label="Topic Discussed"><textarea className="input" rows={3} placeholder="What's this event about?" value={form.topic} onChange={set('topic')} /></Field>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!form.joined} onChange={(e) => setForm((f) => ({ ...f, joined: e.target.checked }))} style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>I attended / joined this event</span>
          </label>

          <button className="btn-primary" disabled={!form.title.trim()} onClick={() => onSave(form)}>
            {initial?.id ? 'Save Changes' : 'Add Event'}
          </button>
        </div>
      </div>
    </div>
  );
}


function HackThumbGrid({ hacks, onOpen, completed }) {
  if (hacks.length === 0) return null;
  return (
    <div className="hack-grid">
      {hacks.map((h, i) => (
        <button key={h.id} type="button" className="hack-thumb" style={{ animationDelay: `${i * 40}ms` }} onClick={() => onOpen(h.id)}>
          {h.project_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={h.project_image} alt="" />
          ) : (
            <div className="hack-thumb-fallback">{completed ? '🏁' : '🚀'}</div>
          )}
          <div className="hack-thumb-scrim">
            <span className="hack-thumb-name">{h.project_name || h.name}</span>
          </div>
          {completed && h.certificate_image && <span className="hack-thumb-badge" title="Certificate earned">🎓</span>}
          {!completed && h.prize_pool && <span className="hack-thumb-badge" title={h.prize_pool}>🏆</span>}
        </button>
      ))}
    </div>
  );
}

// ─── TAP-A-THUMBNAIL DETAIL SHEET (reuses the full card in a bottom sheet) ─────
function HackDetailSheet({ hack, onClose, onEdit, onDelete, onToggleTask, onAddTask, onDeleteTask, onSetStatus }) {
  if (!hack) return null;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet" style={{ maxHeight: '88vh' }}>
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div style={{ padding: '0 16px 16px' }}>
          <MyHackathonCard hack={hack} onEdit={onEdit} onDelete={onDelete} onToggleTask={onToggleTask} onAddTask={onAddTask} onDeleteTask={onDeleteTask} onSetStatus={onSetStatus} />
        </div>
      </div>
    </div>
  );
}

// ─── AWAITING-JUDGING ROW (compact — kept separate from the busy card view) ───
function AwaitingRow({ hack, onOpen }) {
  const k = hack.results_date && hack.results_time ? toNairobi(hack.results_date, hack.results_time, hack.results_tz) : null;
  return (
    <button type="button" className="awaiting-row" onClick={() => onOpen(hack.id)}>
      <div className="awaiting-thumb">
        {hack.project_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hack.project_image} alt="" />
        ) : <span>📨</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hack.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{k ? `📣 Results ${k.label}` : 'Awaiting judging'}</div>
      </div>
      <span style={{ color: 'var(--text-3)', fontSize: 16, flexShrink: 0 }}>›</span>
    </button>
  );
}

// ─── CERTIFICATES ROOM ─────────────────────────────────────────────────────────
const ACHIEVEMENTS = ['1st Place', '2nd Place', '3rd Place', 'Finalist', 'Winner', 'Participant', 'Completion', 'Award'];
const CERT_CATEGORIES = ['Hackathon', 'Gaming Tournament', 'Course', 'Competition', 'Award', 'Other'];
const RANK_STYLE = {
  '1st Place': { ribbon: '🥇', color: '#F5C56B', label: '1st Place' },
  '2nd Place': { ribbon: '🥈', color: '#C7CDD8', label: '2nd Place' },
  '3rd Place': { ribbon: '🥉', color: '#CD8B5C', label: '3rd Place' },
  'Winner':    { ribbon: '🏆', color: '#F5C56B', label: 'Winner' },
};
function rankMeta(achievement) { return RANK_STYLE[achievement] || { ribbon: '🎖️', color: 'var(--text-3)', label: achievement || 'Achievement' }; }

// Normalizes the two sources of certificates into one shape: hackathons with
// an uploaded certificate_image, plus standalone Certificate records added
// directly from this tab.
function unifyCertificates(hackathons, certificates) {
  const fromHacks = hackathons.filter((h) => h.certificate_image).map((h) => ({
    id: `hack_${h.id}`,
    hack_id: h.id,
    title: h.name,
    organization: h.organizer || 'Hackathon',
    achievement: h.results_place || 'Winner',
    category: 'Hackathon',
    date_earned: h.results_date || h.deadline || h.created_at,
    description: h.project_name ? `Awarded for ${h.name}, presenting "${h.project_name}".` : `Awarded for participation in ${h.name}.`,
    image: h.certificate_image,
    recipient_name: 'Chocle254',
  }));
  const standalone = (certificates || []).map((c) => ({ ...c, hack_id: null }));
  return [...standalone, ...fromHacks].sort((a, b) => new Date(b.date_earned || 0) - new Date(a.date_earned || 0));
}

function CertStatChip({ icon, value, label }) {
  return (
    <div className="card-2" style={{ minWidth: 0, padding: '10px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
      <div className="font-num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
    </div>
  );
}

function CertCard({ cert, onOpen }) {
  const meta = rankMeta(cert.achievement);
  const year = cert.date_earned ? new Date(cert.date_earned).getFullYear() : '';
  return (
    <div className="cert-slot" onClick={() => onOpen(cert)} style={{ cursor: 'pointer' }}>
      <div className="cert-frame" style={{ padding: 8 }}>
        <div className="cert-glow" />
        <div className="cert-rank-badge" style={{ background: meta.color }}>{meta.ribbon}</div>
        {cert.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cert.image} alt={cert.title} />
        ) : (
          <GeneratedCertArt cert={cert} compact />
        )}
      </div>
      <div className="cert-plaque">
        <div className="cert-plaque-name">{cert.title}</div>
        <div className="cert-plaque-meta">{[meta.label, year].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  );
}

// Rendered when a certificate has no uploaded image — a Fedha-branded
// certificate visual generated from the fields you entered.
function GeneratedCertArt({ cert, compact }) {
  const meta = rankMeta(cert.achievement);
  return (
    <div className="generated-cert" style={{ padding: compact ? 14 : 22 }}>
      <div className="generated-cert-header">
        <span style={{ fontSize: compact ? 16 : 22 }}>⚡</span>
        <span style={{ fontSize: compact ? 11 : 14, fontWeight: 800, letterSpacing: 1.5 }}>FEDHA {compact ? '' : 'TECH HUB'}</span>
      </div>
      <div style={{ fontSize: compact ? 8 : 11, color: 'var(--text-3)', letterSpacing: 2, marginTop: compact ? 6 : 10, textTransform: 'uppercase' }}>Certificate of Achievement</div>
      <div style={{ fontSize: compact ? 7 : 10, color: 'var(--text-3)', marginTop: compact ? 4 : 8 }}>Proudly presented to</div>
      <div className="generated-cert-name" style={{ fontSize: compact ? 15 : 26 }}>{cert.recipient_name || 'Chocle254'}</div>
      <div style={{ fontSize: compact ? 7 : 11, color: 'var(--text-2)', marginTop: compact ? 4 : 10, padding: compact ? '0 4px' : '0 20px', lineHeight: 1.5 }}>
        {compact ? cert.title : (cert.description || `For outstanding performance in ${cert.title}.`)}
      </div>
      <div className="generated-cert-seal" style={{ width: compact ? 22 : 40, height: compact ? 22 : 40, fontSize: compact ? 11 : 18 }}>{meta.ribbon}</div>
    </div>
  );
}

function CertFilterSheet({ filters, onChange, onClose, onClear }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>Filter Certificates</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <Field label="Achievement">
            <select className="input" value={filters.achievement} onChange={(e) => onChange({ ...filters, achievement: e.target.value })}>
              <option value="">All Achievements</option>
              {ACHIEVEMENTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select className="input" value={filters.category} onChange={(e) => onChange({ ...filters, category: e.target.value })}>
              <option value="">All Categories</option>
              {CERT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Date Earned">
            <select className="input" value={filters.sort} onChange={(e) => onChange({ ...filters, sort: e.target.value })}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </Field>
          <button className="btn-primary" onClick={onClose}>Apply Filters</button>
          <button className="btn-ghost" style={{ marginTop: 8 }} onClick={onClear}>Clear All</button>
        </div>
      </div>
    </div>
  );
}

function CertificatesRoom({ hackathons, certificates, onAdd, onOpen }) {
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState({ achievement: '', category: '', sort: 'newest' });

  const all = unifyCertificates(hackathons, certificates);
  const total = all.length;
  const firstPlace = all.filter((c) => c.achievement === '1st Place').length;
  const top3 = all.filter((c) => ['1st Place', '2nd Place', '3rd Place'].includes(c.achievement)).length;
  const mostRecentYear = all.length ? new Date(all[0].date_earned || Date.now()).getFullYear() : '—';

  let shown = all.filter((c) => {
    if (search && !`${c.title} ${c.organization}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filters.achievement && c.achievement !== filters.achievement) return false;
    if (filters.category && c.category !== filters.category) return false;
    return true;
  });
  shown = shown.sort((a, b) => (filters.sort === 'oldest' ? 1 : -1) * (new Date(b.date_earned || 0) - new Date(a.date_earned || 0)));

  const activeFilterCount = (filters.achievement ? 1 : 0) + (filters.category ? 1 : 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>My Certificates</div>
        <button onClick={onAdd} style={{ padding: '7px 14px', background: 'var(--green)', border: 'none', borderRadius: 100, color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit' }}>+ Add</button>
      </div>

      {total > 0 && (
        <div className="cert-stats-grid">
          <CertStatChip icon="🎖️" value={total} label="Total Certs" />
          <CertStatChip icon="🥇" value={firstPlace} label="1st Place" />
          <CertStatChip icon="🏅" value={top3} label="Top 3 Finishes" />
          <CertStatChip icon="📅" value={mostRecentYear} label="Most Recent" />
        </div>
      )}

      {total > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input className="input" placeholder="Search certificates…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
          <button onClick={() => setShowFilter(true)} style={{ position: 'relative', padding: '0 16px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit' }}>
            ⚙ Filter
            {activeFilterCount > 0 && <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: 'var(--green)', color: '#000', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{activeFilterCount}</span>}
          </button>
        </div>
      )}

      {total === 0 ? (
        <div className="empty-state">
          <div className="icon">🖼️</div>
          <h3>The gallery is empty</h3>
          <p>Add a certificate from a hackathon, tournament, course or competition — it&apos;ll be framed here.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-state"><div className="icon">🔍</div><h3>No matches</h3><p>Try a different search or clear your filters.</p></div>
      ) : (
        <div className="cert-gallery">
          <div className="cert-gallery-grid">
            {shown.map((c) => <CertCard key={c.id} cert={c} onOpen={onOpen} />)}
          </div>
        </div>
      )}

      {showFilter && (
        <CertFilterSheet filters={filters} onChange={setFilters} onClose={() => setShowFilter(false)} onClear={() => { setFilters({ achievement: '', category: '', sort: 'newest' }); setShowFilter(false); }} />
      )}
    </div>
  );
}

function CertificateModal({ initial, onClose, onSave }) {
  const EMPTY = { title: '', organization: 'Fedha Tech Hub', achievement: '1st Place', category: 'Hackathon', date_earned: todayISO(), description: '', image: '', recipient_name: 'Chocle254' };
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const [imgBusy, setImgBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgBusy(true);
    try { const resized = await resizeImage(file, 900); setForm((f) => ({ ...f, image: resized })); }
    finally { setImgBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>{initial?.id ? 'Edit Certificate' : 'Add Certificate'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <Field label="Event / Title"><input className="input" placeholder="e.g. Call of Duty Mobile Tournament — Season 3" value={form.title} onChange={set('title')} autoFocus /></Field>
          <Field label="Issuing Organization"><input className="input" placeholder="e.g. Fedha Tech Hub, Devpost, KITI" value={form.organization} onChange={set('organization')} /></Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Achievement" style={{ flex: 1 }}>
              <select className="input" value={form.achievement} onChange={set('achievement')}>
                {ACHIEVEMENTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Category" style={{ flex: 1 }}>
              <select className="input" value={form.category} onChange={set('category')}>
                {CERT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Date Earned"><input className="input" type="date" value={form.date_earned} onChange={set('date_earned')} /></Field>
          <Field label="Recipient Name"><input className="input" value={form.recipient_name} onChange={set('recipient_name')} /></Field>
          <Field label="Description"><textarea className="input" rows={3} placeholder="What was this awarded for?" value={form.description} onChange={set('description')} /></Field>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Certificate Image (optional)</label>
            {form.image ? (
              <div style={{ position: 'relative', marginBottom: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.image} alt="Certificate" style={{ width: '100%', borderRadius: 10, display: 'block' }} />
                <button onClick={() => setForm((f) => ({ ...f, image: '' }))} className="btn-icon" style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)' }}>✕</button>
              </div>
            ) : (
              <div style={{ marginBottom: 8 }}><GeneratedCertArt cert={form} /></div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} style={{ display: 'none' }} />
            <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={imgBusy}>
              {imgBusy ? 'Processing…' : form.image ? 'Replace Photo' : '📷 Upload a photo of the real certificate'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>No photo? A Fedha-branded certificate is generated automatically from the fields above.</div>
          </div>

          <button className="btn-primary" disabled={!form.title.trim()} onClick={() => onSave(form)}>
            {initial?.id ? 'Save Changes' : 'Add Certificate'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CertificateDetail({ cert, onClose, onEdit, onDelete }) {
  const meta = rankMeta(cert.achievement);
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/certificate/${cert.id}` : '';
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  function share(network) {
    const text = encodeURIComponent(`I earned ${cert.achievement} in ${cert.title}! 🏆`);
    const url = encodeURIComponent(shareUrl);
    const links = {
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    };
    window.open(links[network], '_blank', 'noopener,noreferrer');
  }
  function copyLink() {
    navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  async function download() {
    setDownloading(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a5' });
      const w = doc.internal.pageSize.getWidth();
      const h = doc.internal.pageSize.getHeight();
      doc.setFillColor(17, 24, 39);
      doc.rect(0, 0, w, h, 'F');
      doc.setDrawColor(245, 197, 107);
      doc.setLineWidth(2);
      doc.rect(16, 16, w - 32, h - 32);
      doc.setTextColor(245, 197, 107);
      doc.setFontSize(12);
      doc.text('FEDHA TECH HUB', w / 2, 60, { align: 'center' });
      doc.setTextColor(150, 165, 190);
      doc.setFontSize(10);
      doc.text('CERTIFICATE OF ACHIEVEMENT', w / 2, 82, { align: 'center' });
      doc.setTextColor(237, 242, 255);
      doc.setFontSize(24);
      doc.text(cert.recipient_name || 'Chocle254', w / 2, 130, { align: 'center' });
      doc.setTextColor(150, 165, 190);
      doc.setFontSize(11);
      doc.text(cert.description || `For achieving ${cert.achievement} in ${cert.title}.`, w / 2, 160, { align: 'center', maxWidth: w - 120 });
      doc.setTextColor(245, 197, 107);
      doc.setFontSize(13);
      doc.text(`${meta.ribbon} ${cert.achievement}`, w / 2, h - 60, { align: 'center' });
      doc.setTextColor(150, 165, 190);
      doc.setFontSize(9);
      doc.text(cert.date_earned ? formatDate(cert.date_earned) : '', w / 2, h - 40, { align: 'center' });
      doc.save(`${cert.title.replace(/[^a-z0-9]+/gi, '_')}_certificate.pdf`);
    } finally { setDownloading(false); }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>Certificate Details</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {cert.hack_id === null && <button className="btn-icon" onClick={() => onEdit(cert)}>✏️</button>}
            {cert.hack_id === null && <button className="btn-icon" onClick={() => onDelete(cert.id)}>🗑️</button>}
            <button className="btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-body">
          <div className="cert-frame" style={{ padding: 12, marginBottom: 4 }}>
            <div className="cert-glow" />
            <div className="cert-rank-badge" style={{ background: meta.color }}>{meta.ribbon}</div>
            {cert.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cert.image} alt={cert.title} />
            ) : (
              <GeneratedCertArt cert={cert} />
            )}
          </div>

          <div className="card-2" style={{ padding: 14 }}>
            <div className="section-title" style={{ marginBottom: 10 }}>Certificate Information</div>
            {[
              ['Certificate ID', cert.id],
              ['Event', cert.title],
              ['Achievement', cert.achievement],
              ['Date Earned', cert.date_earned ? formatDate(cert.date_earned) : '—'],
              ['Issued By', cert.organization],
              ['Status', '✓ Verified'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>{label}</span>
                <span style={{ color: label === 'Status' ? 'var(--green)' : 'var(--text)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
              </div>
            ))}
          </div>

          {cert.description && (
            <div>
              <div className="section-title">Description</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{cert.description}</div>
            </div>
          )}

          <div>
            <div className="section-title">Share Certificate</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => share('twitter')} className="btn-icon" style={{ flex: 1, background: 'var(--card-2)' }}>🐦</button>
              <button onClick={() => share('facebook')} className="btn-icon" style={{ flex: 1, background: 'var(--card-2)' }}>📘</button>
              <button onClick={() => share('linkedin')} className="btn-icon" style={{ flex: 1, background: 'var(--card-2)' }}>💼</button>
              <button onClick={copyLink} className="btn-icon" style={{ flex: 1, background: 'var(--card-2)' }}>{copied ? '✓' : '🔗'}</button>
            </div>
          </div>

          <a href={`/certificate/${cert.id}`} target="_blank" rel="noreferrer" className="btn-ghost" style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}>
            🛡️ Verify Now (public link)
          </a>
          <button className="btn-primary" onClick={download} disabled={downloading}>
            {downloading ? 'Preparing PDF…' : '⬇ Download Certificate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PROJECT SHOWROOM ──────────────────────────────────────────────────────────
const EMPTY_PROJECT = { name: '', description: '', site_url: '', repo_url: '', image: '', status: 'in_progress', progress: 0, notes: [] };
const PROJECT_STATUSES = [
  { id: 'planning',    label: '🧭 Planning' },
  { id: 'in_progress', label: '🛠 In Progress' },
  { id: 'paused',      label: '⏸ Paused' },
  { id: 'done',        label: '✅ Done' },
];
// Existing showroom items saved before progress-tracking existed have no
// status — treat them as finished/showcased pieces instead of surfacing them
// as "active work" in the Planner.
export function projectStatus(p) { return p.status || (p.id ? 'done' : 'in_progress'); }
export function projectProgress(p) { return p.progress != null ? p.progress : (projectStatus(p) === 'done' ? 100 : 0); }

function ProjectModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({ ...EMPTY_PROJECT, ...initial, notes: initial?.notes ? [...initial.notes] : [] });
  const [imgBusy, setImgBusy] = useState(false);
  const [newNote, setNewNote] = useState('');
  const fileRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function addNote() {
    const text = newNote.trim();
    if (!text) return;
    setForm((f) => ({ ...f, notes: [{ id: genId(), date: new Date().toISOString(), text }, ...(f.notes || [])] }));
    setNewNote('');
  }
  function deleteNote(id) {
    setForm((f) => ({ ...f, notes: (f.notes || []).filter((n) => n.id !== id) }));
  }

  async function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgBusy(true);
    try { const data = await resizeImage(file); setForm((f) => ({ ...f, image: data })); }
    catch {} finally { setImgBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet" style={{ maxHeight: '92vh' }}>
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>{initial?.id ? 'Edit Project' : 'Add a Project'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          <Field label="Project Name"><input className="input" placeholder="e.g. Arena 2.0" value={form.name} onChange={set('name')} autoFocus /></Field>
          <Field label="Short Documentation">
            <textarea className="input" placeholder="e.g. Competitive gaming tournament platform built natively on AWS" value={form.description} onChange={set('description')} rows={3} maxLength={220} style={{ resize: 'vertical', fontFamily: 'Outfit' }} />
          </Field>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Thumbnail</label>
            {form.image ? (
              <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.image} alt="Project preview" style={{ width: '100%', display: 'block', maxHeight: 160, objectFit: 'cover' }} />
                <button onClick={() => setForm((f) => ({ ...f, image: '' }))}
                  style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 100, color: '#fff', width: 28, height: 28, cursor: 'pointer' }}>✕</button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={imgBusy}
                style={{ width: '100%', padding: '14px', background: 'var(--card-2)', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit' }}>
                {imgBusy ? 'Processing…' : '📷 Add a thumbnail'}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} style={{ display: 'none' }} />
          </div>

          <Field label="Website (optional)"><input className="input" placeholder="e.g. devsfield.vercel.app" value={form.site_url} onChange={set('site_url')} /></Field>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>GitHub Repo (optional)</label>
            {form.repo_url ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <span style={{ fontSize: 16 }}>🔗</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.repo_url}</span>
                <button onClick={() => setForm((f) => ({ ...f, repo_url: '' }))} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>change</button>
              </div>
            ) : (
              <RepoPicker onPick={(r) => setForm((f) => ({ ...f, repo_url: r.html_url, name: f.name || r.name, description: f.description || r.description || '' }))} />
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Status</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PROJECT_STATUSES.map((s) => (
                <button key={s.id} type="button" onClick={() => setForm((f) => ({ ...f, status: s.id, progress: s.id === 'done' ? 100 : f.progress }))}
                  style={{
                    flex: '1 1 45%', padding: '9px 4px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit',
                    background: form.status === s.id ? 'var(--green-dim)' : 'var(--card-2)',
                    border: `1px solid ${form.status === s.id ? 'var(--green)' : 'var(--border)'}`,
                    color: form.status === s.id ? 'var(--green)' : 'var(--text-2)',
                  }}>
                  {s.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Progress</span>
              <span className="font-num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{form.progress || 0}%</span>
            </div>
            <input type="range" min="0" max="100" step="5" value={form.progress || 0}
              onChange={(e) => setForm((f) => ({ ...f, progress: Number(e.target.value) }))}
              style={{ width: '100%' }} />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Log Progress / Notes</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input className="input" placeholder="What did you do today?" value={newNote} onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addNote()} style={{ flex: 1 }} />
              <button className="btn-icon" onClick={addNote} disabled={!newNote.trim()} style={{ background: 'var(--green)', color: '#000', borderRadius: 10, width: 42 }}>+</button>
            </div>
            {(form.notes || []).length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No notes yet — log what you build as you go.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                {form.notes.map((n) => (
                  <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>{formatDate(n.date)}</div>
                      <div style={{ fontSize: 13, color: 'var(--text)' }}>{n.text}</div>
                    </div>
                    <button onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className="btn-primary" disabled={!form.name.trim()} onClick={() => onSave(form)}>
            {initial?.id ? 'Save Changes' : 'Add to Showroom'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShowroomCard({ project, onEdit, onDelete }) {
  const status = projectStatus(project);
  const progress = projectProgress(project);
  const statusMeta = PROJECT_STATUSES.find((s) => s.id === status);
  const lastNote = (project.notes || [])[0];
  return (
    <div className="showroom-card">
      <div className="showroom-thumb" onClick={onEdit}>
        {project.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.image} alt={project.name} />
        ) : '🗂️'}
      </div>
      <div className="showroom-body">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <div className="showroom-name" style={{ flex: 1 }}>{project.name}</div>
          <button onClick={onDelete} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, flexShrink: 0 }} aria-label="Delete">🗑️</button>
        </div>
        {project.description && <div className="showroom-desc">{project.description}</div>}
        {status !== 'done' && (
          <div style={{ margin: '6px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{statusMeta?.label}</span>
              <span className="font-num" style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>{progress}%</span>
            </div>
            <div className="progress-bar" style={{ height: 5 }}>
              <div className="progress-fill" style={{ width: `${progress}%`, background: 'var(--green)' }} />
            </div>
          </div>
        )}
        {lastNote && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, fontStyle: 'italic' }}>📝 {lastNote.text}</div>}
        {(project.site_url || project.repo_url) && (
          <div className="showroom-links">
            {project.site_url && (
              <a href={project.site_url.startsWith('http') ? project.site_url : `https://${project.site_url}`} target="_blank" rel="noreferrer" className="showroom-link">🌐 Site</a>
            )}
            {project.repo_url && <a href={project.repo_url} target="_blank" rel="noreferrer" className="showroom-link">🔗 Code</a>}
          </div>
        )}
      </div>
    </div>
  );
}

function ShowroomSection({ projects, onAdd, onEdit, onDelete }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Project Showroom</div>
        <button onClick={onAdd} style={{ padding: '7px 14px', background: 'var(--green)', border: 'none', borderRadius: 100, color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit' }}>+ Add</button>
      </div>
      {projects.length === 0 ? (
        <div className="empty-state"><div className="icon">🗂️</div><h3>No projects yet</h3><p>Add what you&apos;ve built — a link and a couple lines are enough</p></div>
      ) : (
        <div className="showroom-grid">
          {projects.map((p) => <ShowroomCard key={p.id} project={p} onEdit={() => onEdit(p)} onDelete={() => onDelete(p.id)} />)}
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function TechHubPage() {
  const {
    hackathons, addHackathon, updateHackathon, removeHackathon,
    startups, addStartup, removeStartup,
    projects, addProject, updateProject, removeProject,
    certificates, addCertificate, updateCertificate, removeCertificate,
    techEvents, addTechEvent, updateTechEvent, removeTechEvent,
  } = useApp();
  const [tab, setTab] = useState('hackathons');
  const [certModal, setCertModal] = useState(null); // {} = new, {...cert} = edit, null = closed
  const [detailHackId, setDetailHackId] = useState(null);
  const [certDetail, setCertDetail] = useState(null); // cert being viewed full-screen
  const [projModal, setProjModal] = useState(null); // {} for new, object for edit, null for closed
  const [eventModal, setEventModal] = useState(null); // {} = new, {...event} = edit, null = closed
  const [eventSubTab, setEventSubTab] = useState('upcoming'); // 'upcoming' | 'past'

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

  // Ask for notification permission once, then alert when any results time arrives.
  const firedResults = useRef(new Set());
  useEffect(() => {
    try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch {}
    const check = () => {
      for (const h of hackathons) {
        if (!h.submitted || !h.results_date || !h.results_time) continue;
        const k = toNairobi(h.results_date, h.results_time, h.results_tz);
        if (!k) continue;
        if (Date.now() >= new Date(k.iso).getTime() && !firedResults.current.has(h.id)) {
          firedResults.current.add(h.id);
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification(`📣 ${h.name} results are out!`, { body: h.meeting_link ? 'Tap to join the results meeting.' : 'Check the platform now.', tag: `results-${h.id}` });
            }
          } catch {}
        }
      }
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [hackathons]);

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
    setHackModal({ name: item.name, prize_pool: item.prize_pool || '', themes: item.themes || '', deadline: item.deadline || '', organizer: item.organizer || '', mode: item.mode || '', project_name: '', repo_url: '', project_image: '', submitted: false, results_date: '', results_time: '', results_tz: 'ET', meeting_link: '' });
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

  function changeHackStatus(hack, status) {
    updateHackathon({ ...hack, status, submitted: status !== 'active' });
  }

  async function saveProjectForm(form) {
    if (projModal?.id) await updateProject({ ...projModal, ...form });
    else await addProject(form);
    setProjModal(null);
  }

  async function saveCertForm(form) {
    if (certModal?.id) await updateCertificate({ ...certModal, ...form });
    else await addCertificate(form);
    setCertModal(null);
  }

  async function saveEventForm(form) {
    if (eventModal?.id) await updateTechEvent({ ...eventModal, ...form });
    else await addTechEvent(form);
    setEventModal(null);
  }

  const byDeadline = (a, b) => { if (!a.deadline) return 1; if (!b.deadline) return -1; return new Date(a.deadline) - new Date(b.deadline); };
  const urgentHacks = hackathons.filter(isUrgent).sort(byDeadline);
  const activeHacks = hackathons.filter((h) => hackStatus(h) === 'active' && !isUrgent(h)).sort(byDeadline);
  const submittedHacks = hackathons.filter((h) => hackStatus(h) === 'submitted').sort(byDeadline);
  const completedHacks = hackathons.filter((h) => hackStatus(h) === 'completed').sort(byDeadline);
  const detailHack = hackathons.find((h) => h.id === detailHackId) || null;

  return (
    <Layout fab={false}>
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
                ��� {location?.city} <button onClick={getLocation} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>rescan</button>
              </div>
            ) : (
              <button onClick={getLocation} disabled={locStatus === 'loading'}
                style={{ width: '100%', padding: '10px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit' }}>
                {locStatus === 'loading' ? '📍 Scanning your location…' : locStatus === 'denied' ? '📍 Location denied — tap to retry' : '📍 Scan my location for nearby events'}
              </button>
            )}
          </div>

          <div className="tab-scroll">
            <button className={`chip ${tab === 'hackathons' ? 'active' : ''}`} onClick={() => setTab('hackathons')}>🏆 Hackathons</button>
            <button className={`chip ${tab === 'events' ? 'active' : ''}`} onClick={() => setTab('events')}>📅 Events</button>
            <button className={`chip ${tab === 'startups' ? 'active' : ''}`} onClick={() => setTab('startups')}>💡 Startups</button>
            <button className={`chip ${tab === 'certificates' ? 'active' : ''}`} onClick={() => setTab('certificates')}>🖼 Certificates</button>
            <button className={`chip ${tab === 'showroom' ? 'active' : ''}`} onClick={() => setTab('showroom')}>🗂 Showroom</button>
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

              {hackathons.length === 0 ? (
                <div className="empty-state"><div className="icon">🏆</div><h3>No hackathons yet</h3><p>Register one to track your project, tasks and deadline countdown</p></div>
              ) : (
                <>
                  {urgentHacks.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div className="urgent-banner">⚡ {urgentHacks.length} deadline{urgentHacks.length > 1 ? 's' : ''} closing soon — not submitted yet</div>
                      {urgentHacks.map((h) => (
                        <MyHackathonCard key={h.id} hack={h}
                          onEdit={() => setHackModal(h)}
                          onDelete={() => removeHackathon(h.id)}
                          onToggleTask={(tid) => toggleTask(h, tid)}
                          onAddTask={(text) => addTask(h, text)}
                          onDeleteTask={(tid) => deleteTask(h, tid)}
                          onSetStatus={(s) => changeHackStatus(h, s)} />
                      ))}
                    </div>
                  )}

                  {activeHacks.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div className="section-title">In progress</div>
                      <HackThumbGrid hacks={activeHacks} onOpen={setDetailHackId} />
                    </div>
                  )}

                  {submittedHacks.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div className="section-title">Awaiting judging</div>
                      {submittedHacks.map((h) => <AwaitingRow key={h.id} hack={h} onOpen={setDetailHackId} />)}
                    </div>
                  )}

                  {completedHacks.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <div className="section-title">Completed</div>
                      <HackThumbGrid hacks={completedHacks} onOpen={setDetailHackId} completed />
                    </div>
                  )}
                </>
              )}

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

          {/* ── CERTIFICATES ROOM ──────────────────────────── */}
          {tab === 'certificates' && (
            <CertificatesRoom
              hackathons={hackathons}
              certificates={certificates}
              onAdd={() => setCertModal({})}
              onOpen={(c) => setCertDetail(c)}
            />
          )}

          {/* ── PROJECT SHOWROOM ───────────────────────────── */}
          {tab === 'showroom' && (
            <ShowroomSection projects={projects}
              onAdd={() => setProjModal({})}
              onEdit={(p) => setProjModal(p)}
              onDelete={(id) => removeProject(id)} />
          )}

          {/* ── EVENTS ─────────────────────────────────────── */}
          {tab === 'events' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="section-title" style={{ marginBottom: 0 }}>My Events</div>
                <button onClick={() => setEventModal({})} style={{ padding: '7px 14px', background: 'var(--green)', border: 'none', borderRadius: 100, color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit' }}>+ Add Event</button>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button className={`chip ${eventSubTab === 'upcoming' ? 'active' : ''}`} onClick={() => setEventSubTab('upcoming')}>Upcoming</button>
                <button className={`chip ${eventSubTab === 'past' ? 'active' : ''}`} onClick={() => setEventSubTab('past')}>Past · Joined</button>
              </div>

              {eventSubTab === 'upcoming' ? (
                (() => {
                  const upcoming = techEvents
                    .filter((e) => !e.date || new Date(e.date) >= new Date(todayISO()))
                    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
                  return upcoming.length === 0 ? (
                    <div className="empty-state"><div className="icon">📅</div><h3>No upcoming events</h3><p>Add a meetup, conference or demo day you're planning to attend.</p></div>
                  ) : upcoming.map((e) => (
                    <MyEventCard key={e.id} event={e} onOpen={setEventModal} onJoinToggle={(ev) => updateTechEvent({ ...ev, joined: !ev.joined })} onDelete={removeTechEvent} />
                  ));
                })()
              ) : (
                (() => {
                  const past = techEvents
                    .filter((e) => e.joined && e.date && new Date(e.date) < new Date(todayISO()))
                    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
                  return past.length === 0 ? (
                    <div className="empty-state"><div className="icon">🎟️</div><h3>No past events yet</h3><p>Events you mark as joined after they happen will show up here.</p></div>
                  ) : past.map((e) => (
                    <MyEventCard key={e.id} event={e} onOpen={setEventModal} onJoinToggle={(ev) => updateTechEvent({ ...ev, joined: !ev.joined })} onDelete={removeTechEvent} />
                  ));
                })()
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 12px' }}>
                <div className="section-title" style={{ marginBottom: 0 }}>Discover Nearby Events</div>
                <button onClick={() => fetchAI('tech_events')} disabled={loadingEvents}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 100, color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit' }}>
                  🔄 {loadingEvents ? 'Scanning…' : events.length ? 'Refresh' : 'Find events'}
                </button>
              </div>
              {events.length === 0 && !loadingEvents ? (
                <div className="empty-state"><div className="icon">📅</div><h3>Find tech events near you</h3><p>{location ? `Scanning around ${location.city}.` : 'Share your location above, then'} tap "Find events" for nearby meetups, conferences & demo days</p></div>
              ) : events.map((e) => (
                <DiscoverCard key={e.id} item={e} kind="event" onAdd={(item) => setEventModal({
                  title: item.name || '',
                  mode: item.mode === 'Online' || item.mode === 'online' ? 'online' : 'physical',
                  location: item.location || item.venue || '',
                  meet_link: item.url_hint ? `https://${item.url_hint.replace(/^https?:\/\//, '')}` : '',
                  topic: item.description || '',
                  date: item.date || item.deadline || todayISO(),
                  joined: false,
                })} />
              ))}
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
      {detailHack && (
        <HackDetailSheet hack={detailHack}
          onClose={() => setDetailHackId(null)}
          onEdit={() => { setHackModal(detailHack); setDetailHackId(null); }}
          onDelete={() => { removeHackathon(detailHack.id); setDetailHackId(null); }}
          onToggleTask={(tid) => toggleTask(detailHack, tid)}
          onAddTask={(text) => addTask(detailHack, text)}
          onDeleteTask={(tid) => deleteTask(detailHack, tid)}
          onSetStatus={(s) => changeHackStatus(detailHack, s)} />
      )}
      {projModal !== null && (
        <ProjectModal initial={projModal} onClose={() => setProjModal(null)} onSave={saveProjectForm} />
      )}
      {certModal !== null && (
        <CertificateModal initial={certModal} onClose={() => setCertModal(null)} onSave={saveCertForm} />
      )}
      {certDetail !== null && (
        <CertificateDetail
          cert={certDetail}
          onClose={() => setCertDetail(null)}
          onEdit={(c) => { setCertDetail(null); setCertModal(c); }}
          onDelete={(id) => { removeCertificate(id); setCertDetail(null); }}
        />
      )}
      {eventModal !== null && (
        <MyEventModal initial={eventModal} onClose={() => setEventModal(null)} onSave={saveEventForm} />
      )}
    </Layout>
  );
}
