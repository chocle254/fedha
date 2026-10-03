import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { getSetting, setSetting } from '../lib/db';
import { todayISO, computeJobProgress } from '../lib/utils';
import { hackStatus, isUrgent, projectStatus } from './tech-hub';
import { WEEKLY_PLAN, weekdayPlanIndex, estimateWorkoutMinutes, exerciseSummary } from './workout';
import { showNotif, VIBRATE } from '../lib/notifications';
import { pruneEndedEvents, todaysEventBlocks } from '../lib/events';
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
// Meals are pinned to the clock; everything else flows around them.
const LUNCH_AT = 13 * 60;            // lunch starts exactly here (prep finishes right before)
const DINNER_AT = 19 * 60;           // dinner starts exactly here
// Work blocks soak up every spare minute between the fixed things, within these limits.
const WORK_MIN = 45;                 // a work block is never shorter than this
const WORK_MAX = 150;                // ...and never longer than this without a break
const WORK_SQUEEZE = 25;             // in a tight stretch a work block may shrink this far before it is dropped

const TYPE_COLORS = {
  routine:  { bg:'rgba(99,102,241,0.12)',  border:'rgba(99,102,241,0.35)',  text:'#818CF8', dot:'#6366F1' },
  meal:     { bg:'rgba(245,158,11,0.12)',  border:'rgba(245,158,11,0.35)',  text:'#FCD34D', dot:'#F59E0B' },
  coding:   { bg:'rgba(16,185,129,0.12)', border:'rgba(16,185,129,0.35)', text:'#6EE7B7', dot:'#10B981' },
  research: { bg:'rgba(59,130,246,0.12)', border:'rgba(59,130,246,0.35)', text:'#93C5FD', dot:'#3B82F6' },
  learning: { bg:'rgba(16,185,129,0.12)', border:'rgba(16,185,129,0.35)', text:'#6EE7B7', dot:'#10B981' },
  personal: { bg:'rgba(236,72,153,0.12)', border:'rgba(236,72,153,0.35)', text:'#F9A8D4', dot:'#EC4899' },
  chores:   { bg:'rgba(234,179,8,0.12)',  border:'rgba(234,179,8,0.35)',   text:'#FDE047', dot:'#EAB308' },
  workout:  { bg:'rgba(239,68,68,0.12)',  border:'rgba(239,68,68,0.35)',   text:'#FCA5A5', dot:'#EF4444' },
  health:   { bg:'rgba(6,182,212,0.12)',  border:'rgba(6,182,212,0.35)',   text:'#67E8F9', dot:'#06B6D4' },
  gaming:   { bg:'rgba(167,139,250,0.12)',border:'rgba(167,139,250,0.35)', text:'#C4B5FD', dot:'#A78BFA' },
  sleep:    { bg:'rgba(30,41,59,0.5)',    border:'rgba(51,65,85,0.5)',     text:'#475569', dot:'#334155' },
  event:    { bg:'rgba(249,115,22,0.12)', border:'rgba(249,115,22,0.4)',   text:'#FDBA74', dot:'#F97316' },
};
const TYPE_LABELS = { routine:'Routine', meal:'Meal', coding:'Work', personal:'Personal', chores:'Chores', workout:'Workout', health:'Health', gaming:'Gaming', sleep:'Sleep', research:'Research', event:'Event' };

