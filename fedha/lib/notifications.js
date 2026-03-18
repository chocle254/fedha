// Fedha Notification System
// Schedules meal and planner reminders via service worker
// Works offline as long as Chrome is running in background

// ─── VIBRATION PATTERNS ───────────────────────────────────────────────────────
export const VIBRATE = {
  gentle:  [100, 50, 100],                          // soft reminder
  medium:  [200, 100, 200],                          // normal alert
  strong:  [300, 100, 300, 100, 300],               // important (meals, school)
  urgent:  [500, 100, 500, 100, 500, 100, 500],     // sleep, missed block
  success: [100, 50, 100, 50, 300],                  // completed set / done
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

  // Vibrate immediately
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
    // Fallback to basic notification
    try { new Notification(title, { body, icon, tag }); } catch {}
  }
}

// ─── SCHEDULE A NOTIFICATION ──────────────────────────────────────────────────
// Fires at a specific time today. Returns the timeout ID so you can cancel it.
const scheduled = {};

export function scheduleAt(timeStr, id, notifOptions) {
  if (!notifGranted()) return;

  // Cancel existing schedule for this id
  if (scheduled[id]) clearTimeout(scheduled[id]);

  const [h, m] = timeStr.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  const delay = target - Date.now();

  if (delay <= 0 || delay > 24 * 60 * 60 * 1000) return; // skip past or too far

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

// ─── MEAL REMINDERS ───────────────────────────────────────────────────────────
// Call this once when app loads with today's meal plan
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

    // Prep reminder (cook now)
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

    // Eat reminder
    scheduleAt(times.eatTime, `meal_eat_${slot}`, {
      title: `🍽️ Time to eat ${times.label}!`,
      body: `${meal.name} — ${meal.cal} cal · ${meal.protein} protein`,
      tag: `meal_eat_${slot}`,
      vibrate: VIBRATE.medium,
    });
  });
}

// ─── PLANNER BLOCK REMINDERS ──────────────────────────────────────────────────
export function schedulePlannerReminders(blocks) {
  if (!notifGranted() || !blocks) return;

  blocks.forEach(block => {
    const [h, m] = block.time.split(':').map(Number);

    // On-time notification
    scheduleAt(block.time, `block_${block.id}`, {
      title: blockTitle(block),
      body: block.note,
      tag: `block_${block.id}`,
      vibrate: blockVibrate(block),
      requireInteraction: ['study', 'coding', 'sleep', 'meal'].includes(block.type),
    });

    // Warning notifications before important blocks
    if (block.type === 'meal' && block.label.includes('Eat')) {
      const warnMins = h * 60 + m - 25;
      if (warnMins > 0) {
        const warnTime = `${String(Math.floor(warnMins / 60)).padStart(2,'0')}:${String(warnMins % 60).padStart(2,'0')}`;
        scheduleAt(warnTime, `block_warn_${block.id}`, {
          title: `🍳 Start cooking in 25 min`,
          body: `Prepare ${block.label.replace('Eat ','')} now so it's ready by ${formatTime12(block.time)}`,
          tag: `block_warn_${block.id}`,
          vibrate: VIBRATE.strong,
          requireInteraction: true,
        });
      }
    }

    if (block.type === 'school') {
      const warnMins = h * 60 + m - 12;
      if (warnMins > 0) {
        const warnTime = `${String(Math.floor(warnMins / 60)).padStart(2,'0')}:${String(warnMins % 60).padStart(2,'0')}`;
        scheduleAt(warnTime, `block_walk_${block.id}`, {
          title: `🚶 Leave for school NOW`,
          body: `10-min walk — arrive by ${formatTime12(block.time)}. Pack your bag.`,
          tag: `block_walk_${block.id}`,
          vibrate: VIBRATE.urgent,
          requireInteraction: true,
        });
      }
    }

    if (block.type === 'sleep') {
      const warnMins = h * 60 + m - 30;
      if (warnMins > 0) {
        const warnTime = `${String(Math.floor(warnMins / 60)).padStart(2,'0')}:${String(warnMins % 60).padStart(2,'0')}`;
        scheduleAt(warnTime, `block_sleep_warn_${block.id}`, {
          title: `🌙 Wind down — sleep in 30 mins`,
          body: 'Put the phone down. Prepare for bed. 9 hours = max muscle growth.',
          tag: `block_sleep_warn_${block.id}`,
          vibrate: VIBRATE.gentle,
        });
      }
    }

    if (['study', 'coding'].includes(block.type)) {
      const warnMins = h * 60 + m - 5;
      if (warnMins > 0) {
        const warnTime = `${String(Math.floor(warnMins / 60)).padStart(2,'0')}:${String(warnMins % 60).padStart(2,'0')}`;
        scheduleAt(warnTime, `block_5min_${block.id}`, {
          title: `⚠️ ${block.label} in 5 minutes`,
          body: 'Put your phone down and get ready. Phone goes in another room.',
          tag: `block_5min_${block.id}`,
          vibrate: VIBRATE.medium,
        });
      }
    }
  });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function formatTime12(t) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function blockTitle(block) {
  const titles = {
    meal:     `🍽️ ${block.label}`,
    study:    `📚 Study time — ${block.label}`,
    coding:   `💻 Coding block — start now`,
    school:   `🏫 ${block.label}`,
    routine:  `⏰ ${block.label}`,
    personal: block.label.toLowerCase().includes('bae') ? `💕 ${block.label}` : `🎧 ${block.label}`,
    sleep:    `😴 Time to sleep`,
  };
  return titles[block.type] || `⏰ ${block.label}`;
}

function blockVibrate(block) {
  const patterns = {
    meal:     VIBRATE.strong,
    study:    VIBRATE.medium,
    coding:   VIBRATE.medium,
    school:   VIBRATE.urgent,
    routine:  VIBRATE.gentle,
    personal: VIBRATE.gentle,
    sleep:    VIBRATE.urgent,
  };
  return patterns[block.type] || VIBRATE.medium;
}

// ─── MISSED BLOCK ALERT ───────────────────────────────────────────────────────
// Call when app opens to check for missed blocks today
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
