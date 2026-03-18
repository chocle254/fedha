import { useEffect } from 'react';
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
    }

    // Small delay so IndexedDB is ready
    const t = setTimeout(setup, 1500);
    return () => clearTimeout(t);
  }, []);

  return null;
}

export default function App({ Component, pageProps }) {
  return (
    <AppProvider>
      <NotificationScheduler />
      <Component {...pageProps} />
    </AppProvider>
  );
}
