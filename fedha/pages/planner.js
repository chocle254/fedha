import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { getSetting, setSetting } from '../lib/db';
import { todayISO, computeJobProgress } from '../lib/utils';
import { hackStatus, isUrgent, projectStatus } from './tech-hub';
import { WEEKLY_PLAN, weekdayPlanIndex, estimateWorkoutMinutes, exerciseSummary } from './workout';
import { format } from 'date-fns';

// ─── DAY ANCHORS ───────────────────────────────────────────────────────────
// Bedtime is a protected window, not a "whatever's left after everything
// else" afterthought — the schedule is built backward from this, and lower-
// priority blocks (gaming, free time, then chores, then work) get shrunk or
// dropped entirely if the day doesn't fit before it, rather than ever
// pushing sleep later. See buildTodayBlocks() for the allocation logic.
const WEEKDAY_WAKE = 8 * 60;         // 08:00
const WEEKEND_WAKE = 9 * 60;         // 09:00
const BEDTIME_EARLIEST = 22 * 60;    // 22:00 (10pm) — sleep can start here if the day's light
const BEDTIME_LATEST = 23 * 60;      // 23:00 (11pm) — absolute latest bedtime, even on a packed day
const MIN_SLEEP_MINUTES = 7 * 60;    // never schedule less than 7h sleep before the next wake time

const TYPE_COLORS = {
  routine:  { bg:'rgba(99,102,241,0.12)',  border:'rgba(99,102,241,0.35)',  text:'#818CF8', dot:'#6366F1' },
  meal:     { bg:'rgba(245,158,11,0.12)',  border:'rgba(245,158,11,0.35)',  text:'#FCD34D', dot:'#F59E0B' },
  coding:   { bg:'rgba(16,185,129,0.12)', border:'rgba(16,185,129,0.35)', text:'#6EE7B7', dot:'#10B981' },
  personal: { bg:'rgba(236,72,153,0.12)', border:'rgba(236,72,153,0.35)', text:'#F9A8D4', dot:'#EC4899' },
  chores:   { bg:'rgba(234,179,8,0.12)',  border:'rgba(234,179,8,0.35)',   text:'#FDE047', dot:'#EAB308' },
  workout:  { bg:'rgba(239,68,68,0.12)',  border:'rgba(239,68,68,0.35)',   text:'#FCA5A5', dot:'#EF4444' },
  health:   { bg:'rgba(6,182,212,0.12)',  border:'rgba(6,182,212,0.35)',   text:'#67E8F9', dot:'#06B6D4' },
  gaming:   { bg:'rgba(167,139,250,0.12)',border:'rgba(167,139,250,0.35)', text:'#C4B5FD', dot:'#A78BFA' },
  sleep:    { bg:'rgba(30,41,59,0.5)',    border:'rgba(51,65,85,0.5)',     text:'#475569', dot:'#334155' },
};
const TYPE_LABELS = { routine:'Routine', meal:'Meal', coding:'Work', personal:'Personal', chores:'Chores', workout:'Workout', health:'Health', gaming:'Gaming', sleep:'Sleep' };

const NOTIF_MSGS = {
  routine: (b) => ({ title:'⏰ ' + b.label.toUpperCase(), body: b.note }),
  meal: (b) => ({ title: b.label.includes('Eat') ? '🍽️ TIME TO EAT' : '🍳 START COOKING NOW', body: b.label.includes('Eat') ? `${b.emoji} ${b.label} — eat properly, no phone` : `Cook now so food is ready on time. Check Meals tab.` }),
  coding: (b) => ({ title:`💻 ${b.label}`, body:`Phone away. ${b.note}` }),
  personal: (b) => ({ title: b.label.includes('Bae') ? '💕 BAE TIME' : '🎧 FREE TIME', body: b.note }),
  chores: (b) => ({ title:'🏠 CHORES TIME', body: b.note }),
  workout: (b) => ({ title:`🏋️ ${b.label}`, body: b.note }),
  health: (b) => ({ title:`🛁 ${b.label}`, body: b.note }),
  gaming: (b) => ({ title:'🎮 GAMING TIME', body: b.note }),
  sleep: (b) => ({ title:'😴 TIME TO SLEEP', body: b.note }),
};

