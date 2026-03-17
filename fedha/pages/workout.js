import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Layout from '../components/Layout';
import { getSetting, setSetting } from '../lib/db';
import { todayISO } from '../lib/utils';
import { format } from 'date-fns';

// Load camera component only on client (no SSR — needs camera APIs)
const PoseCamera = dynamic(() => import('../components/PoseCamera'), { ssr: false });

// ─── EXERCISE LIBRARY ────────────────────────────────────────────────────────
const EXERCISES = {
  pushups:          { id:'pushups',          name:'Pushups',          emoji:'💪', muscle:'Chest · Triceps · Shoulders',   color:'#3B82F6', cameraHint:'Prop phone at floor level on your side. Full body visible.' },
  diamond_pushups:  { id:'diamond_pushups',  name:'Diamond Pushups',  emoji:'💎', muscle:'Inner Chest · Triceps',          color:'#8B5CF6', cameraHint:'Hands together under chest. Phone at floor level on side.' },
  wide_pushups:     { id:'wide_pushups',     name:'Wide Pushups',     emoji:'🤸', muscle:'Outer Chest · Shoulders',        color:'#06B6D4', cameraHint:'Hands wider than shoulders. Phone on your side at floor level.' },
  pike_pushups:     { id:'pike_pushups',     name:'Pike Pushups',     emoji:'🔺', muscle:'Shoulders · Upper Chest',        color:'#EC4899', cameraHint:'Hips up in V-shape. Phone on side. Full body visible.' },
  squats:           { id:'squats',           name:'Squats',           emoji:'🦵', muscle:'Quads · Glutes · Hamstrings',   color:'#10B981', cameraHint:'Stand sideways to phone. Full body must be in frame.' },
  lunges:           { id:'lunges',           name:'Lunges',           emoji:'🚶', muscle:'Quads · Glutes · Balance',       color:'#F59E0B', cameraHint:'Step forward alternating legs. Phone facing you from side.' },
  glute_bridges:    { id:'glute_bridges',    name:'Glute Bridges',    emoji:'🍑', muscle:'Glutes · Hamstrings · Core',    color:'#EF4444', cameraHint:'Lie on back. Phone on side at floor level. Raise hips.' },
  calf_raises:      { id:'calf_raises',      name:'Calf Raises',      emoji:'👟', muscle:'Calves · Ankles',               color:'#14B8A6', cameraHint:'Stand sideways to phone. Rise on tiptoes slowly.' },
  situps:           { id:'situps',           name:'Situps',           emoji:'🔥', muscle:'Abs · Core · Hip Flexors',      color:'#F97316', cameraHint:'Lie on back sideways to phone. Full body must be visible.' },
  mountain_climbers:{ id:'mountain_climbers',name:'Mountain Climbers',emoji:'🏔️', muscle:'Core · Shoulders · Cardio',     color:'#A78BFA', cameraHint:'Plank position sideways to phone. Drive knees to chest.' },
};

// ─── WEEKLY PLAN ─────────────────────────────────────────────────────────────
// Each day: morning (strength) + evening (pump/tone)
// Reps are science-based for beginners building muscle: 3 sets, moderate reps

