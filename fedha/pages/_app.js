import { useEffect, useState } from 'react';
import { AppProvider } from '../context/AppContext';
import '../styles/globals.css';

function NotificationScheduler() {
  useEffect(() => {
    async function setup() {
      if (typeof window === 'undefined') return;
      const { notifGranted, scheduleMealReminders, schedulePlannerReminders, checkMissedBlocks, cancelAll } = await import('../lib/notifications');
      if (!notifGranted()) return;

      const { getSetting } = await import('../lib/db');
      const { todayISO } = await import('../lib/utils');

      // Cancel all existing schedules first (prevent duplicates on re-render)
      cancelAll();

      // Schedule meal reminders for today
      const mealPlan = await getSetting('meal_week_plan', null);
      if (mealPlan) {
        const dayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
        const todayMeals = mealPlan[dayIdx];
        if (todayMeals) scheduleMealReminders(todayMeals);
      }

      // Schedule planner block reminders
      const blocks = await getSetting('planner_blocks', null);
      const notifEnabled = await getSetting('planner_notifs', false);
      if (blocks && notifEnabled) {
        schedulePlannerReminders(blocks);

        // Check for missed blocks
        const completed = await getSetting(`planner_done_${todayISO()}`, []);
        await checkMissedBlocks(blocks, completed);
      }

      // Notify about registered hackathons close to their deadline
      const { getHackathons } = await import('../lib/db');
      const { countdownTo } = await import('../lib/utils');
      const { showNotif, VIBRATE } = await import('../lib/notifications');
      const hacks = await getHackathons();
      const alertedKey = `hack_alerted_${todayISO()}`;
      const alerted = await getSetting(alertedKey, []);
      const newlyAlerted = [...alerted];
      for (const h of hacks || []) {
        if (!h.deadline) continue;
        const c = countdownTo(h.deadline);
        // within 3 days, not past, and not already alerted today
        if (c && !c.past && c.total < 3 * 86400000 && !alerted.includes(h.id)) {
          await showNotif({
            title: `⏰ ${h.name} deadline is near!`,
            body: `${c.days > 0 ? `${c.days}d ${c.hours}h` : `${c.hours}h ${c.minutes}m`} left${h.project_name ? ` — finish "${h.project_name}"` : ''}. Submit before it closes!`,
            tag: `hack_${h.id}`,
            vibrate: VIBRATE.urgent,
            requireInteraction: true,
          });
          newlyAlerted.push(h.id);
        }
      }
      if (newlyAlerted.length !== alerted.length) await getSetting && setSettingSafe(alertedKey, newlyAlerted);
    }

    async function setSettingSafe(key, value) {
      try { const { setSetting } = await import('../lib/db'); await setSetting(key, value); } catch {}
    }

    // Small delay so IndexedDB is ready
    const t = setTimeout(setup, 1500);
    return () => clearTimeout(t);
  }, []);

  return null;
}

export default function App({ Component, pageProps }) {
  // This app stores all data in IndexedDB, which only exists in the browser.
  // Defer rendering the page until the client has mounted so the server HTML
  // and the first client paint match exactly (prevents hydration mismatches
  // caused by date/time and client-only data rendered during initial render).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <AppProvider>
      <NotificationScheduler />
      {mounted ? (
        <Component {...pageProps} />
      ) : (
        <div
          aria-hidden="true"
          style={{ background: 'var(--bg)', minHeight: '100vh' }}
        />
      )}
    </AppProvider>
  );
}