function t2m(t) { const [h,m] = t.split(':').map(Number); return h*60+m; }
function m2t(m) { return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }
function fmt12(t) { const [h,m] = t.split(':').map(Number); return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// ─── PICK WHAT TO WORK ON ───────────────────────────────────────────────────
// Looks at Tech Hub (hackathons, startups, personal projects) and My Jobs to
// figure out what actually deserves the day's deep-work blocks, in priority
// order: an urgent hackathon deadline beats a job, beats a startup, beats a
// side project, beats a generic "nothing active" fallback.
function getWorkPriorityItems({ hackathons, startups, projects, onlineJobs }) {
  const items = [];
  const urgentHacks = (hackathons || []).filter(isUrgent);
  const activeHacks = (hackathons || []).filter((h) => hackStatus(h) === 'active' && !isUrgent(h));
  const activeProjects = (projects || []).filter((p) => ['planning', 'in_progress'].includes(projectStatus(p)));

  if (urgentHacks.length) {
    const h = urgentHacks[0];
    items.push({ emoji: '🔥', label: `Hackathon Sprint — ${h.name}`, note: `Deadline closing soon${h.project_name ? ` — get ${h.project_name} submission-ready` : ''}. This is priority #1 today.` });
  } else if (activeHacks.length) {
    const h = activeHacks[0];
    items.push({ emoji: '🏆', label: `Hackathon Work — ${h.name}`, note: `Keep building${h.project_name ? ` on ${h.project_name}` : ''}. Check your task list in Tech Hub.` });
  }

  if ((onlineJobs || []).length) {
    const job = onlineJobs[0];
    let prog = null;
    try { prog = computeJobProgress(job); } catch { /* missing fields — skip the progress note */ }
    const who = `${job.name}${job.platform ? ` on ${job.platform}` : ''}`;
    const note = prog && !prog.metThreshold
      ? `${who} — ${prog.daysLeft} day${prog.daysLeft === 1 ? '' : 's'} left to hit this period's payout target.`
      : `${who} — log tasks in My Jobs as you go.`;
    items.push({ emoji: '💼', label: `Job Work — ${job.name}`, note });
  }

  if ((startups || []).length) {
    const s = startups[0];
    items.push({ emoji: '🚀', label: `Startup Work — ${s.name}`, note: `Move ${s.name} forward — check your stage checklist in Tech Hub.` });
  }

  if (activeProjects.length) {
    const p = activeProjects[0];
    items.push({ emoji: '🗂️', label: `Project Work — ${p.name}`, note: p.description || 'Keep building — log progress in Tech Hub when you wrap up.' });
  }

  if (!items.length) {
    items.push({ emoji: '💻', label: 'Deep Work Block', note: 'Nothing active in Tech Hub or My Jobs right now — good time to learn something new or start one.' });
  }
  return items;
}

function pickWork(items, i) {
  const base = items[i % items.length];
  const isRepeat = i >= items.length;
  return { ...base, label: isRepeat ? `${base.label} (continued)` : base.label };
}

// ─── SCHEDULE BUILDER ────────────────────────────────────────────────────────
// Two passes, not one:
//  1. Build a "wish list" of every block the day would ideally include, each
//     tagged with a priority tier and a [min, ideal] duration range. This is
//     just a description of what SHOULD happen — nothing is placed on the
//     clock yet, so nothing here can overflow into the night.
//  2. Fit that wish list into the actual minutes available between wake and
//     the latest acceptable bedtime. Essential items (sleep, meals, workouts)
//     always get their minimum. Everything else is shrunk toward its minimum,
//     then dropped entirely, lowest priority first, until the day fits.
// This replaces the old approach of pushing fixed-duration blocks one after
// another with no total budget check at all, which is exactly how a busy
// day (hackathon + job + startup + project all active) could push sleep to
// 3am — nothing was ever checking whether the day fit before bedtime.
const PRIORITY = { essential: 0, work: 1, chores: 2, social: 3, leisure: 4 };

function buildTodayBlocks(ctx, isWeekend) {
  const workItems = getWorkPriorityItems(ctx);
  const dayIdx = weekdayPlanIndex(new Date());
  const dayPlan = WEEKLY_PLAN[dayIdx];
  const morningWorkoutMin = estimateWorkoutMinutes(dayPlan.morning.exercises);
  const eveningWorkoutMin = dayPlan.evening.isRest ? 0 : estimateWorkoutMinutes(dayPlan.evening.exercises);

  const wake = isWeekend ? WEEKEND_WAKE : WEEKDAY_WAKE;

  // ── PASS 1: wish list ──────────────────────────────────────────────────
  // Each item: { id, label, type, emoji, note, priority, min, ideal, fixedAfter? }
  // `fixedAfter` marks conditional items whose note depends on runtime data
  // (workout titles, work item picks) computed above.
  const wish = [];
  const want = (id, label, type, emoji, note, priority, min, ideal = min) =>
    wish.push({ id, label, type, emoji, note, priority, min, ideal: Math.max(ideal, min) });

  want('wake', 'Wake Up — No Phone', 'routine', '⏰', 'First 20 mins phone-free. Drink water, stretch, wash face.', PRIORITY.essential, 15, 20);
  want('bfast_prep', 'Prepare Breakfast', 'meal', '🍳', "Start cooking now. Check Meals tab for today's breakfast.", PRIORITY.essential, 15, isWeekend ? 25 : 20);
  want('breakfast', 'Eat Breakfast', 'meal', '🍽️', 'Sit down and eat. No phone while eating.', PRIORITY.essential, 15, isWeekend ? 30 : 20);
  want('dishes1', 'Clean Dishes', 'routine', '🧹', '10 mins now saves stress later.', PRIORITY.chores, 5, isWeekend ? 15 : 10);

  if (isWeekend) want('laundry_sort', 'Sort & Start Laundry', 'chores', '👕', 'Sort clothes, start soaking or machine wash — do this first so clothes dry by afternoon.', PRIORITY.chores, 15, 30);

  const w1 = pickWork(workItems, 0);
  want('work1', w1.label, 'coding', w1.emoji, w1.note, PRIORITY.work, 45, 90);

  if (!isWeekend) want('snack', '10am Snack', 'meal', '🍌', 'Banana + groundnuts. Drink water, then back to focus.', PRIORITY.essential, 10, 15);

  const w2 = pickWork(workItems, 1);
  want('work2', w2.label, 'coding', w2.emoji, w2.note, PRIORITY.work, 45, 90);

  if (isWeekend) want('laundry_hang', 'Hang / Check Laundry', 'chores', '👕', 'Hang clothes out to dry or move to the dryer.', PRIORITY.chores, 10, 15);

  want('lunch_prep', 'Prepare Lunch', 'meal', '🍲', 'Start cooking now — check Meals tab.', PRIORITY.essential, 15, isWeekend ? 30 : 25);
  want('lunch', 'Eat Lunch', 'meal', '🍽️', 'Biggest meal of the day — fuel for the afternoon.', PRIORITY.essential, 20, isWeekend ? 30 : 25);
  want('dishes2', 'Clean Up', 'routine', '🧹', 'Quick clean. Clear space = clear mind.', PRIORITY.chores, 5, isWeekend ? 15 : 10);
  want('bath', 'Bathing / Afternoon Reset', 'health', '🛁', 'Freshen up in the afternoon — you have earned it after a solid morning.', PRIORITY.essential, 15, 25);

  if (morningWorkoutMin > 0) {
    want('workout1', `Workout — ${dayPlan.focus}`, 'workout', '🏋️', `${dayPlan.morning.title}: ${exerciseSummary(dayPlan.morning.exercises)}`, PRIORITY.essential, morningWorkoutMin, morningWorkoutMin);
  }

  if (isWeekend) want('house_clean', 'Clean House / Room', 'chores', '🏠', 'Full room clean — sweep, mop, arrange, take out trash.', PRIORITY.chores, 20, 60);

  const w3 = pickWork(workItems, 2);
  want('work3', w3.label, 'coding', w3.emoji, w3.note, PRIORITY.work, 45, 90);

  if (isWeekend) want('laundry_fold', 'Fold & Put Away Clothes', 'chores', '👕', 'Fold and put away dry clothes.', PRIORITY.chores, 10, 20);

  want('bae', 'Bae Time 💕', 'personal', '💕', 'Protected time. Phone down. Be fully present.', PRIORITY.social, 30, isWeekend ? 120 : 90);

  want('dinner_prep', 'Prepare Dinner', 'meal', '🍲', 'Start cooking. Check Meals tab for tonight.', PRIORITY.essential, 15, isWeekend ? 30 : 20);
  want('dinner', 'Eat Dinner', 'meal', '🍽️', 'Eat well — this fuels overnight recovery.', PRIORITY.essential, 20, isWeekend ? 30 : 25);
  want('dishes3', 'Clean Kitchen', 'routine', '🧹', 'Full clean. Good kitchen tonight = easy morning tomorrow.', PRIORITY.chores, 5, isWeekend ? 15 : 10);

  if (eveningWorkoutMin > 0) {
    want('workout2', `Workout — ${dayPlan.focus} (Evening)`, 'workout', '💪', `${dayPlan.evening.title}: ${exerciseSummary(dayPlan.evening.exercises)}`, PRIORITY.essential, eveningWorkoutMin, eveningWorkoutMin);
  } else if (dayPlan.evening.isRest) {
    want('recovery', 'Active Recovery — Stretch', 'workout', '🧘', 'Rest day evening — light stretching, no heavy sets.', PRIORITY.essential, 10, 15);
  }

  if (isWeekend) want('week_plan', 'Plan Next Week', 'routine', '📋', 'What do you want to achieve? Any big purchases? Check Tech Hub deadlines.', PRIORITY.chores, 10, 20);

  want('gaming', 'Gaming 🎮', 'gaming', '🎮', 'Earned screen time — enjoy it guilt-free.', PRIORITY.leisure, 0, 90);
  want('freetime', 'Free Time 🎧', 'personal', '🎧', 'Wind down however you like.', PRIORITY.leisure, 15, 60);
  want('review', 'Daily Review', 'routine', '📝', 'What did you learn today? What to do differently? Write 3 lines.', PRIORITY.chores, 5, 15);
  want('night_prep', 'Night Prep', 'routine', '🌙', 'Set clothes, pack bag, set alarm. Drink milk before bed.', PRIORITY.essential, 10, 15);

  // ── PASS 2: fit the wish list into the actual time available ────────────
  // Try the latest acceptable bedtime first (more room), falling back to
  // the earliest if the ideal-duration day already fits comfortably.
  const idealTotal = wish.reduce((s, w) => s + w.ideal, 0);
  const roomAtEarliest = BEDTIME_EARLIEST - wake;
  const targetBedtime = idealTotal <= roomAtEarliest ? BEDTIME_EARLIEST : BEDTIME_LATEST;
  const budget = targetBedtime - wake;

  const dropped = [];
  let allocated = wish.map((w) => ({ ...w, duration: w.ideal }));
  let total = () => allocated.reduce((s, w) => s + w.duration, 0);

  // Step A: shrink toward minimum, lowest priority first, until it fits or
  // everything's already at its floor.
  for (let tier = PRIORITY.leisure; tier >= PRIORITY.essential && total() > budget; tier--) {
    for (const w of allocated.filter((x) => x.priority === tier)) {
      if (total() <= budget) break;
      const over = total() - budget;
      const shrinkable = w.duration - w.min;
      if (shrinkable <= 0) continue;
      const cut = Math.min(shrinkable, over);
      w.duration -= cut;
    }
  }

  // Step B: if shrinking alone isn't enough, drop entire blocks — lowest
  // priority first, and within a tier, drop the ones already at minimum
  // (i.e. shrinking bought nothing) before touching anything still above min.
  for (let tier = PRIORITY.leisure; tier >= PRIORITY.essential && total() > budget; tier--) {
    const tierItems = allocated.filter((x) => x.priority === tier).sort((a, b) => a.duration - b.duration);
    for (const w of tierItems) {
      if (total() <= budget) break;
      if (w.priority === PRIORITY.essential) continue; // essential items are never dropped, only shrunk (Step A already did what it could)
      dropped.push({ id: w.id, label: w.label });
      allocated = allocated.filter((x) => x.id !== w.id);
    }
  }

  // ── PASS 3: place what's left on the clock, in original order ───────────
  const order = wish.map((w) => w.id);
  const byId = Object.fromEntries(allocated.map((w) => [w.id, w]));
  const blocks = [];
  let cursor = wake;
  for (const id of order) {
    const w = byId[id];
    if (!w || w.duration <= 0) continue;
    blocks.push({ id: w.id, time: m2t(cursor), label: w.label, type: w.type, duration: w.duration, emoji: w.emoji, note: w.note });
    cursor += w.duration;
  }

  const bedMod = cursor % 1440;
  const sleepMinutes = Math.max(MIN_SLEEP_MINUTES, bedMod < wake ? wake - bedMod : (1440 - bedMod) + wake);
  blocks.push({ id: 'sleep', time: m2t(cursor), label: 'Sleep', type: 'sleep', duration: sleepMinutes, emoji: '😴', note: `Phone in another room. ~${(sleepMinutes / 60).toFixed(1)}h of sleep — protect it even on a full day.` });

  if (dropped.length) blocks._droppedToday = dropped; // surfaced to the UI below, not persisted as a real block

  return blocks;
}

async function requestNotif() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

function fireNotif(title, body, requireInteraction = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon:'/icon-192.png', badge:'/icon-192.png', requireInteraction, vibrate:[200,100,200,100,200] }); } catch(e) {}
}

