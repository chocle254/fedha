// Fedha Notification System
// Schedules meal, planner and event reminders via service worker
// Works offline as long as Chrome is running in background

// ─── VIBRATION PATTERNS ───────────────────────────────────────────────────────
export const VIBRATE = {
  gentle:  [100, 50, 100],
  medium:  [200, 100, 200],
  strong:  [300, 100, 300, 100, 300],
  urgent:  [500, 100, 500, 100, 500, 100, 500],
  success: [100, 50, 100, 50, 300],
};

// ─── CHECK PERMISSION ─────────────────────────────────────────────────────────
export function canNotify() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export function notifGranted() {
  return canNotify() && Notification.permission === 'granted';
}

export async function requestPermission() {
  if (!canNotify()) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// ─── SHOW NOTIFICATION ────────────────────────────────────────────────────────
export async function showNotif({ title, body, icon = '/icon.svg', badge = '/icon.svg', tag, vibrate = VIBRATE.medium, requireInteraction = false, actions = [] }) {
  if (!notifGranted()) return;

  if (navigator.vibrate) navigator.vibrate(vibrate);

  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      vibrate,
      requireInteraction,
      actions,
      data: { url: '/' },
    });
  } catch {
    try { new Notification(title, { body, icon, tag }); } catch {}
  }
}

// ─── SCHEDULE A NOTIFICATION ──────────────────────────────────────────────────
// Fires at a specific time today. Returns the timeout ID so you can cancel it.
const scheduled = {};

export function scheduleAt(timeStr, id, notifOptions) {
  if (!notifGranted()) return;

  if (scheduled[id]) clearTimeout(scheduled[id]);

  const [h, m] = timeStr.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  const delay = target - Date.now();

  if (delay <= 0 || delay > 24 * 60 * 60 * 1000) return;

  scheduled[id] = setTimeout(() => showNotif(notifOptions), delay);
  return scheduled[id];
}

// Schedule against an exact Date, used for event reminders that may be on a
// future day rather than only today's HH:mm clock time.
export function scheduleAtDate(date, id, notifOptions) {
  if (!notifGranted() || !(date instanceof Date) || Number.isNaN(date.getTime())) return;

  if (scheduled[id]) clearTimeout(scheduled[id]);

  const delay = date.getTime() - Date.now();
  if (delay <= 0 || delay > 7 * 24 * 60 * 60 * 1000) return;

  scheduled[id] = setTimeout(() => showNotif(notifOptions), delay);
  return scheduled[id];
}

export function cancelSchedule(id) {
  if (scheduled[id]) { clearTimeout(scheduled[id]); delete scheduled[id]; }
}

export function cancelAll() {
  Object.keys(scheduled).forEach(id => clearTimeout(scheduled[id]));
  Object.keys(scheduled).forEach(id => delete scheduled[id]);
}

// Cancels every pending schedule whose id starts with `prefix`. The planner
// uses this to throw away ALL of the previous plan's reminders before
// scheduling the new one, without touching meal or event reminders.
export function cancelByPrefix(prefix) {
  Object.keys(scheduled).forEach((id) => {
    if (id.startsWith(prefix)) { clearTimeout(scheduled[id]); delete scheduled[id]; }
  });
}

// ─── MEAL REMINDERS ───────────────────────────────────────────────────────────
export function scheduleMealReminders(meals) {
  if (!notifGranted() || !meals) return;

  const slots = {
    breakfast: { prepTime: '06:20', eatTime: '06:40', label: 'Breakfast' },
    snack:     { prepTime: null,    eatTime: '10:50', label: '10am Snack' },
    lunch:     { prepTime: '13:00', eatTime: '13:25', label: 'Lunch' },
    dinner:    { prepTime: '18:30', eatTime: '18:50', label: 'Dinner' },
  };

  Object.entries(slots).forEach(([slot, times]) => {
    const meal = meals[slot];
    if (!meal) return;

    if (times.prepTime) {
      scheduleAt(times.prepTime, `meal_prep_${slot}`, {
        title: `🍳 Start cooking ${times.label} now`,
        body: `${meal.name} — ready by ${formatTime12(times.eatTime)}. Ingredients: ${meal.ingredients.split(',')[0]}…`,
        tag: `meal_prep_${slot}`,
        vibrate: VIBRATE.strong,
        requireInteraction: true,
        actions: [{ action: 'open', title: 'See recipe' }],
      });
    }

    scheduleAt(times.eatTime, `meal_eat_${slot}`, {
      title: `🍽️ Time to eat ${times.label}!`,
      body: `${meal.name} — ${meal.cal} cal · ${meal.protein} protein`,
      tag: `meal_eat_${slot}`,
      vibrate: VIBRATE.medium,
    });
  });
}

// ─── PLANNER BLOCK REMINDERS ──────────────────────────────────────────────────
// ONE scheduler for the planner. Every caller (the planner page, the app-level
// scheduler in _app.js) goes through here, and each call first cancels every
// earlier `block_*` timer, so scheduling is idempotent: calling it twice, or
// regenerating the day, can never leave a previous plan's reminders behind.
const WORK_TYPES = new Set(['coding', 'learning', 'research']);

