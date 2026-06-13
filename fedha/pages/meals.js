import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import FoodLogModal from '../components/FoodLogModal';
import { genId, todayISO } from '../lib/utils';
import { getFoodLogs, saveFoodLog, deleteFoodLog, getSetting, setSetting } from '../lib/db';
import { MEAL_SLOTS, defaultSlotForHour } from '../lib/foods';

const WATER_GOAL = 8; // glasses

function addDays(iso, delta) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().split('T')[0];
}

function prettyDate(iso) {
  const today = todayISO();
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function FoodDiaryPage() {
  const [date, setDate] = useState(todayISO());
  const [logs, setLogs] = useState(null);          // entries for selected date
  const [allLogs, setAllLogs] = useState([]);      // every entry (streak + chart)
  const [calorieGoal, setCalorieGoal] = useState(2800);
  const [proteinGoal, setProteinGoal] = useState(120);
  const [water, setWater] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const [logSlot, setLogSlot] = useState('breakfast');
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('2800');
  const [proteinDraft, setProteinDraft] = useState('120');

  const reloadAll = useCallback(async () => {
    const all = await getFoodLogs();
    setAllLogs(all);
  }, []);

  const reloadDay = useCallback(async (d) => {
    const [dayLogs, w] = await Promise.all([
      getFoodLogs(d),
      getSetting(`water_${d}`, 0),
    ]);
    setLogs(dayLogs);
    setWater(Number(w) || 0);
  }, []);

  // Initial load
  useEffect(() => {
    async function init() {
      const [cg, pg] = await Promise.all([
        getSetting('calorie_goal', 2800),
        getSetting('protein_goal', 120),
      ]);
      setCalorieGoal(Number(cg));
      setProteinGoal(Number(pg));
      setGoalDraft(String(cg));
      setProteinDraft(String(pg));
      await reloadAll();
    }
    init();
  }, [reloadAll]);

  // Reload whenever the date changes
  useEffect(() => {
    reloadDay(date);
  }, [date, reloadDay]);

  async function handleAdd(item) {
    const entry = {
      id: genId(),
      date,
      created_at: new Date().toISOString(),
      ...item,
    };
    await saveFoodLog(entry);
    await Promise.all([reloadDay(date), reloadAll()]);
  }

  async function handleDelete(id) {
    await deleteFoodLog(id);
    await Promise.all([reloadDay(date), reloadAll()]);
  }

  async function changeWater(delta) {
    const next = Math.max(0, water + delta);
    setWater(next);
    await setSetting(`water_${date}`, next);
  }

  async function saveGoals() {
    const cg = Math.max(500, Number(goalDraft) || 2800);
    const pg = Math.max(20, Number(proteinDraft) || 120);
    setCalorieGoal(cg);
    setProteinGoal(pg);
    await Promise.all([setSetting('calorie_goal', cg), setSetting('protein_goal', pg)]);
    setEditingGoal(false);
  }

  function openLog(slot) {
    setLogSlot(slot || defaultSlotForHour(new Date().getHours()));
    setShowLog(true);
  }

  // ─── Loading skeleton ──
  if (!logs) {
    return (
      <Layout onFab={() => openLog()}>
        <div style={{ padding: '80px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 16 }} />)}
        </div>
      </Layout>
    );
  }

  // ─── Derived totals ──
  const eatenCal = logs.reduce((s, l) => s + l.cal * (l.qty || 1), 0);
  const eatenProtein = logs.reduce((s, l) => s + l.protein * (l.qty || 1), 0);
  const remainingCal = calorieGoal - eatenCal;
  const calPct = Math.min(100, Math.round((eatenCal / calorieGoal) * 100));
  const proteinPct = Math.min(100, Math.round((eatenProtein / proteinGoal) * 100));

  // Streak: consecutive days (ending today) with at least one entry
  const loggedDates = new Set(allLogs.map((l) => l.date));
  let streak = 0;
  let cursor = todayISO();
  // allow streak to still count if today not yet logged but yesterday was
  if (!loggedDates.has(cursor)) cursor = addDays(cursor, -1);
  while (loggedDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  // Last 7 days calories for the mini chart
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(todayISO(), -i);
    const cal = allLogs.filter((l) => l.date === d).reduce((s, l) => s + l.cal * (l.qty || 1), 0);
    const label = new Date(d + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short' }).slice(0, 1);
    week.push({ d, cal, label });
  }
  const weekMax = Math.max(calorieGoal, ...week.map((w) => w.cal));

  const ringColor = calPct >= 100 ? 'var(--green)' : calPct >= 70 ? 'var(--yellow)' : 'var(--blue)';
  const circumference = 2 * Math.PI * 52;

  return (
    <Layout onFab={() => openLog()}>
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>Food Diary 🍽️</h1>
            {streak > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 100 }}>
                <span style={{ fontSize: 14 }}>🔥</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--yellow)' }}>{streak} day{streak > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>

          {/* Date navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <button className="btn-icon" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>{prettyDate(date)}</div>
            <button
              className="btn-icon"
              onClick={() => setDate(addDays(date, 1))}
              disabled={date >= todayISO()}
              style={{ opacity: date >= todayISO() ? 0.35 : 1 }}
              aria-label="Next day"
            >›</button>
          </div>
        </div>

        <div style={{ padding: '0 20px' }}>
          {/* Calorie ring summary */}
          <div className="card" style={{ padding: '20px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
              <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="10" />
                <circle
                  cx="60" cy="60" r="52" fill="none" stroke={ringColor} strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - (calPct / 100) * circumference}
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div className="font-num" style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{eatenCal.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>of {calorieGoal.toLocaleString()}</div>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 2 }}>
                {remainingCal >= 0 ? 'Calories left' : 'Over by'}
              </div>
              <div className="font-num" style={{ fontSize: 26, fontWeight: 700, color: remainingCal >= 0 ? 'var(--green)' : 'var(--red)', marginBottom: 12 }}>
                {Math.abs(remainingCal).toLocaleString()}
              </div>

              {/* Protein bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                <span style={{ color: 'var(--text-2)' }}>Protein</span>
                <span className="font-num" style={{ color: 'var(--text-2)' }}>{Math.round(eatenProtein)} / {proteinGoal}g</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${proteinPct}%`, background: 'var(--blue)' }} />
              </div>

              <button
                onClick={() => setEditingGoal(true)}
                style={{ marginTop: 12, fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Outfit', textDecoration: 'underline' }}
              >
                Edit goals
              </button>
            </div>
          </div>

          {/* Goal editor */}
          {editingGoal && (
            <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
              <div className="section-title" style={{ marginBottom: 10 }}>Daily Goals</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Calories</label>
                  <input className="input font-num" type="number" inputMode="numeric" value={goalDraft} onChange={(e) => setGoalDraft(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Protein (g)</label>
                  <input className="input font-num" type="number" inputMode="numeric" value={proteinDraft} onChange={(e) => setProteinDraft(e.target.value)} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
                💡 For weight + muscle gain, aim for a calorie surplus (try 2,800–3,200) and 100g+ protein daily.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-ghost" onClick={() => setEditingGoal(false)} style={{ padding: '10px' }}>Cancel</button>
                <button className="btn-primary" onClick={saveGoals} style={{ padding: '10px' }}>Save goals</button>
              </div>
            </div>
          )}

          {/* Water tracker */}
          <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>💧</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Water</span>
              </div>
              <span className="font-num" style={{ fontSize: 13, color: 'var(--text-2)' }}>{water} / {WATER_GOAL} glasses</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 5, flex: 1, flexWrap: 'wrap' }}>
                {[...Array(WATER_GOAL)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => changeWater(i < water ? -(water - i) : (i + 1 - water))}
                    aria-label={`Set water to ${i + 1}`}
                    style={{
                      width: 26, height: 32, borderRadius: 6, cursor: 'pointer',
                      border: `1px solid ${i < water ? '#3B82F6' : 'var(--border)'}`,
                      background: i < water ? 'rgba(59,130,246,0.25)' : 'var(--card-2)',
                      fontSize: 14, lineHeight: 1, transition: 'all 0.15s',
                    }}
                  >{i < water ? '💧' : ''}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Meals by slot */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {MEAL_SLOTS.map((s) => {
              const items = logs.filter((l) => l.slot === s.id);
              const slotCal = items.reduce((sum, l) => sum + l.cal * (l.qty || 1), 0);
              return (
                <div key={s.id} className="card" style={{ padding: '14px 16px', borderLeft: `3px solid ${s.color}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: items.length ? 10 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: s.color, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>{s.icon} {s.label}</span>
                      {slotCal > 0 && <span className="font-num" style={{ fontSize: 12, color: 'var(--text-3)' }}>{slotCal.toLocaleString()} cal</span>}
                    </div>
                    <button
                      onClick={() => openLog(s.id)}
                      style={{ background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 12px', fontSize: 13, color: s.color, cursor: 'pointer', fontFamily: 'Outfit', fontWeight: 600 }}
                    >+ Add</button>
                  </div>

                  {items.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-3)', paddingTop: 6 }}>Nothing logged yet</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {items.map((l) => (
                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                          <span style={{ fontSize: 17, flexShrink: 0 }}>{l.icon || '🍽️'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {l.name}{(l.qty || 1) > 1 ? ` ×${l.qty}` : ''}
                            </div>
                            <div className="font-num" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                              {(l.cal * (l.qty || 1)).toLocaleString()} cal · {Math.round(l.protein * (l.qty || 1))}g protein
                            </div>
                          </div>
                          <button
                            onClick={() => handleDelete(l.id)}
                            aria-label={`Remove ${l.name}`}
                            style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 16, padding: 4, flexShrink: 0 }}
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 7-day chart */}
          <div className="card" style={{ padding: '16px', marginBottom: 24 }}>
            <div className="section-title" style={{ marginBottom: 14 }}>LAST 7 DAYS</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, height: 120 }}>
              {week.map((w) => {
                const h = weekMax > 0 ? Math.max(4, Math.round((w.cal / weekMax) * 100)) : 4;
                const hitGoal = w.cal >= calorieGoal;
                const isSel = w.d === date;
                return (
                  <button
                    key={w.d}
                    onClick={() => setDate(w.d)}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', height: '100%', justifyContent: 'flex-end' }}
                  >
                    <span className="font-num" style={{ fontSize: 9, color: 'var(--text-3)' }}>{w.cal > 0 ? (w.cal >= 1000 ? (w.cal / 1000).toFixed(1) + 'k' : w.cal) : ''}</span>
                    <div
                      style={{
                        width: '100%', maxWidth: 28, height: `${h}%`, borderRadius: 6,
                        background: hitGoal ? 'var(--green)' : 'var(--blue)',
                        opacity: isSel ? 1 : 0.55, transition: 'opacity 0.2s',
                      }}
                    />
                    <span style={{ fontSize: 11, color: isSel ? 'var(--text)' : 'var(--text-3)', fontWeight: isSel ? 700 : 400 }}>{w.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {showLog && (
        <FoodLogModal
          slot={logSlot}
          onClose={() => setShowLog(false)}
          onAdd={handleAdd}
        />
      )}
    </Layout>
  );
}