function scheduleAll(blocks) {
  const now = new Date();
  const nowMs = now.getTime();
  blocks.forEach(b => {
    const bMins = t2m(b.time);
    const startMs = new Date().setHours(Math.floor(bMins/60), bMins%60, 0, 0);
    const diff = startMs - nowMs;
    const msgs = NOTIF_MSGS[b.type] ? NOTIF_MSGS[b.type](b) : { title:`⏰ ${b.label}`, body: b.note };
    const important = ['meal','coding','sleep','workout'].includes(b.type);

    if (diff > 0 && diff < 86400000) {
      setTimeout(() => fireNotif(msgs.title, msgs.body, important), diff);
    }
    // Cook warning 25 min before eating
    if (b.type === 'meal' && b.label.includes('Eat')) {
      const d = startMs - 25*60*1000 - nowMs;
      if (d > 0) setTimeout(() => fireNotif('🍳 START COOKING NOW', `Start preparing now so ${b.label.replace('Eat ','')} is ready by ${fmt12(b.time)}`, true), d);
    }
    // 5 min warning for work blocks
    if (b.type === 'coding') {
      const d = startMs - 5*60*1000 - nowMs;
      if (d > 0) setTimeout(() => fireNotif(`⚠️ ${b.label} in 5 minutes`, `Put your phone down now. ${b.note}`), d);
    }
    // 5 min warning for workouts
    if (b.type === 'workout') {
      const d = startMs - 5*60*1000 - nowMs;
      if (d > 0) setTimeout(() => fireNotif(`🏋️ ${b.label} in 5 minutes`, `Get changed and get water ready. ${b.note}`), d);
    }
    // 30 min wind-down before sleep
    if (b.type === 'sleep') {
      const d = startMs - 30*60*1000 - nowMs;
      if (d > 0) setTimeout(() => fireNotif('🌙 Wind Down in 30 Minutes', 'Start wrapping up everything. Put the phone down.'), d);
    }
    // Gaming notification
    if (b.type === 'gaming') {
      if (diff > 0 && diff < 86400000) {
        setTimeout(() => fireNotif('🎮 GAMING TIME UNLOCKED', `You have ${b.duration} minutes. Enjoy!`), diff);
      }
    }
  });
}