function t2m(t) { const [h,m] = t.split(':').map(Number); return h*60+m; }
function m2t(m) { return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }
function fmt12(t) { const [h,m] = t.split(':').map(Number); return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// ─── PICK WHAT TO WORK ON ───────────────────────────────────────────────────
// Looks at Tech Hub (hackathons, startups, personal projects) and My Jobs to
// figure out what actually deserves the day's deep-work blocks, in priority
// order: an urgent hackathon deadline beats a job, beats a startup, beats a
// side project, beats a generic "nothing active" fallback.
function getOpenResearchItem(research) {
  const open = (research || []).filter((r) => r.status !== 'closed');
  if (!open.length) return null;
  // Oldest open item first — the one that's been sitting longest gets
  // picked up before a newer one, same "don't let things rot" logic as
  // everything else pulled from Tech Hub.
  const sorted = [...open].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const r = sorted[0];
  const already = (r.entries || []).length;
  return { emoji: '🔍', label: `Research — ${r.title}`, note: already ? `Continue digging into this — ${already} search${already === 1 ? '' : 'es'} logged so far. Open Tech Hub → Research.` : `Start researching this in Tech Hub → Research. Use the AI search helper, then Wrap Up when you have enough.` };
}

function getWorkPriorityItems({ hackathons, startups, projects, onlineJobs, clientProjects, courses }) {
  const candidates = [];
  const now = Date.now();

  function deadlinePressure(deadline) {
    if (!deadline) return 0;
    const ms = new Date(deadline).getTime() - now;
    const days = ms / 86400000;
    if (days <= 0) return 60;
    if (days <= 1) return 55;
    if (days <= 3) return 45;
    if (days <= 7) return 32;
    if (days <= 14) return 18;
    if (days <= 30) return 8;
    return 0;
  }

  function add(item, base, deadline, remainingHours = 1) {
    const pressure = deadlinePressure(deadline);
    const remainingPressure = Math.min(25, Math.max(0, Number(remainingHours) || 0) * 2);
    candidates.push({ ...item, score: base + pressure + remainingPressure });
  }

  // Paid client work gets the strongest baseline, but deadline pressure can
  // change the ordering when another important commitment is genuinely closer.
  (clientProjects || []).filter(p => p.status === 'active').forEach(p => {
    const previousPaid = Number(p.previously_paid || 0) + (p.change_requests || []).reduce((s,x) => s + Number(x.previously_paid || 0), 0);
    const payments = (p.payments || []).reduce((s,x) => s + Number(x.amount || 0), 0);
    const extraAgreed = (p.change_requests || []).reduce((s,x) => s + Number(x.amount || 0), 0);
    const agreed = Number(p.agreed_amount || 0) + extraAgreed;
    const remaining = Math.max(0, agreed - previousPaid - payments);
    add({
      emoji:'💼',
      label:'Client — ' + p.client_name + ': ' + p.name,
      note:(remaining > 0 ? 'KSh ' + remaining.toLocaleString() + ' still outstanding. ' : '') +
        (p.deadline ? 'Deadline ' + p.deadline + '. ' : '') +
        'Client work is a high-value commitment. Estimated duration: ' + (p.estimated_days || 1) + ' day(s).',
    }, 100, p.deadline, Number(p.estimated_days || 1) * 4);
  });

  // Courses compete in the same pool. Priority, deadline and hours remaining
  // matter together, so a serious course nearing its deadline can displace
  // leisure/side-project work without being permanently buried by newer items.
  (courses || []).filter(c => c.status !== 'completed').forEach(course => {
    const remaining = Math.max(0, Number(course.estimated_hours || 0) - Number(course.completed_minutes || 0) / 60);
    const weekly = Math.max(0.25, Number(course.weekly_hours || 1));
    add({
      emoji:'🎓',
      label:'Course — ' + course.title,
      note:(course.deadline ? 'Target ' + course.deadline + '. ' : '') +
        'P' + (course.priority || 3) + ' learning commitment — ' + remaining.toFixed(1) + 'h remaining. Planner target: about ' + weekly.toFixed(1) + 'h/week.',
    }, 40 + Number(course.priority || 3) * 10, course.deadline, remaining);
  });

  const urgentHacks = (hackathons || []).filter(isUrgent);
  const activeHacks = (hackathons || []).filter(h => hackStatus(h) === 'active' && !isUrgent(h));
  urgentHacks.forEach(h => add({
    emoji:'🔥', label:'Hackathon Sprint — ' + h.name,
    note:'Deadline closing soon' + (h.project_name ? ' — get ' + h.project_name + ' submission-ready.' : '') + ' This can temporarily displace lower-priority work.',
  }, 90, h.deadline, 8));
  if (!urgentHacks.length && activeHacks.length) {
    const h = activeHacks[0];
    add({ emoji:'🏆', label:'Hackathon Work — ' + h.name, note:'Keep building' + (h.project_name ? ' on ' + h.project_name : '') + '. Check your task list in Tech Hub.' }, 65, h.deadline, 8);
  }

  if ((onlineJobs || []).length) {
    const job = onlineJobs[0];
    let prog = null;
    try { prog = computeJobProgress(job); } catch {}
    add({ emoji:'💼', label:'Job Work — ' + job.name, note:prog && !prog.metThreshold
      ? job.name + ' — ' + prog.daysLeft + ' day' + (prog.daysLeft === 1 ? '' : 's') + ' left to hit this period target.'
      : job.name + ' — log tasks in My Jobs as you go.' }, 55, null, 4);
  }

  (startups || []).slice(0,2).forEach(s => add({ emoji:'🚀', label:'Startup Work — ' + s.name, note:'Move ' + s.name + ' forward — check your stage checklist in Tech Hub.' }, 45, null, 4));

  (projects || []).filter(p => ['planning','in_progress'].includes(projectStatus(p))).slice(0,2).forEach(p => {
    add({ emoji:'🗂️', label:'Project Work — ' + p.name, note:p.description || 'Keep building — log progress in Tech Hub when you wrap up.' }, Number(p.importance || 40), p.deadline, 4);
  });

  candidates.sort((a,b) => b.score - a.score);
  if (!candidates.length) return [{ emoji:'💻', label:'Deep Work Block', note:'Nothing active right now — good time to learn something new or start one.' }];
  return candidates.slice(0, 4);
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

// opts.startAt  — minutes since midnight to start the day from ("I'm Awake" passes the current time).
//                 Omitted = the normal fixed wake time.
// opts.doneIds  — ids of blocks already completed today; they are not scheduled again.
function buildTodayBlocks(ctx, isWeekend, opts = {}) {
  const { startAt = null, doneIds = [] } = opts;
  const anchored = startAt != null;
  const done = new Set(doneIds);

  const workItems = getWorkPriorityItems(ctx);
  const researchItem = getOpenResearchItem(ctx.research);
  const dayIdx = weekdayPlanIndex(new Date());
  const dayPlan = WEEKLY_PLAN[dayIdx];
  const morningWorkoutMin = estimateWorkoutMinutes(dayPlan.morning.exercises);
  const eveningWorkoutMin = dayPlan.evening.isRest ? 0 : estimateWorkoutMinutes(dayPlan.evening.exercises);

  // The normal wake time is still what the NEXT morning's sleep is measured to;
  // `startAt` only moves where today's clock begins.
  const defaultWake = isWeekend ? WEEKEND_WAKE : WEEKDAY_WAKE;
  const wake = anchored ? startAt : defaultWake;

  // Late-start rules (only when anchored). Waking at 12:40 should not produce a
  // full breakfast-then-workout-then-bath routine in front of a 13:00 lunch.
  const pastBreakfast = anchored && startAt >= LUNCH_AT - 150;       // 10:30+  → lunch is close, skip breakfast
  const pastSnack = anchored && startAt >= 9 * 60 + 30;             // 09:30+  → no mid-morning snack right after a late breakfast
  const lateMorning = anchored && startAt >= 11 * 60 + 30;           // 11:30+  → morning workout moves to the afternoon
  const pastLunch = anchored && startAt >= 16 * 60;                  // 16:00+  → too late for lunch
  const pastDinner = anchored && startAt >= 21 * 60;                 // 21:00+  → no dinner block

  // ── PASS 1: wish list ──────────────────────────────────────────────────
  // Every block the day would ideally include, tagged with:
  //   seg       which part of the day it belongs to (am / mid / pm / din / eve)
  //   priority  how soon it gets shrunk/dropped when its stretch is too full
  //   min/ideal duration range; `grow` items (work) soak up spare time up to `max`
  //   role      prep / eat / after, for the pinned meals
  const MEAL_OF = { bfast_prep: 'breakfast', dishes1: 'breakfast', lunch_prep: 'lunch', dishes2: 'lunch', dinner_prep: 'dinner', dishes3: 'dinner' };
  const wish = [];
  const want = (seg, id, label, type, emoji, note, priority, min, ideal = min, extra = {}) => {
    if (done.has(id) || (MEAL_OF[id] && done.has(MEAL_OF[id]))) return; // already done today
    wish.push({ seg, id, label, type, emoji, note, priority, min, ideal: Math.max(ideal, min), ...extra });
  };
  const continued = (item) => ({ ...item, label: item.label.endsWith('(continued)') ? item.label : item.label + ' (continued)' });
  const work = (seg, id, item, ideal) => {
    const type = item.label.startsWith('Course —') ? 'learning' : 'coding';
    want(seg, id, item.label, type, item.emoji, item.note, PRIORITY.work, WORK_MIN, ideal, { grow: true, max: WORK_MAX, squeeze: WORK_SQUEEZE });
  };

  // MORNING — body first, then the first deep-work run before lunch.
  want('am', 'wake', 'Wake Up — No Phone', 'routine', '⏰', 'First 20 mins phone-free. Drink water, stretch, wash face.', PRIORITY.essential, 15, 20);
  if (morningWorkoutMin > 0 && !lateMorning) {
    want('am', 'workout1', `Workout — ${dayPlan.focus}`, 'workout', '🏋️', `${dayPlan.morning.title}: ${exerciseSummary(dayPlan.morning.exercises)}`, PRIORITY.essential, morningWorkoutMin, morningWorkoutMin);
  }
  if (!lateMorning) want('am', 'bath', 'Bath & Freshen Up', 'health', '🛁', 'Wash off the workout and reset before the day starts.', PRIORITY.essential, 15, 25);
  if (!pastBreakfast) {
    want('am', 'bfast_prep', 'Prepare Breakfast', 'meal', '🍳', "Start cooking now. Check Meals tab for today's breakfast.", PRIORITY.essential, 15, isWeekend ? 25 : 20);
    want('am', 'breakfast', 'Eat Breakfast', 'meal', '🍽️', 'Sit down and eat. No phone while eating.', PRIORITY.essential, 15, isWeekend ? 30 : 20);
    want('am', 'dishes1', 'Clean Dishes', 'routine', '🧹', '10 mins now saves stress later.', PRIORITY.chores, 5, isWeekend ? 15 : 10);
  }
  if (isWeekend && !pastBreakfast) want('am', 'laundry_sort', 'Sort & Start Laundry', 'chores', '👕', 'Sort clothes, start soaking or machine wash — do this first so clothes dry by afternoon.', PRIORITY.chores, 15, 30);
  work('am', 'work1', pickWork(workItems, 0), 150);
  if (!isWeekend && !pastSnack) want('am', 'snack', 'Mid-Morning Snack', 'meal', '🍌', 'Banana + groundnuts. Drink water, then back to focus.', PRIORITY.essential, 10, 15);
  work('am', 'work2', pickWork(workItems, 1), 90);
  if (isWeekend && !pastBreakfast) want('am', 'laundry_hang', 'Hang / Check Laundry', 'chores', '👕', 'Hang clothes out to dry or move to the dryer.', PRIORITY.chores, 10, 15);

  // MIDDAY — lunch is pinned to LUNCH_AT; prep ends right as it starts.
  if (!pastLunch) {
    want('mid', 'lunch_prep', 'Prepare Lunch', 'meal', '🍲', 'Start cooking now — check Meals tab.', PRIORITY.essential, 15, isWeekend ? 30 : 25, { role: 'prep' });
    want('mid', 'lunch', 'Eat Lunch', 'meal', '🍽️', 'Biggest meal of the day — fuel for the afternoon.', PRIORITY.essential, 20, isWeekend ? 30 : 25, { role: 'eat' });
    want('mid', 'dishes2', 'Clean Up', 'routine', '🧹', 'Quick clean. Clear space = clear mind.', PRIORITY.chores, 5, isWeekend ? 15 : 10, { role: 'after' });
  }

  // AFTERNOON — the long work stretch, then the workout(s) well clear of lunch AND dinner.
  if (researchItem) want('pm', 'research', researchItem.label, 'research', researchItem.emoji, researchItem.note, PRIORITY.work, 30, 60, { grow: true, max: 90, squeeze: 20 });
  // The top-priority item gets a second run after lunch, so it ends up with the biggest share of the day.
  work('pm', 'work3', continued(pickWork(workItems, 0)), 120);
  if (isWeekend) {
    want('pm', 'house_clean', 'Clean House / Room', 'chores', '🏠', 'Full room clean — sweep, mop, arrange, take out trash.', PRIORITY.chores, 20, 60);
    want('pm', 'laundry_fold', 'Fold & Put Away Clothes', 'chores', '👕', 'Fold and put away dry clothes.', PRIORITY.chores, 10, 20);
  } else {
    want('pm', 'break1', 'Break — Walk & Water', 'personal', '☕', 'Step away from the screen. Walk, stretch, drink water.', PRIORITY.chores, 5, 10);
    work('pm', 'work4', pickWork(workItems, 2), 90);
  }
  if (morningWorkoutMin > 0 && lateMorning) {
    want('pm', 'workout1', `Workout — ${dayPlan.focus} (morning session)`, 'workout', '🏋️', `Moved to the afternoon because the day started late. ${dayPlan.morning.title}: ${exerciseSummary(dayPlan.morning.exercises)}`, PRIORITY.essential, morningWorkoutMin, morningWorkoutMin);
  }
  if (eveningWorkoutMin > 0) {
    want('pm', 'workout2', `Workout — ${dayPlan.focus} (Evening)`, 'workout', '💪', `${dayPlan.evening.title}: ${exerciseSummary(dayPlan.evening.exercises)}`, PRIORITY.essential, eveningWorkoutMin, eveningWorkoutMin);
  }
  if (eveningWorkoutMin > 0 || (morningWorkoutMin > 0 && lateMorning)) {
    want('pm', 'freshen', 'Quick Wash & Change', 'health', '🚿', 'Rinse off and change before cooking dinner.', PRIORITY.essential, 5, 10);
  }

  // DINNER — pinned to DINNER_AT.
  if (!pastDinner) {
    want('din', 'dinner_prep', 'Prepare Dinner', 'meal', '🍲', 'Start cooking. Check Meals tab for tonight.', PRIORITY.essential, 15, isWeekend ? 30 : 20, { role: 'prep' });
    want('din', 'dinner', 'Eat Dinner', 'meal', '🍽️', 'Eat well — this fuels overnight recovery.', PRIORITY.essential, 20, isWeekend ? 30 : 25, { role: 'eat' });
    want('din', 'dishes3', 'Clean Kitchen', 'routine', '🧹', 'Full clean. Good kitchen tonight = easy morning tomorrow.', PRIORITY.chores, 5, isWeekend ? 15 : 10, { role: 'after' });
  }

  // EVENING — wind down to bed.
  if (dayPlan.evening.isRest) want('eve', 'recovery', 'Active Recovery — Stretch', 'workout', '🧘', 'Rest day evening — light stretching, no heavy sets.', PRIORITY.essential, 10, 15);
  want('eve', 'bae', 'Bae Time 💕', 'personal', '💕', 'Protected time. Phone down. Be fully present.', PRIORITY.social, 30, isWeekend ? 120 : 90);
  if (isWeekend) want('eve', 'week_plan', 'Plan Next Week', 'routine', '📋', 'What do you want to achieve? Any big purchases? Check Tech Hub deadlines.', PRIORITY.chores, 10, 20);
  want('eve', 'gaming', 'Gaming 🎮', 'gaming', '🎮', 'Earned screen time — enjoy it guilt-free.', PRIORITY.leisure, 0, 60);
  want('eve', 'freetime', 'Free Time 🎧', 'personal', '🎧', 'Wind down however you like.', PRIORITY.leisure, 15, 45);
  want('eve', 'review', 'Daily Review', 'routine', '📝', 'What did you learn today? What to do differently? Write 3 lines.', PRIORITY.chores, 5, 15);
  want('eve', 'night_prep', 'Night Prep', 'routine', '🌙', 'Set clothes, pack bag, set alarm. Drink milk before bed.', PRIORITY.essential, 10, 15);

  // ── PASS 2: fit a stretch of the day into the minutes it actually has ───
  // Too full  → shrink toward `min`, lowest priority (and latest in the list) first,
  //             then drop whole blocks (never essential ones).
  // Too empty → spare minutes go to `grow` blocks (work), up to their max;
  //             anything left over lands on the last one so there are no gaps.
  const dropped = [];
  function fitSegment(items, budget) {
    let alloc = items.map((w) => ({ ...w, duration: w.ideal }));
    const total = () => alloc.reduce((s, w) => s + w.duration, 0);

    // Shrink from the END of each tier first, so the highest-priority item
    // (e.g. the paid client block, which is listed first) keeps its time longest.
    for (let tier = PRIORITY.leisure; tier >= PRIORITY.essential && total() > budget; tier--) {
      for (const w of alloc.filter((x) => x.priority === tier).reverse()) {
        const over = total() - budget;
        if (over <= 0) break;
        const cut = Math.min(w.duration - w.min, over);
        if (cut > 0) w.duration -= cut;
      }
    }
    // Still too full: squeeze work blocks below their normal minimum (latest
    // first) before giving any of them up. A short focused block beats an
    // empty gap and a dropped task.
    for (const w of alloc.filter((x) => x.squeeze != null).reverse()) {
      const over = total() - budget;
      if (over <= 0) break;
      const cut = Math.min(w.duration - w.squeeze, over);
      if (cut > 0) w.duration -= cut;
    }
    // Last resort: drop whole blocks, lowest tier first and, inside a tier, the
    // LATEST in the list first — the list is in priority order, so the top
    // client block is the last work block to go.
    for (let tier = PRIORITY.leisure; tier > PRIORITY.essential && total() > budget; tier--) {
      for (const w of alloc.filter((x) => x.priority === tier && x.duration > 0).reverse()) {
        if (total() <= budget) break;
        dropped.push({ id: w.id, label: w.label });
        alloc = alloc.filter((x) => x.id !== w.id);
      }
    }

    let spare = budget - total();
    const growers = alloc.filter((w) => w.grow);
    while (spare > 0 && growers.some((w) => w.duration < w.max)) {
      const open = growers.filter((w) => w.duration < w.max);
      const weight = open.reduce((s, w) => s + w.ideal, 0);
      let given = 0;
      for (const w of open) {
        const add = Math.min(w.max - w.duration, Math.floor((spare * w.ideal) / weight));
        w.duration += add;
        given += add;
      }
      if (given === 0) { open[0].duration += 1; given = 1; }
      spare -= given;
    }
    if (spare > 0 && growers.length) growers[growers.length - 1].duration += spare;
    return alloc;
  }

  // ── PASS 3: place on the clock, pinning lunch and dinner ────────────────
  const bySeg = (seg) => wish.filter((w) => w.seg === seg);
  const blocks = [];
  let cursor = wake;
  const place = (w) => {
    if (!w || w.duration <= 0) return;
    blocks.push({ id: w.id, time: m2t(cursor), label: w.label, type: w.type, duration: w.duration, emoji: w.emoji, note: w.note });
    cursor += w.duration;
  };
  const prepOf = (seg) => bySeg(seg).find((w) => w.role === 'prep');
  const hasMeal = (seg) => bySeg(seg).some((w) => w.role === 'eat');

  // Meal: the eating starts exactly at its pinned time and prep finishes right
  // before it. Only if the stretch before it genuinely overran does the meal
  // start late.
  function placeMeal(seg, eatAt) {
    const items = bySeg(seg);
    const prep = items.find((w) => w.role === 'prep');
    const eat = items.find((w) => w.role === 'eat');
    const after = items.find((w) => w.role === 'after');
    if (prep) {
      cursor = Math.max(cursor, eatAt - prep.ideal);
      place({ ...prep, duration: prep.ideal });
    }
    cursor = Math.max(cursor, eatAt);
    place({ ...eat, duration: eat.ideal });
    if (after) place({ ...after, duration: after.ideal });
  }

  // Walk the day as alternating "flexible stretch" and "pinned meal" steps. A
  // meal that isn't happening (already eaten, or too late in the day) simply
  // lets the stretches on either side merge into one.
  const flow = [];
  let stretch = [];
  for (const seg of ['am', 'mid', 'pm', 'din', 'eve']) {
    if (seg === 'mid' || seg === 'din') {
      if (hasMeal(seg)) {
        flow.push({ kind: 'fit', items: stretch });
        flow.push({ kind: 'meal', seg, at: seg === 'mid' ? LUNCH_AT : DINNER_AT });
        stretch = [];
      }
    } else {
      stretch = stretch.concat(bySeg(seg));
    }
  }
  flow.push({ kind: 'fit', items: stretch, last: true });

  flow.forEach((step, i) => {
    if (step.kind === 'meal') { placeMeal(step.seg, step.at); return; }
    if (step.last) {
      // Final stretch runs to bedtime: earliest if the ideal evening fits, else the latest.
      const ideal = step.items.reduce((s, w) => s + w.ideal, 0);
      const bed = cursor + ideal <= BEDTIME_EARLIEST ? BEDTIME_EARLIEST : BEDTIME_LATEST;
      for (const w of fitSegment(step.items, Math.max(0, bed - cursor))) place(w);
    } else {
      const next = flow[i + 1]; // always the meal that follows this stretch
      const nextPrep = prepOf(next.seg);
      const end = next.at - (nextPrep ? nextPrep.ideal : 0);
      for (const w of fitSegment(step.items, Math.max(0, end - cursor))) place(w);
    }
  });

  // Sleep is always measured to the NEXT normal wake time, never to `startAt`.
  const bedMod = cursor % 1440;
  const sleepMinutes = Math.max(MIN_SLEEP_MINUTES, bedMod < defaultWake ? defaultWake - bedMod : (1440 - bedMod) + defaultWake);
  blocks.push({ id: 'sleep', time: m2t(cursor), label: 'Sleep', type: 'sleep', duration: sleepMinutes, emoji: '😴', note: `Phone in another room. ~${(sleepMinutes / 60).toFixed(1)}h of sleep — protect it even on a full day.` });

  if (dropped.length) blocks._droppedToday = dropped; // surfaced to the UI below, not persisted as a real block

  return blocks;
}

// ─── EVENTS ON THE CLOCK ───────────────────────────────────────────────────
// Tech Hub events that happen today are fixed commitments: they sit at their
// exact start time for their exact length. Flexible blocks (work, learning,
// research, free time, gaming, chores) that collide with one are trimmed or
// split around it; meals, workouts, bathing and sleep are never touched, so a
// real clash stays visible rather than being silently hidden.
const FLEX_TYPES = new Set(['coding', 'learning', 'research', 'personal', 'gaming', 'chores']);
const MIN_KEPT_MINUTES = 15;

function applyEventBlocks(blocks, eventBlocks) {
  const base = blocks.filter((b) => b.type !== 'event' && !String(b.id).endsWith('__after'));
  if (!eventBlocks.length) return base;
  let out = base;
  for (const ev of eventBlocks) {
    const es = t2m(ev.time);
    const ee = es + ev.duration;
    out = out.flatMap((b) => {
      if (!FLEX_TYPES.has(b.type)) return [b];
      const bs = t2m(b.time);
      const be = bs + b.duration;
      if (be <= es || bs >= ee) return [b];
      const before = es - bs;
      const after = be - ee;
      if (bs < es && be > ee) {
        const parts = [];
        if (before >= MIN_KEPT_MINUTES) parts.push({ ...b, duration: before });
        if (after >= MIN_KEPT_MINUTES) parts.push({ ...b, id: `${b.id}__after`, time: m2t(ee), duration: after });
        return parts;
      }
      if (bs < es) return before >= MIN_KEPT_MINUTES ? [{ ...b, duration: before }] : [];
      return after >= MIN_KEPT_MINUTES ? [{ ...b, time: m2t(ee), duration: after }] : [];
    });
  }
  return [...out, ...eventBlocks].sort((a, b) => t2m(a.time) - t2m(b.time));
}

async function loadTodayEventBlocks() {
  try {
    const live = await pruneEndedEvents();
    return todaysEventBlocks(live, new Date());
  } catch (e) {
    console.warn('[fedha] could not load events for planner:', e?.message);
    return [];
  }
}

// Puts today's actual planned meal (from the Meals tab) into the prepare/eat
// reminders, so the planner's meal blocks carry the same detail the old
// fixed-time meal reminders had. Skips anything the user edited by hand
// because overrides are layered on top afterwards.
const MEAL_BLOCKS = { snack: 'snack', breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner' };
const MEAL_PREP_FOR = { bfast_prep: 'breakfast', lunch_prep: 'lunch', dinner_prep: 'dinner' };
function withMealNotes(blocks, mealWeekPlan) {
  const meals = mealWeekPlan?.[weekdayPlanIndex(new Date())];
  if (!meals) return blocks;
  return blocks.map((b) => {
    const eatSlot = MEAL_BLOCKS[b.id];
    if (eatSlot && meals[eatSlot]) {
      const m = meals[eatSlot];
      return { ...b, note: [m.name, m.cal ? `${m.cal} cal` : null, m.protein ? `${m.protein} protein` : null].filter(Boolean).join(' · ') };
    }
    const prepSlot = MEAL_PREP_FOR[b.id];
    if (prepSlot && meals[prepSlot]) {
      const m = meals[prepSlot];
      const eat = blocks.find((x) => x.id === prepSlot);
      const first = String(m.ingredients || '').split(',')[0].trim();
      return { ...b, note: `${m.name}${eat ? ` — ready by ${fmt12(eat.time)}` : ''}${first ? `. Start with: ${first}` : ''}` };
    }
    return b;
  });
}

async function requestNotif() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
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
  const { hackathons, startups, projects, onlineJobs, research, clientProjects, courses } = useApp();
  const isWeekend = [0,6].includes(new Date().getDay());
  const [blocks, setBlocks] = useState([]);
  const [droppedToday, setDroppedToday] = useState([]);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifPerm, setNotifPerm] = useState('default');
  const [completedIds, setCompletedIds] = useState([]);
  const [now, setNow] = useState(new Date());
  const [tab, setTab] = useState('today');
  const [editBlock, setEditBlock] = useState(null);
  const [usingAI, setUsingAI] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState(null);

  // hackathons/startups/projects/onlineJobs are new array references every
  // time AppContext's loadAll() runs — which happens after ANY data change
  // anywhere in the app (adding an event in Discover, editing a Tech Hub
  // item, anything), not just changes relevant to the planner. Depending on
  // the raw arrays directly meant navigating to Discover and back would
  // regenerate the ENTIRE schedule from scratch every time, discarding
  // completed blocks, moved blocks, and anything Jarvis had added — this is
  // exactly what was happening. A content signature (built from just the
  // fields that actually affect scheduling: which items are active/urgent)
  // means the effect only re-runs when something that would actually
  // change the generated schedule really changed.
  const workSignature = JSON.stringify([
    hackathons?.map((h) => [h.id, hackStatus(h), h.deadline]) || [],
    startups?.map((s) => s.id) || [],
    projects?.map((p) => [p.id, projectStatus(p)]) || [],
    clientProjects?.map((p) => [p.id, p.status, p.deadline, p.agreed_amount, p.previously_paid, (p.payments || []).length, (p.change_requests || []).length, p.estimated_days]) || [],
    onlineJobs?.map((j) => [j.id, j.status]) || [],
    research?.map((r) => [r.id, r.status, (r.entries || []).length]) || [],
    courses?.map((c) => [c.id, c.status, c.priority, c.deadline, c.estimated_hours, c.weekly_hours, c.completed_minutes]) || [],
  ]);

  // The single exit point for every plan change (first load, I'm Awake, edit,
  // reset, notifications switched on). It saves the plan together with the day
  // it belongs to, then — if reminders are on — REPLACES every earlier
  // reminder, both the in-app timers and the server push copy, with ones for
  // exactly these blocks. Nothing else in this file schedules notifications.
  async function syncPlannerBlocksSetting(effectiveBlocks) {
    await setSetting('planner_blocks', effectiveBlocks);
    await setSetting('planner_blocks_date', todayISO());
    try {
      const notifsOn = await getSetting('planner_notifs', false);
      if (!notifsOn) return;
      const { syncPlannerReminders } = await import('../lib/notifications');
      syncPlannerReminders(effectiveBlocks);
      const { syncReminderSettings, toPushBlocks } = await import('../lib/push');
      // mealWeekPlan is null on purpose: the planner's own prepare/eat blocks
      // are the meal reminders now. Sending the meal plan as well would add a
      // second, fixed-time meal schedule on top of it.
      await syncReminderSettings({ mealWeekPlan: null, plannerBlocks: toPushBlocks(effectiveBlocks), plannerNotifs: true });
    } catch (e) {
      console.warn('[fedha] planner reminders resync failed:', e?.message);
    }
  }

  // Rebuild today's schedule whenever the underlying Tech Hub / Jobs data
  // changes, then layer any per-day manual edits on top.
  useEffect(() => {
    async function load() {
      // "Anchored" = built from the moment I'm Awake was pressed (stored under
      // the same key the AI version used, so an existing plan keeps loading).
      const mealWeekPlan = await getSetting('meal_week_plan', null);
      const anchoredBlocks = await getSetting(`planner_ai_blocks_${todayISO()}`, null);
      const isAnchored = !!anchoredBlocks?.length;
      const raw = isAnchored
        ? anchoredBlocks
        : buildTodayBlocks({ hackathons, startups, projects, onlineJobs, research, clientProjects, courses }, isWeekend);
      const generated = withMealNotes(raw, mealWeekPlan);
      setUsingAI(isAnchored);
      setDroppedToday(isAnchored ? await getSetting(`planner_dropped_${todayISO()}`, []) : (raw._droppedToday || []));
      const overrides = await getSetting(`planner_overrides_${todayISO()}`, {});
      const patched = generated.map((b) => (overrides[b.id] ? { ...b, ...overrides[b.id] } : b));
      // Some override entries aren't patches to a generated block at all —
      // they're genuinely new blocks (e.g. an activity Jarvis added via
      // propose_add_planner_activity), identifiable because their id
      // doesn't match anything buildTodayBlocks produced. Without this,
      // those entries sit in settings forever but never render, since the
      // .map() above only ever visits ids that already exist in `generated`.
      const generatedIds = new Set(generated.map((b) => b.id));
      const extraBlocks = Object.values(overrides).filter((o) => o?.id && !generatedIds.has(o.id));
      const eventBlocks = await loadTodayEventBlocks();
      const merged = applyEventBlocks([...patched, ...extraBlocks].sort((a, b) => t2m(a.time) - t2m(b.time)), eventBlocks);
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
  }, [workSignature]);

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
    if (!ok) return;
    setNotifEnabled(true);
    await setSetting('planner_notifs', true);

    // Subscribe to real push first, so reminders still fire once the app is
    // closed. Then one sync call schedules the in-app timers AND mirrors the
    // plan to the server, replacing anything that was there before.
    try {
      const { ensurePushSubscription } = await import('../lib/push');
      await ensurePushSubscription();
    } catch (e) {
      console.warn('[fedha] push subscription on enable failed:', e?.message);
    }
    await syncPlannerBlocksSetting(blocks);
    showNotif({ tag: 'planner_active', title: '🟢 Fedha Planner Active', body: `Reminders are on for today's ${isWeekend ? 'weekend' : 'weekday'} schedule.`, vibrate: VIBRATE.gentle });
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
        if (b.type === 'event') return b; // events are fixed on the clock
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
  }

  async function resetToday() {
    await setSetting(`planner_overrides_${todayISO()}`, {});
    await setSetting(`planner_ai_blocks_${todayISO()}`, null);
    await setSetting(`planner_dropped_${todayISO()}`, []);
    setUsingAI(false);
    setAiError(null);
    // Full context (this used to leave out client projects and courses, so a
    // reset quietly dropped paid client work from the plan).
    const fresh = buildTodayBlocks({ hackathons, startups, projects, onlineJobs, research, clientProjects, courses }, isWeekend);
    setDroppedToday(fresh._droppedToday || []);
    const mealWeekPlan = await getSetting('meal_week_plan', null);
    const withEvents = applyEventBlocks(withMealNotes(fresh, mealWeekPlan), await loadTodayEventBlocks());
    setBlocks(withEvents);
    await syncPlannerBlocksSetting(withEvents);
  }

  // "I'm Awake" — rebuilds the REST of today starting from this exact moment.
  // It uses the same builder as the automatic plan (so lunch and dinner stay
  // pinned to 13:00 / 19:00, client work gets the biggest share, workouts sit
  // clear of meals) with two differences: the clock starts now instead of at
  // the usual wake time, and anything already ticked off today is not
  // scheduled again. It used to ask a language model to invent the whole day
  // from a long context dump; the model knew nothing about the pinned meals,
  // reused block ids between runs, and could return a different shape every
  // time, which is why the result felt random.
  async function planFromNow() {
    setAiGenerating(true); setAiError(null);
    try {
      const nowDate = new Date();
      // Round up to the next 5 minutes so the first block starts on a clean time.
      const startAt = Math.ceil((nowDate.getHours() * 60 + nowDate.getMinutes() + 1) / 5) * 5;

      const built = buildTodayBlocks(
        { hackathons, startups, projects, onlineJobs, research, clientProjects, courses },
        isWeekend,
        { startAt, doneIds: completedIds },
      );
      const mealWeekPlan = await getSetting('meal_week_plan', null);
      const computed = withMealNotes(built, mealWeekPlan);
      if (!computed.length) throw new Error('Nothing left to plan today.');
      const dropped = built._droppedToday || [];

      await setSetting(`planner_overrides_${todayISO()}`, {});
      await setSetting(`planner_ai_blocks_${todayISO()}`, computed);
      await setSetting(`planner_dropped_${todayISO()}`, dropped);
      const withEvents = applyEventBlocks(computed, await loadTodayEventBlocks());
      setUsingAI(true);
      setDroppedToday(dropped);
      setBlocks(withEvents);
      await syncPlannerBlocksSetting(withEvents);
    } catch (e) {
      setAiError(e.message || 'Could not plan your day — try again.');
    } finally {
      setAiGenerating(false);
    }
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
          <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:16 }}>{format(now,'EEEE, d MMMM yyyy')} · {usingAI ? 'planned from when you woke up' : "auto-built from Tech Hub, My Jobs & today's workout"}</div>

          <button onClick={planFromNow} disabled={aiGenerating}
            style={{ width:'100%', padding:'14px 16px', background: usingAI ? 'var(--card-2)' : 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(59,130,246,0.15))', border: `1px solid ${usingAI ? 'var(--border)' : 'rgba(16,185,129,0.35)'}`, borderRadius:12, display:'flex', alignItems:'center', gap:12, cursor: aiGenerating ? 'default' : 'pointer', marginBottom:14, textAlign:'left', fontFamily:'Outfit' }}>
            <span style={{ fontSize:22 }}>{aiGenerating ? '⏳' : '☀️'}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>
                {aiGenerating ? 'Planning your day…' : usingAI ? 'Re-plan From Now' : "I'm Awake — Plan My Day"}
              </div>
              <div style={{ fontSize:12, color:'var(--text-3)' }}>
                {aiGenerating ? 'Fitting your day around lunch and dinner' : 'Rebuilds the rest of today from right now. Lunch stays at 1 PM, dinner at 7 PM, work fills the gaps'}
              </div>
            </div>
          </button>
          {aiError && (
            <div style={{ padding:'10px 14px', background:'var(--red-dim)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, fontSize:13, color:'var(--red)', marginBottom:14 }}>
              ⚠ {aiError}
            </div>
          )}

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
              ⚠️ Not enough time left for everything today, so this was left out: {droppedToday.map((d) => d.label).join(', ')}.
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
                { label:'Work Time', v: blocks.filter(b=>['coding','learning'].includes(b.type)).reduce((s,b)=>s+b.duration,0), color:'#10B981', emoji:'💻' },
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
                    onClick={() => { if (block.type !== 'event') setEditBlock(block); }}>
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