function toMins(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }
function fromMins(n) { return `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; }

function blockMessage(b) {
  const label = String(b.label || '');
  switch (b.type) {
    case 'meal':
      if (/^prepare/i.test(label)) return { title: `🍳 Start cooking — ${label.replace(/^prepare\s+/i, '')}`, body: b.note };
      if (/^eat/i.test(label)) return { title: `🍽️ ${label}`, body: b.note };
      return { title: `🍌 ${label}`, body: b.note };
    case 'coding':   return { title: `💻 ${label}`, body: `Phone away. ${b.note}` };
    case 'learning': return { title: `🎓 ${label}`, body: b.note };
    case 'research': return { title: `🔍 ${label}`, body: b.note };
    case 'workout':  return { title: `🏋️ ${label}`, body: b.note };
    case 'health':   return { title: `🛁 ${label}`, body: b.note };
    case 'gaming':   return { title: '🎮 Gaming time', body: b.note };
    case 'chores':   return { title: `🏠 ${label}`, body: b.note };
    case 'event':    return { title: `📅 ${label} starts now`, body: b.note };
    case 'personal': return { title: /bae/i.test(label) ? `💕 ${label}` : `🎧 ${label}`, body: b.note };
    case 'sleep':    return { title: '😴 Time to sleep', body: b.note };
    default:         return { title: `⏰ ${label}`, body: b.note };
  }
}

function blockVibrateFor(b) {
  if (b.type === 'sleep') return VIBRATE.urgent;
  if (b.type === 'meal' || b.type === 'event') return VIBRATE.strong;
  if (['coding', 'learning', 'research', 'workout'].includes(b.type)) return VIBRATE.medium;
  return VIBRATE.gentle;
}

export function schedulePlannerReminders(blocks) {
  if (!notifGranted() || !Array.isArray(blocks)) return;

  cancelByPrefix('block_'); // drop every reminder from any earlier version of the plan

  const warn = (b, minsBefore, key, opts) => {
    const at = toMins(b.time) - minsBefore;
    if (at <= 0) return;
    scheduleAt(fromMins(at), `block_${key}_${b.id}`, { tag: `block_${key}_${b.id}`, ...opts });
  };

  blocks.forEach((b) => {
    if (!b?.time) return;
    const msg = blockMessage(b);
    scheduleAt(b.time, `block_${b.id}`, {
      title: msg.title,
      body: msg.body,
      tag: `block_${b.id}`,
      vibrate: blockVibrateFor(b),
      requireInteraction: ['coding', 'learning', 'sleep', 'meal', 'event'].includes(b.type),
    });

    // The planner has a separate "Prepare …" block before every meal, so there
    // is no extra "start cooking in 25 min" warning any more — it would just
    // duplicate that block's own reminder.
    if (WORK_TYPES.has(b.type)) {
      warn(b, 5, '5min', { title: `⚠️ ${b.label} in 5 minutes`, body: 'Put your phone down and get ready.', vibrate: VIBRATE.medium });
    }
    if (b.type === 'workout') {
      warn(b, 5, '5min', { title: `🏋️ ${b.label} in 5 minutes`, body: 'Get changed and get water ready.', vibrate: VIBRATE.medium });
    }
    if (b.type === 'sleep') {
      warn(b, 30, 'sleep_warn', { title: '🌙 Wind down — sleep in 30 mins', body: 'Put the phone down. Start wrapping up.', vibrate: VIBRATE.gentle });
    }
  });
}

// Convenience used after any plan change: replaces all planner reminders with
// the ones for `blocks`.
export function syncPlannerReminders(blocks) {
  schedulePlannerReminders(blocks);
}

// ─── EVENT REMINDERS ──────────────────────────────────────────────────────────
// Event reminders fire 30 minutes before an event's exact start time.
export function scheduleEventReminder(event, startDate) {
  if (!notifGranted() || !(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return;

  const reminder = new Date(startDate.getTime() - 30 * 60 * 1000);
  const id = `event_30m_${event.id}`;

  if (reminder <= new Date()) return;

  return scheduleAtDate(reminder, id, {
    title: `📅 ${event.name || 'Upcoming event'} starts in 30 minutes`,
    body: [event.location || event.venue, event.url_hint ? `Link: ${event.url_hint}` : null].filter(Boolean).join(' · ') || 'Get ready to join.',
    tag: id,
    vibrate: VIBRATE.strong,
    requireInteraction: true,
  });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function formatTime12(t) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ─── MISSED BLOCK ALERT ───────────────────────────────────────────────────────
export async function checkMissedBlocks(blocks, completedIds) {
  if (!notifGranted() || !blocks) return;

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const missed = blocks.filter(b => {
    const [h, m] = b.time.split(':').map(Number);
    const blockMins = h * 60 + m;
    const blockEnd = blockMins + b.duration;
    return nowMins > blockEnd && !completedIds.includes(b.id) && b.type !== 'sleep';
  });

  if (missed.length > 0) {
    await showNotif({
      title: `⚠️ ${missed.length} missed block${missed.length > 1 ? 's' : ''} today`,
      body: missed.slice(0, 2).map(b => b.label).join(', ') + (missed.length > 2 ? ` +${missed.length - 2} more` : ''),
      tag: 'missed_blocks',
      vibrate: VIBRATE.strong,
    });
  }
}