function EditModal({ block, onSave, onClose }) {
  const [s, setS] = useState({ ...block });
  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width:36, height:4, background:'var(--border)', borderRadius:2, margin:'12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize:16, fontWeight:700 }}>Edit Block</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {[['Start Time','time','time'],['Label','label','text'],['Duration (minutes)','duration','number'],['Reminder Note','note','text']].map(([l,k,t]) => (
            <div key={k}>
              <label style={{ fontSize:12, color:'var(--text-3)', fontWeight:600, letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:8 }}>{l}</label>
              <input className={`input${k==='duration'?' font-num':''}`} type={t} value={s[k]} onChange={e => setS(p => ({ ...p, [k]: t==='number' ? Number(e.target.value) : e.target.value }))} />
            </div>
          ))}
          <div>
            <label style={{ fontSize:12, color:'var(--text-3)', fontWeight:600, letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:8 }}>Type</label>
            <select className="input" value={s.type} onChange={e => setS(p => ({ ...p, type: e.target.value }))}>
              {Object.entries(TYPE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={() => onSave(s)}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

export default function PlannerPage() {
  const { hackathons, startups, projects, onlineJobs } = useApp();
  const isWeekend = [0,6].includes(new Date().getDay());
  const [blocks, setBlocks] = useState([]);
  const [droppedToday, setDroppedToday] = useState([]);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifPerm, setNotifPerm] = useState('default');
  const [completedIds, setCompletedIds] = useState([]);
  const [now, setNow] = useState(new Date());
  const [tab, setTab] = useState('today');
  const [editBlock, setEditBlock] = useState(null);

  // _app.js's NotificationScheduler and lib/push.js's syncReminderSettings
  // both read a single 'planner_blocks' setting for the server-side push
  // sender to work from — the planner itself no longer persists a fixed
  // block list (it's generated fresh each load from Tech Hub/Jobs/workout
  // plus today's overrides), so that setting has to be kept in sync
  // explicitly whenever the effective schedule changes.
  async function syncPlannerBlocksSetting(effectiveBlocks) {
    await setSetting('planner_blocks', effectiveBlocks);
    try {
      const notifsOn = await getSetting('planner_notifs', false);
      if (notifsOn) {
        const { syncReminderSettings } = await import('../lib/push');
        const mealWeekPlan = await getSetting('meal_week_plan', null);
        await syncReminderSettings({ mealWeekPlan, plannerBlocks: effectiveBlocks, plannerNotifs: true });
      }
    } catch (e) {
      console.warn('[fedha] planner_blocks resync failed:', e?.message);
    }
  }

  // Rebuild today's schedule whenever the underlying Tech Hub / Jobs data
  // changes, then layer any per-day manual edits on top.
  useEffect(() => {
    async function load() {
      const generated = buildTodayBlocks({ hackathons, startups, projects, onlineJobs }, isWeekend);
      setDroppedToday(generated._droppedToday || []);
      const overrides = await getSetting(`planner_overrides_${todayISO()}`, {});
      const merged = generated.map((b) => (overrides[b.id] ? { ...b, ...overrides[b.id] } : b));
      setBlocks(merged);
      await syncPlannerBlocksSetting(merged);

      const done = await getSetting(`planner_done_${todayISO()}`, []);
      if (done) setCompletedIds(done);
      const ne = await getSetting('planner_notifs', false);
      setNotifEnabled(ne);
      if ('Notification' in window) setNotifPerm(Notification.permission);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hackathons, startups, projects, onlineJobs]);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(iv);
  }, []);

  async function toggleDone(id) {
    const updated = completedIds.includes(id) ? completedIds.filter(x=>x!==id) : [...completedIds, id];
    setCompletedIds(updated);
    await setSetting(`planner_done_${todayISO()}`, updated);
  }

  async function enableNotifs() {
    const ok = await requestNotif();
    setNotifPerm(ok ? 'granted' : 'denied');
    if (ok) {
      setNotifEnabled(true);
      await setSetting('planner_notifs', true);
      scheduleAll(blocks);
      fireNotif('🟢 Fedha Planner Active', `All reminders are on for today's ${isWeekend ? 'weekend' : 'weekday'} schedule.`, false);

      // Subscribe to real push right away so reminders still fire once you
      // close the app — no need to wait for the next reload.
      try {
        const { ensurePushSubscription, syncReminderSettings } = await import('../lib/push');
        await ensurePushSubscription();
        const mealWeekPlan = await getSetting('meal_week_plan', null);
        await syncReminderSettings({ mealWeekPlan, plannerBlocks: blocks, plannerNotifs: true });
      } catch (e) {
        console.warn('[fedha] push subscription on enable failed:', e?.message);
      }
    }
  }

  async function handleEditSave(updated) {
    const original = blocks.find((b) => b.id === updated.id);
    const timeChanged = original && updated.time && updated.time !== original.time;

    let nextBlocks;
    if (timeChanged) {
      // Shift every block from this one onward by the same delta, so moving
      // a block earlier/later doesn't leave a gap or overlap with what
      // follows — each block keeps its own duration, only its start time
      // moves. Blocks before this one are untouched.
      const deltaMin = t2m(updated.time) - t2m(original.time);
      const idx = blocks.findIndex((b) => b.id === updated.id);
      nextBlocks = blocks.map((b, i) => {
        if (i < idx) return b;
        if (i === idx) return { ...b, ...updated };
        return { ...b, time: m2t(t2m(b.time) + deltaMin) };
      });
    } else {
      nextBlocks = blocks.map((b) => (b.id === updated.id ? { ...b, ...updated } : b));
    }

    // Persist every block whose time actually moved as an override (not
    // just the one the user directly edited), so the cascade survives a
    // reload — otherwise buildTodayBlocks() would regenerate the original
    // times for everything after the edited block on next load.
    const overrides = await getSetting(`planner_overrides_${todayISO()}`, {});
    const nextOverrides = { ...overrides };
    for (const b of nextBlocks) {
      const before = blocks.find((x) => x.id === b.id);
      if (before && before.time !== b.time) {
        nextOverrides[b.id] = { ...(overrides[b.id] || {}), time: b.time, ...(b.id === updated.id ? updated : {}) };
      } else if (b.id === updated.id) {
        nextOverrides[b.id] = { ...(overrides[b.id] || {}), ...updated };
      }
    }
    await setSetting(`planner_overrides_${todayISO()}`, nextOverrides);

    setBlocks(nextBlocks);
    setEditBlock(null);
    await syncPlannerBlocksSetting(nextBlocks);
    if (notifEnabled) scheduleAll(nextBlocks);
  }

  async function resetToday() {
    await setSetting(`planner_overrides_${todayISO()}`, {});
    const fresh = buildTodayBlocks({ hackathons, startups, projects, onlineJobs }, isWeekend);
    setDroppedToday(fresh._droppedToday || []);
    setBlocks(fresh);
    await syncPlannerBlocksSetting(fresh);
  }

  const nowMins = now.getHours()*60+now.getMinutes();
  const wakeMins = blocks.length ? t2m(blocks[0].time) : 0;
  const sleepBlock = blocks.find((b) => b.type === 'sleep');
  const currentBlock = (sleepBlock && nowMins < wakeMins)
    ? sleepBlock
    : blocks.find(b => nowMins>=t2m(b.time) && nowMins<t2m(b.time)+b.duration);
  const currentProgress = (() => {
    if (!currentBlock) return 0;
    const isOvernightSleep = sleepBlock && currentBlock.id === sleepBlock.id && nowMins < wakeMins;
    if (isOvernightSleep) {
      // Sleep started before midnight and we're now past it (nowMins wrapped
      // to a small number). Minutes elapsed = time from sleep start to
      // midnight, plus minutes since midnight — not a plain subtraction,
      // since t2m(currentBlock.time) is a pre-midnight clock time (e.g.
      // 23:00) while nowMins is a post-midnight one (e.g. 02:22).
      const startMins = t2m(currentBlock.time);
      const elapsed = (1440 - startMins) + nowMins;
      return Math.min(100, (elapsed / currentBlock.duration) * 100);
    }
    return ((nowMins - t2m(currentBlock.time)) / currentBlock.duration) * 100;
  })();
  const nextBlock = (sleepBlock && nowMins < wakeMins)
    ? blocks[0]
    : (blocks.find(b => t2m(b.time) > nowMins) || sleepBlock);
  const totalNonSleep = blocks.filter(b => b.type!=='sleep').length;
  const pct = totalNonSleep ? Math.round((completedIds.length/totalNonSleep)*100) : 0;

  return (
    <Layout fab={false}>
      <div className="page">
        <div className="page-header">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
            <h1 style={{ fontSize:22, fontWeight:700 }}>Daily Planner</h1>
            <span className="font-num" style={{ fontSize:13, color:'var(--text-3)' }}>{format(now,'h:mm a')}</span>
          </div>
          <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:16 }}>{format(now,'EEEE, d MMMM yyyy')} · auto-built from Tech Hub, My Jobs &amp; today's workout</div>

          {/* Notif banners */}
          {!notifEnabled && notifPerm !== 'denied' && (
            <button onClick={enableNotifs} style={{ width:'100%', padding:'12px 16px', background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:12, display:'flex', alignItems:'center', gap:12, cursor:'pointer', marginBottom:14, textAlign:'left' }}>
              <span style={{ fontSize:22 }}>🔔</span>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--green)', fontFamily:'Outfit' }}>Turn On All Reminders</div>
                <div style={{ fontSize:12, color:'var(--text-3)' }}>Meals, work blocks, workouts, bathing, gaming and sleep</div>
              </div>
            </button>
          )}
          {notifPerm === 'denied' && !notifEnabled && (
            <div style={{ padding:'10px 14px', background:'var(--red-dim)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, fontSize:13, color:'var(--red)', marginBottom:14 }}>
              🔕 Blocked — Settings → Chrome → Notifications → Allow this site
            </div>
          )}
          {notifEnabled && (
            <div style={{ padding:'10px 14px', background:'var(--green-dim)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:10, fontSize:13, color:'var(--green)', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
              🔔 All reminders active for today's {isWeekend ? 'weekend' : 'weekday'} schedule
            </div>
          )}
          {droppedToday.length > 0 && (
            <div style={{ padding:'10px 14px', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:10, fontSize:13, color:'#FCD34D', marginBottom:14 }}>
              ⚠️ Today's plan was too full to fit everything before bedtime, so this got dropped: {droppedToday.map((d) => d.label).join(', ')}.
            </div>
          )}

          <div style={{ display:'flex', gap:8 }}>
            <button className={`chip ${tab==='today'?'active':''}`} onClick={() => setTab('today')}>Today</button>
            <button className={`chip ${tab==='stats'?'active':''}`} onClick={() => setTab('stats')}>Stats</button>
            <button className={`chip ${tab==='edit'?'active':''}`} onClick={() => setTab(t => t==='edit'?'today':'edit')}>⚙️ Edit</button>
          </div>
        </div>

        <div style={{ padding:'0 20px' }}>

          {/* TODAY */}
          {tab === 'today' && (
            <>
              {currentBlock && (
                <div style={{ marginBottom:16 }}>
                  <div className="section-title">RIGHT NOW</div>
                  <div style={{ background:TYPE_COLORS[currentBlock.type].bg, border:`2px solid ${TYPE_COLORS[currentBlock.type].border}`, borderRadius:16, padding:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                      <span style={{ fontSize:28 }}>{currentBlock.emoji}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:16, fontWeight:700, color:TYPE_COLORS[currentBlock.type].text }}>{currentBlock.label}</div>
                        <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>
                          {currentBlock.duration<60 ? `${currentBlock.duration} min block` : `${Math.floor(currentBlock.duration/60)}h${currentBlock.duration%60>0?' '+currentBlock.duration%60+'m':''} block`}
                        </div>
                      </div>
                    </div>
                    <div className="progress-bar" style={{ height:8, marginBottom:10 }}>
                      <div className="progress-fill" style={{ width:`${currentProgress}%`, background:TYPE_COLORS[currentBlock.type].dot }} />
                    </div>
                    <div style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.5 }}>{currentBlock.note}</div>
                  </div>
                </div>
              )}

              {nextBlock && nextBlock.id !== currentBlock?.id && (
                <div style={{ marginBottom:16 }}>
                  <div className="section-title">UP NEXT</div>
                  <div className="card" style={{ padding:'12px 14px', display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ fontSize:22 }}>{nextBlock.emoji}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600 }}>{nextBlock.label}</div>
                      <div style={{ fontSize:12, color:'var(--text-3)' }}>Starts {fmt12(nextBlock.time)}</div>
                    </div>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:TYPE_COLORS[nextBlock.type].dot, flexShrink:0 }} />
                  </div>
                </div>
              )}

              <div style={{ marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div className="section-title" style={{ marginBottom:0 }}>PROGRESS</div>
                  <div style={{ fontSize:13, color:'var(--green)', fontWeight:600 }}>{completedIds.length}/{totalNonSleep} · {pct}%</div>
                </div>
                <div className="progress-bar" style={{ height:8 }}>
                  <div className="progress-fill" style={{ width:`${pct}%`, background:'var(--green)' }} />
                </div>
              </div>

              <div className="section-title">FULL SCHEDULE {isWeekend ? '(WEEKEND)' : '(WEEKDAY)'}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:24 }}>
                {blocks.map(block => {
                  const isNow = nowMins>=t2m(block.time) && nowMins<t2m(block.time)+block.duration;
                  const isPast = nowMins >= t2m(block.time)+block.duration && !(block.type==='sleep');
                  const isDone = completedIds.includes(block.id);
                  const c = TYPE_COLORS[block.type];
                  return (
                    <div key={block.id} style={{ display:'flex', alignItems:'flex-start', gap:8, opacity: isPast&&!isDone ? 0.45 : 1 }}>
                      <div style={{ width:56, flexShrink:0, paddingTop:11, textAlign:'right' }}>
                        <div className="font-num" style={{ fontSize:11, color: isNow ? c.text : 'var(--text-3)', fontWeight: isNow ? 700 : 400, lineHeight:1.3, whiteSpace:'pre-line' }}>
                          {fmt12(block.time).replace(' ','\n')}
                        </div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingTop:11 }}>
                        <div style={{ width:12, height:12, borderRadius:'50%', background: isNow ? c.dot : isDone ? 'var(--green)' : 'var(--border)', flexShrink:0, boxShadow: isNow ? `0 0 8px ${c.dot}70` : 'none' }} />
                        <div style={{ width:2, flex:1, background:'var(--border)', minHeight:16, marginTop:4 }} />
                      </div>
                      <div style={{ flex:1, background: isNow ? c.bg : isDone ? 'rgba(16,185,129,0.06)' : 'var(--card)', border:`1px solid ${isNow ? c.border : isDone ? 'rgba(16,185,129,0.2)' : 'var(--border)'}`, borderRadius:10, padding:'10px 12px', marginBottom:2, cursor:'pointer' }}
                        onClick={() => toggleDone(block.id)}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:16, flexShrink:0 }}>{isDone ? '✅' : block.emoji}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, color: isNow ? c.text : isDone ? 'var(--text-3)' : 'var(--text)', textDecoration: isDone ? 'line-through' : 'none' }}>{block.label}</div>
                            <div style={{ fontSize:11, color:'var(--text-3)', marginTop:1 }}>
                              {block.duration<60 ? `${block.duration} min` : `${Math.floor(block.duration/60)}h${block.duration%60>0?' '+block.duration%60+'m':''}`}
                            </div>
                          </div>
                          <div style={{ width:6, height:6, borderRadius:'50%', background:c.dot, flexShrink:0 }} />
                        </div>
                        {isNow && <div style={{ fontSize:12, color:'var(--text-2)', marginTop:6, lineHeight:1.5, borderTop:'1px solid var(--border)', paddingTop:6 }}>{block.note}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding:'10px 14px', background:'var(--card-2)', borderRadius:10, fontSize:12, color:'var(--text-3)', marginBottom:24 }}>
                💡 Tap any block to mark done. Work and workout blocks are pulled from Tech Hub, My Jobs and today's workout plan automatically.
              </div>
            </>
          )}

          {/* STATS */}
          {tab === 'stats' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:24 }}>
              {[
                { label:'Work Time', v: blocks.filter(b=>b.type==='coding').reduce((s,b)=>s+b.duration,0), color:'#10B981', emoji:'💻' },
                { label:'Workout Time', v: blocks.filter(b=>b.type==='workout').reduce((s,b)=>s+b.duration,0), color:'#EF4444', emoji:'🏋️' },
                { label:'Bae Time', v: blocks.filter(b=>b.type==='personal'&&b.label.toLowerCase().includes('bae')).reduce((s,b)=>s+b.duration,0), color:'#EC4899', emoji:'💕' },
                { label:'Chores', v: blocks.filter(b=>b.type==='chores').reduce((s,b)=>s+b.duration,0), color:'#EAB308', emoji:'🏠', showIfZero:false },
                { label:'Meals', v: blocks.filter(b=>b.type==='meal'&&b.label.includes('Eat')).length, color:'#F59E0B', emoji:'🍽️', isCount:true },
                { label:'Gaming', v: blocks.filter(b=>b.type==='gaming').reduce((s,b)=>s+b.duration,0), color:'#A78BFA', emoji:'🎮' },
                { label:'Free Time', v: blocks.filter(b=>b.type==='personal'&&b.label.includes('Free')).reduce((s,b)=>s+b.duration,0), color:'#94A3B8', emoji:'🎧' },
                { label:'Sleep', v: blocks.filter(b=>b.type==='sleep').reduce((s,b)=>s+b.duration,0), color:'#475569', emoji:'😴' },
              ].filter(s => s.showIfZero!==false || s.v>0).map(s => (
                <div key={s.label} className="card" style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:`${s.color}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>{s.emoji}</div>
                  <div style={{ flex:1, fontSize:14, fontWeight:600 }}>{s.label}</div>
                  <div className="font-num" style={{ fontSize:15, fontWeight:700, color:s.color }}>
                    {s.isCount ? `${s.v} meals` : s.v<60 ? `${s.v}m` : `${Math.floor(s.v/60)}h${s.v%60>0?' '+s.v%60+'m':''}`}
                  </div>
                </div>
              ))}
              {blocks.some(b=>b.type==='sleep' && b.duration < 360) && (
                <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--red)', marginBottom:8 }}>⚠️ Short Sleep Tonight</div>
                  <div style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>
                    Today's schedule only leaves under 6 hours before wake-up. Cutting gaming or free time short tonight will protect tomorrow's focus.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* EDIT */}
          {tab === 'edit' && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:16 }}>Tap any block to adjust time, duration or note. Edits apply to today only — tomorrow rebuilds automatically from Tech Hub, My Jobs and the workout plan.</div>
              {blocks.map(block => {
                const c = TYPE_COLORS[block.type];
                return (
                  <div key={block.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, marginBottom:8, cursor:'pointer' }}
                    onClick={() => setEditBlock(block)}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:c.dot, flexShrink:0 }} />
                    <span className="font-num" style={{ fontSize:11, color:'var(--text-3)', width:54, flexShrink:0 }}>{fmt12(block.time)}</span>
                    <div style={{ flex:1, fontSize:13, fontWeight:500 }}>{block.emoji} {block.label}</div>
                    <span style={{ fontSize:11, color:'var(--text-3)' }}>{block.duration}m ✏️</span>
                  </div>
                );
              })}
              <button className="btn-ghost" style={{ marginTop:12 }} onClick={resetToday}>
                Reset Today to Auto-Generated
              </button>
            </div>
          )}
        </div>
      </div>
      {editBlock && <EditModal block={editBlock} onSave={handleEditSave} onClose={() => setEditBlock(null)} />}
    </Layout>
  );
}
