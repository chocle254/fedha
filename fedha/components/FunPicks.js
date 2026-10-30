import { useEffect, useMemo, useState } from 'react';
import { getSetting, setSetting } from '../lib/db';
import { weatherLabel } from '../lib/day-anchors';

const pad = (n) => String(n).padStart(2, '0');
const m2t = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const t2m = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const fmt12 = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const SOFT = new Set(['gaming', 'personal']); // blocks fun can replace (free time, gaming, breaks)
const CAT = { outdoor: '🌳', food: '🍽', social: '🫂', learning: '📚', creative: '🎨', chill: '😌', tech: '💻', active: '⚡' };

// Free windows left today: gaps in the plan plus soft blocks (free time, gaming), from now until 22:00.
export function freeWindows(blocks, nowMin) {
  const hard = blocks
    .filter((b) => b.type !== 'sleep' && (!SOFT.has(b.type) || b.fun))
    .map((b) => [t2m(b.time), t2m(b.time) + Number(b.duration || 0)])
    .sort((a, b) => a[0] - b[0]);
  const start = Math.ceil((nowMin + 20) / 15) * 15;
  const end = 22 * 60;
  const out = [];
  let cursor = start;
  for (const [s, e] of hard) {
    if (e <= cursor) continue;
    if (s > cursor && s - cursor >= 45) out.push([cursor, Math.min(s, end)]);
    cursor = Math.max(cursor, e);
    if (cursor >= end) break;
  }
  if (end - cursor >= 45) out.push([cursor, end]);
  return out.filter(([s, e]) => e - s >= 45);
}

function windowWeather(weather, s, e) {
  const hrs = (weather?.hours || []).filter((h) => h.m >= Math.floor(s / 60) * 60 && h.m < e);
  if (!hrs.length) return '';
  const feels = Math.round(hrs.reduce((a, h) => a + h.feels, 0) / hrs.length);
  const rain = Math.max(...hrs.map((h) => h.rain));
  return `${feels}°C feels-like, ${rain}% rain${rain >= 50 ? ' (go indoors)' : ''}${s >= 18 * 60 ? ', dark after sunset' : ''}`;
}

