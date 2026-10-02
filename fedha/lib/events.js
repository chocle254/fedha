// Shared event-time logic for Tech Hub, the Planner and Jarvis.
//
// An event is stored as { date: 'YYYY-MM-DD', time: 'HH:MM', end_time: 'HH:MM', tz }.
//  - `tz` is 'LOCAL' (or missing) for "my phone's local time", or an abbreviation
//    from TZ_ABBREVIATIONS (e.g. 'UTC', 'PT', 'EAT') when the organiser quoted
//    their own timezone. Everything is converted to a real instant here, so the
//    countdown, the sort order, the planner slot and the auto-removal all agree
//    with the clock on the phone.
//  - No `time` means an all-day event: it lives until the end of that date.
//  - No `end_time` means a default one-hour slot.
import { tzOffsetFor } from './utils';
import { getSetting, setSetting } from './db';

export const DEFAULT_EVENT_MINUTES = 60;
const MIN = 60000;

function parseHM(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return [h, mi];
}

function instantFor(dateStr, hm, tz) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  if (!tz || tz === 'LOCAL') return new Date(y, mo - 1, d, hm[0], hm[1], 0, 0);
  return new Date(Date.UTC(y, mo - 1, d, hm[0], hm[1]) - tzOffsetFor(tz) * 3600000);
}

// → { start: Date, end: Date, allDay: boolean } or null when the event has no usable date.
export function eventWindow(event) {
  if (!event) return null;

  // Full ISO date-time (older/AI-shaped records): treat as an exact instant.
  const full = event.datetime || event.start_time || event.start;
  if (full && /T/.test(String(full))) {
    const start = new Date(full);
    if (!Number.isNaN(start.getTime())) {
      const endHM = parseHM(event.end_time);
      let end = new Date(start.getTime() + DEFAULT_EVENT_MINUTES * MIN);
      if (endHM) {
        end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), endHM[0], endHM[1], 0, 0);
        if (end <= start) end = new Date(end.getTime() + 86400000);
      }
      return { start, end, allDay: false };
    }
  }

  const dateStr = String(event.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

  const startHM = parseHM(event.time);
  if (!startHM) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return {
      start: new Date(y, mo - 1, d, 0, 0, 0, 0),
      end: new Date(y, mo - 1, d, 23, 59, 59, 999),
      allDay: true,
    };
  }

  const start = instantFor(dateStr, startHM, event.tz);
  const endHM = parseHM(event.end_time);
  let end;
  if (endHM) {
    end = instantFor(dateStr, endHM, event.tz);
    if (end <= start) end = new Date(end.getTime() + 86400000); // ends after midnight
  } else {
    end = new Date(start.getTime() + DEFAULT_EVENT_MINUTES * MIN);
  }
  return { start, end, allDay: false };
}

export function isEventEnded(event, nowMs = Date.now()) {
  const w = eventWindow(event);
  return !!w && nowMs >= w.end.getTime();
}

// Soonest first. Events without a usable date go to the bottom.
export function sortEventsByStart(events) {
  return [...events].sort((a, b) => {
    const wa = eventWindow(a);
    const wb = eventWindow(b);
    const ta = wa ? wa.start.getTime() : Infinity;
    const tb = wb ? wb.start.getTime() : Infinity;
    if (ta !== tb) return ta < tb ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

const pad = (n) => String(n).padStart(2, '0');
export const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// "16:00 – 18:00" in the phone's local time (what the clock on the phone shows).
export function eventTimeLabel(event) {
  const w = eventWindow(event);
  if (!w || w.allDay) return null;
  return `${hhmm(w.start)} – ${hhmm(w.end)}`;
}

// "Fri, 2 Oct" in local time.
export function eventDateLabel(event) {
  const w = eventWindow(event);
  if (!w) return null;
  return w.start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Drops events that have finished. Persists the cleanup (manual events only —
// AI-discovered ones never live in storage) and returns what's left.
export async function pruneEndedEvents() {
  const stored = await getSetting('tech_hub_events', []);
  const list = Array.isArray(stored) ? stored : [];
  const live = list.filter((e) => !isEventEnded(e));
  if (live.length !== list.length) await setSetting('tech_hub_events', live);
  return live;
}

// Planner blocks for events that fall on the local day of `now`.
export function todaysEventBlocks(events, now = new Date()) {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const blocks = [];
  for (const e of events || []) {
    const w = eventWindow(e);
    if (!w || w.allDay) continue;
    if (w.end <= dayStart || w.start >= dayEnd) continue;
    const s = w.start < dayStart ? dayStart : w.start;
    const en = w.end > dayEnd ? dayEnd : w.end;
    const duration = Math.max(5, Math.round((en - s) / MIN));
    const where = e.location || e.venue;
    blocks.push({
      id: `event_${e.id}`,
      time: hhmm(s),
      label: e.name || 'Event',
      type: 'event',
      duration,
      emoji: e.emoji || '📅',
      note: [
        `Fixed event, ${hhmm(w.start)} – ${hhmm(w.end)}.`,
        where ? `Where: ${where}.` : null,
        e.url_hint ? `Link: ${e.url_hint}` : null,
      ].filter(Boolean).join(' '),
    });
  }
  return blocks.sort((a, b) => a.time.localeCompare(b.time));
}