const WEEKLY_PLAN = [
  // Monday — CHEST DAY
  {
    day: 'Monday', focus: 'Chest Day 💪', theme: '#3B82F6',
    morning: {
      title: 'Morning Power',
      exercises: [
        { ...EXERCISES.wide_pushups,     sets: 3, reps: 15 },
        { ...EXERCISES.pushups,          sets: 3, reps: 20 },
        { ...EXERCISES.diamond_pushups,  sets: 3, reps: 12 },
        { ...EXERCISES.pike_pushups,     sets: 3, reps: 10 },
      ],
    },
    evening: {
      title: 'Evening Core',
      exercises: [
        { ...EXERCISES.situps,           sets: 3, reps: 25 },
        { ...EXERCISES.mountain_climbers,sets: 3, reps: 20 },
        { ...EXERCISES.pushups,          sets: 2, reps: 15 },
      ],
    },
  },
  // Tuesday — LEG DAY
  {
    day: 'Tuesday', focus: 'Leg Day 🦵', theme: '#10B981',
    morning: {
      title: 'Morning Strength',
      exercises: [
        { ...EXERCISES.squats,           sets: 4, reps: 20 },
        { ...EXERCISES.lunges,           sets: 3, reps: 12 },
        { ...EXERCISES.glute_bridges,    sets: 3, reps: 15 },
        { ...EXERCISES.calf_raises,      sets: 3, reps: 25 },
      ],
    },
    evening: {
      title: 'Evening Tone',
      exercises: [
        { ...EXERCISES.squats,           sets: 2, reps: 20 },
        { ...EXERCISES.glute_bridges,    sets: 3, reps: 20 },
        { ...EXERCISES.calf_raises,      sets: 2, reps: 30 },
      ],
    },
  },
  // Wednesday — UPPER BODY
  {
    day: 'Wednesday', focus: 'Upper Body 🤸', theme: '#8B5CF6',
    morning: {
      title: 'Morning Push',
      exercises: [
        { ...EXERCISES.pushups,          sets: 4, reps: 20 },
        { ...EXERCISES.pike_pushups,     sets: 3, reps: 12 },
        { ...EXERCISES.diamond_pushups,  sets: 3, reps: 15 },
        { ...EXERCISES.wide_pushups,     sets: 3, reps: 15 },
      ],
    },
    evening: {
      title: 'Evening Core + Legs',
      exercises: [
        { ...EXERCISES.situps,           sets: 3, reps: 25 },
        { ...EXERCISES.squats,           sets: 2, reps: 20 },
        { ...EXERCISES.mountain_climbers,sets: 3, reps: 20 },
      ],
    },
  },
  // Thursday — LOWER BODY
  {
    day: 'Thursday', focus: 'Lower Body 🦵', theme: '#F59E0B',
    morning: {
      title: 'Morning Grind',
      exercises: [
        { ...EXERCISES.squats,           sets: 4, reps: 25 },
        { ...EXERCISES.lunges,           sets: 3, reps: 15 },
        { ...EXERCISES.glute_bridges,    sets: 4, reps: 20 },
        { ...EXERCISES.calf_raises,      sets: 3, reps: 30 },
      ],
    },
    evening: {
      title: 'Evening Burn',
      exercises: [
        { ...EXERCISES.mountain_climbers,sets: 3, reps: 25 },
        { ...EXERCISES.situps,           sets: 3, reps: 20 },
        { ...EXERCISES.squats,           sets: 2, reps: 20 },
      ],
    },
  },
  // Friday — CHEST BLAST
  {
    day: 'Friday', focus: 'Chest Blast 🔥', theme: '#EF4444',
    morning: {
      title: 'Morning Blast',
      exercises: [
        { ...EXERCISES.pushups,          sets: 4, reps: 25 },
        { ...EXERCISES.wide_pushups,     sets: 3, reps: 20 },
        { ...EXERCISES.diamond_pushups,  sets: 3, reps: 15 },
        { ...EXERCISES.pike_pushups,     sets: 3, reps: 12 },
      ],
    },
    evening: {
      title: 'Evening Core Finish',
      exercises: [
        { ...EXERCISES.situps,           sets: 4, reps: 30 },
        { ...EXERCISES.mountain_climbers,sets: 3, reps: 25 },
        { ...EXERCISES.pushups,          sets: 2, reps: 20 },
      ],
    },
  },
  // Saturday — FULL BODY
  {
    day: 'Saturday', focus: 'Full Body 💥', theme: '#EC4899',
    morning: {
      title: 'Morning Full Body',
      exercises: [
        { ...EXERCISES.squats,           sets: 3, reps: 20 },
        { ...EXERCISES.pushups,          sets: 3, reps: 20 },
        { ...EXERCISES.lunges,           sets: 3, reps: 12 },
        { ...EXERCISES.situps,           sets: 3, reps: 20 },
        { ...EXERCISES.calf_raises,      sets: 2, reps: 25 },
      ],
    },
    evening: {
      title: 'Evening Pump',
      exercises: [
        { ...EXERCISES.diamond_pushups,  sets: 3, reps: 15 },
        { ...EXERCISES.glute_bridges,    sets: 3, reps: 20 },
        { ...EXERCISES.mountain_climbers,sets: 2, reps: 20 },
      ],
    },
  },
  // Sunday — ACTIVE RECOVERY
  {
    day: 'Sunday', focus: 'Recovery 🙏', theme: '#14B8A6',
    morning: {
      title: 'Light Morning',
      exercises: [
        { ...EXERCISES.squats,           sets: 2, reps: 15 },
        { ...EXERCISES.calf_raises,      sets: 2, reps: 20 },
        { ...EXERCISES.situps,           sets: 2, reps: 15 },
      ],
    },
    evening: {
      title: 'Rest Evening',
      exercises: [],
      isRest: true,
    },
  },
];

