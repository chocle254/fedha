import { easter } from './holidays';

// Watch seasons for the Chill Room: the weeks around a holiday when a themed row of series and movies shows up
// (pages/api/chill/season.js picks them for your taste). Wider than the holiday itself so there's time to watch.
const d0 = (y, m, d) => new Date(y, m - 1, d);
export const WATCH_SEASONS = [
  { key: 'halloween', name: 'Halloween', icon: '🎃', theme: 'Halloween: horror, thrillers, supernatural, creepy and spooky-fun watches', from: (y) => d0(y, 10, 1), to: (y) => d0(y, 10, 31) },
  { key: 'christmas', name: 'Christmas', icon: '🎄', theme: 'Christmas: feel-good, festive, family, cosy and holiday-set films and series (including the cult and action ones set at Christmas)', from: (y) => d0(y, 12, 1), to: (y) => d0(y, 12, 26) },
  { key: 'newyear', name: 'New Year', icon: '🎆', theme: 'New Year: fresh starts, big nights out, ambition and reinvention, party films', from: (y) => d0(y, 12, 27), to: (y) => d0(y + 1, 1, 2), wraps: true },
  { key: 'valentine', name: "Valentine's", icon: '💝', theme: "Valentine's: romance, rom-coms, love stories and relationship dramas", from: (y) => d0(y, 2, 1), to: (y) => d0(y, 2, 14) },
  { key: 'easter', name: 'Easter', icon: '🐣', theme: 'Easter: uplifting, hopeful, faith and redemption stories, epics and family films', from: (y) => { const e = easter(y); return new Date(e.getFullYear(), e.getMonth(), e.getDate() - 14); }, to: (y) => { const e = easter(y); return new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1); } },
];

// The season on now, or starting within 2 weeks (soon: true, so there's time to download), or null.
// key + year identify it, e.g. 'christmas-2026'.
export function watchSeason(now = new Date()) {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const s of WATCH_SEASONS) {
    for (const y of [t.getFullYear(), t.getFullYear() - 1]) {
      const lead = new Date(s.from(y)); lead.setDate(lead.getDate() - 14);
      if (t >= lead && t <= s.to(y)) {
        const left = Math.round((s.to(y) - t) / 864e5);
        const soon = t < s.from(y) ? Math.round((s.from(y) - t) / 864e5) : 0;
        return { ...s, year: y, id: `${s.key}-${y}`, left, soon };
      }
    }
  }
  return null;
}