// "Fun for today": AI picks real things to do near you that fit your free time, the weather and your money,
// and one tap schedules a pick into the Planner.
export default function FunPicks({ blocks, weather, homeLoc, floating, currency, nowMin, added, onAdd, onRemove }) {
  const [picks, setPicks] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(true);

  const windows = useMemo(() => freeWindows(blocks, nowMin), [blocks, nowMin]);
  const budget = Math.max(0, Math.round((Number(floating) || 0) * 0.15 / 50) * 50);
  const sym = currency === 'KES' ? 'KSh ' : `${currency} `;

  useEffect(() => { getSetting(`fun_picks_${todayKey()}`, null).then((p) => p && setPicks(p)); }, []);

  async function generate() {
    setBusy(true); setErr('');
    try {
      const w = windows.map(([s, e]) => ({ start: m2t(s), end: m2t(e), minutes: e - s, weather: windowWeather(weather, s, e) }));
      const weatherText = weather?.now ? `${weatherLabel(weather.now.code)}, now ${Math.round(weather.now.temp)}°C, ${Math.round(weather.min)}–${Math.round(weather.max)}°C today, sunset ${weather.sunset}` : '';
      const r = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'fun_plan', windows: w, weatherText, budget, currency, currency_symbol: sym,
          dayName: new Date().toLocaleDateString('en-GB', { weekday: 'long' }),
          location: homeLoc ? { city: String(homeLoc.name).split(',')[0], lat: homeLoc.lat, lng: homeLoc.lon } : null,
          nonce: Date.now(),
        }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || 'Could not plan fun right now.');
      // Keep only picks that really fit a free window and the budget.
      const fits = (j.results || []).filter((p) => {
        const s = t2m(p.start);
        const e = s + (Number(p.duration) || 60);
        return windows.some(([ws, we]) => s >= ws && e <= we + 15) && (Number(p.cost) || 0) <= Math.max(budget, 0) + 1;
      });
      const data = { at: Date.now(), budget, results: fits.length ? fits : (j.results || []).filter((p) => (Number(p.cost) || 0) <= budget + 1) };
      setPicks(data);
      await setSetting(`fun_picks_${todayKey()}`, data);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const addedIds = new Set((added || []).map((a) => a.title));

  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 14, borderColor: 'rgba(236,72,153,0.35)', background: 'linear-gradient(135deg, rgba(236,72,153,0.08), rgba(59,130,246,0.06))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 24 }}>🎉</span>
        <div style={{ flex: 1, minWidth: 0 }} onClick={() => setOpen((v) => !v)}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Fun for today</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
            {windows.length ? `${windows.length} free window${windows.length > 1 ? 's' : ''} · budget ${sym}${budget.toLocaleString()}${budget < 200 ? ' (free ideas)' : ''} · ${homeLoc ? String(homeLoc.name).split(',')[0] : 'set location'}` : 'No free windows left today'}
          </div>
        </div>
        <button onClick={generate} disabled={busy || !windows.length} style={{ width: 'auto', flexShrink: 0, padding: '8px 14px', background: 'linear-gradient(135deg, #EC4899, #8B5CF6)', border: 0, borderRadius: 100, color: '#fff', fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'Onest', opacity: busy || !windows.length ? 0.6 : 1 }}>
          {busy ? 'Finding…' : picks ? '↻ New ideas' : 'Find fun'}
        </button>
      </div>

      {open && windows.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {windows.map(([s, e]) => (
            <span key={s} className="font-num" title={windowWeather(weather, s, e)} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 100, background: 'var(--card-2)', color: 'var(--text-2)' }}>
              🕐 {fmt12(m2t(s))}–{fmt12(m2t(e))}
            </span>
          ))}
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 10 }}>⚠ {err}</div>}

      {(added || []).length > 0 && (
        <div style={{ marginTop: 10 }}>
          {added.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginTop: 6, borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', fontSize: 12.5 }}>
              <span>{a.emoji}</span>
              <span style={{ flex: 1 }}><b>{fmt12(a.time)}</b> · {a.label}</span>
              <button onClick={() => onRemove(a.id)} style={{ background: 'none', border: 0, color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {open && picks?.results?.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8, marginTop: 12 }}>
          {picks.results.map((p, i) => {
            const isAdded = addedIds.has(p.title);
            return (
              <div key={i} style={{ padding: 12, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 22 }}>{p.emoji || CAT[p.category] || '✨'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>{p.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{p.place}{p.area ? ` · ${p.area}` : ''}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <span className="font-num" style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'var(--card-2)', color: 'var(--text-2)' }}>🕐 {fmt12(p.start)} · {p.duration}m</span>
                  <span className="font-num" style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: Number(p.cost) ? 'rgba(245,158,11,0.12)' : 'var(--green-dim)', color: Number(p.cost) ? '#F59E0B' : 'var(--green)' }}>{Number(p.cost) ? `${sym}${Number(p.cost).toLocaleString()}` : 'Free'}</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'var(--card-2)', color: 'var(--text-2)' }}>{p.indoor ? '🏠 Indoor' : '🌤 Outdoor'}</span>
                  {p.vibe && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'var(--card-2)', color: 'var(--text-2)' }}>{p.vibe === 'solo' ? '🧘 Solo' : p.vibe === 'social' ? '🫂 Social' : '🙂 Low-key social'}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>{p.why}</div>
                {p.tip && <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.45 }}>💡 {p.tip}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 4, alignItems: 'center' }}>
                  {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>details</a>}
                  <span style={{ flex: 1 }} />
                  <button disabled={isAdded} onClick={() => onAdd(p)} style={{ width: 'auto', padding: '6px 12px', borderRadius: 100, border: 0, background: isAdded ? 'var(--card-2)' : 'var(--green)', color: isAdded ? 'var(--text-3)' : '#04140D', fontSize: 12, fontWeight: 700, cursor: isAdded ? 'default' : 'pointer', fontFamily: 'Onest' }}>{isAdded ? 'Added ✓' : '+ Add to today'}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {open && picks && !picks.results?.length && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>Nothing fit your free time and budget today. Try again later, or free up a window.</div>}
    </div>
  );
}