// ─── EXERCISE CARD ────────────────────────────────────────────────────────────
function ExerciseCard({ ex, sessionKey, completedSets, onStartSet }) {
  const doneSets = completedSets[`${sessionKey}_${ex.id}`] || 0;
  const isComplete = doneSets >= ex.sets;
  const totalReps = ex.sets * ex.reps;

  return (
    <div className="card" style={{ padding: '14px 16px', borderLeft: `3px solid ${ex.color}`, opacity: isComplete ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${ex.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
          {isComplete ? '✅' : ex.emoji}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: isComplete ? 'var(--text-3)' : 'var(--text)', textDecoration: isComplete ? 'line-through' : 'none' }}>
            {ex.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{ex.muscle}</div>
          <div style={{ fontSize: 12, color: ex.color, fontWeight: 600, marginTop: 2 }}>
            {ex.sets} sets × {ex.reps} reps = {totalReps} total
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
            {doneSets}/{ex.sets} sets
          </div>
          {!isComplete ? (
            <button
              onClick={() => onStartSet(ex, doneSets + 1)}
              style={{ padding: '8px 14px', background: ex.color, border: 'none', borderRadius: 10, color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit' }}>
              {doneSets === 0 ? 'Start 📷' : `Set ${doneSets + 1} 📷`}
            </button>
          ) : (
            <div style={{ padding: '8px 14px', background: 'var(--green-dim)', borderRadius: 10, fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>Done ✓</div>
          )}
        </div>
      </div>

      {/* Set progress dots */}
      {ex.sets > 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {[...Array(ex.sets)].map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 100, background: i < doneSets ? ex.color : 'var(--border)' }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function WorkoutPage() {
  const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const [activeDay, setActiveDay] = useState(todayIdx);
  const [session, setSession] = useState('morning');
  const [completedSets, setCompletedSets] = useState({});
  const [streak, setStreak] = useState(0);
  const [camera, setCamera] = useState(null); // { ex, set }

  const plan = WEEKLY_PLAN[activeDay];
  const sessionData = plan[session];

  useEffect(() => {
    async function load() {
      const done = await getSetting(`workout_${todayISO()}`, {});
      if (done) setCompletedSets(done);
      const s = await getSetting('workout_streak', 0);
      setStreak(s || 0);
    }
    load();
  }, []);

  async function handleSetComplete(ex, setNum) {
    const key = `${session}_${ex.id}`;
    const updated = { ...completedSets, [key]: setNum };
    setCompletedSets(updated);
    await setSetting(`workout_${todayISO()}`, updated);

    // Check if full session complete for streak
    const allDone = sessionData.exercises.every(e => (updated[`${session}_${e.id}`] || 0) >= e.sets);
    if (allDone) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      await setSetting('workout_streak', newStreak);
    }

    setCamera(null);
  }

  function startSet(ex, setNum) {
    setCamera({ ex, setNum });
  }

  const totalSets = sessionData.exercises.reduce((s, e) => s + e.sets, 0);
  const doneSets = sessionData.exercises.reduce((s, e) => s + Math.min(e.sets, completedSets[`${session}_${e.id}`] || 0), 0);
  const sessionPct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;
  const sessionComplete = totalSets > 0 && doneSets >= totalSets;

  return (
    <Layout fab={false}>
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>Workout 🏋️</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20 }}>
              <span style={{ fontSize: 16 }}>🔥</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B' }}>{streak} day streak</span>
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
            {format(new Date(), 'EEEE, d MMMM')}
          </div>

          {/* Day selector */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginBottom: 12 }}>
            {WEEKLY_PLAN.map((p, i) => (
              <button key={p.day} className={`chip ${activeDay === i ? 'active' : ''}`} onClick={() => setActiveDay(i)} style={{ flexShrink: 0,
                ...(activeDay === i ? { background: `${p.theme}20`, borderColor: p.theme, color: p.theme } : {}) }}>
                {p.day.slice(0, 3)}
              </button>
            ))}
          </div>

          {/* Focus badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: `${plan.theme}12`, border: `1px solid ${plan.theme}30`, borderRadius: 10, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: plan.theme }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: plan.theme }}>{plan.focus}</div>
          </div>

          {/* Morning / Evening toggle */}
          <div style={{ display: 'flex', gap: 8 }}>
            {['morning', 'evening'].map(s => {
              const sd = plan[s];
              const sdSets = sd.exercises.reduce((t, e) => t + e.sets, 0);
              const sdDone = sd.exercises.reduce((t, e) => t + Math.min(e.sets, completedSets[`${s}_${e.id}`] || 0), 0);
              const sdComplete = sdSets > 0 && sdDone >= sdSets;
              return (
                <button key={s} className={`chip ${session === s ? 'active' : ''}`} onClick={() => setSession(s)}
                  style={session === s ? { background: `${plan.theme}20`, borderColor: plan.theme, color: plan.theme } : {}}>
                  {s === 'morning' ? '🌅' : '🌙'} {s === 'morning' ? 'Morning' : 'Evening'}
                  {sdComplete && <span style={{ marginLeft: 4 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: '0 20px' }}>
          {/* Session progress */}
          {!sessionData.isRest && totalSets > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{sessionData.title}</div>
                <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>{doneSets}/{totalSets} sets · {sessionPct}%</div>
              </div>
              <div style={{ background: 'var(--border)', borderRadius: 100, height: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 100, background: sessionComplete ? 'var(--green)' : plan.theme, width: `${sessionPct}%`, transition: 'width 0.4s' }} />
              </div>
              {sessionComplete && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, fontSize: 14, fontWeight: 600, color: 'var(--green)', textAlign: 'center' }}>
                  🎉 Session complete! Rest and eat your protein.
                </div>
              )}
            </div>
          )}

          {/* Exercise list */}
          {sessionData.isRest ? (
            <div className="empty-state" style={{ paddingTop: 40 }}>
              <div className="icon">🙏</div>
              <h3>Rest Evening</h3>
              <p>Your muscles grow during rest. Stretch, eat well, sleep 9 hours.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {sessionData.exercises.map(ex => (
                <ExerciseCard
                  key={ex.id}
                  ex={ex}
                  sessionKey={session}
                  completedSets={completedSets}
                  onStartSet={startSet}
                />
              ))}
            </div>
          )}

          {/* How it works tip */}
          {!sessionData.isRest && (
            <div className="card" style={{ padding: '14px 16px', marginBottom: 24 }}>
              <div className="section-title" style={{ marginBottom: 10 }}>HOW IT WORKS</div>
              {[
                '📷 Tap Start — your camera opens with AI skeleton tracking',
                '🤖 Move and the AI counts your reps automatically using joint angles',
                '⬇⬆ Screen shows your phase (down/up) and joint angle live',
                '🎉 Hit target reps and it auto-moves to next set',
                '📐 Position your phone sideways at floor level for best accuracy',
              ].map((tip, i) => (
                <div key={i} style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6, lineHeight: 1.5 }}>{tip}</div>
              ))}
            </div>
          )}

          {/* Weekly overview */}
          <div style={{ marginBottom: 24 }}>
            <div className="section-title" style={{ marginBottom: 10 }}>WEEK OVERVIEW</div>
            <div className="card" style={{ overflow: 'hidden' }}>
              {WEEKLY_PLAN.map((p, i) => {
                const isToday = i === todayIdx;
                const isActive = i === activeDay;
                return (
                  <div key={p.day} onClick={() => setActiveDay(i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: i < 6 ? '1px solid var(--border)' : 'none', background: isActive ? `${p.theme}10` : 'transparent', cursor: 'pointer' }}>
                    <div style={{ width: 32, fontSize: 13, fontWeight: isToday ? 700 : 500, color: isActive ? p.theme : 'var(--text-2)', flexShrink: 0 }}>
                      {p.day.slice(0, 3)}{isToday ? ' •' : ''}
                    </div>
                    <div style={{ flex: 1, fontSize: 13, color: isActive ? p.theme : 'var(--text-2)', fontWeight: isActive ? 600 : 400 }}>{p.focus}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {p.morning.exercises.length + p.evening.exercises.filter(e => !p.evening.isRest).length} exercises
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Camera modal */}
      {camera && (
        <PoseCamera
          exercise={camera.ex}
          targetReps={camera.ex.reps}
          set={camera.setNum}
          totalSets={camera.ex.sets}
          onComplete={() => handleSetComplete(camera.ex, camera.setNum)}
          onClose={() => setCamera(null)}
        />
      )}
    </Layout>
  );
}
