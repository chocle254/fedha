import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppProvider } from '../context/AppContext';
import { isSupabaseEnabled, getSession, onAuthChange } from '../lib/supabase';
import '../styles/globals.css';

function Splash() {
  return <div aria-hidden="true" style={{ background: 'var(--bg)', minHeight: '100vh' }} />;
}

function ConfigErrorScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24, textAlign: 'center' }}>
      <div>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Supabase isn't configured</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 320 }}>
          Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your deployment's environment variables, then redeploy.
        </div>
      </div>
    </div>
  );
}

function NotificationScheduler() {
  useEffect(() => {
    async function setup() {
      if (typeof window === 'undefined') return;
      const { notifGranted, scheduleMealReminders, schedulePlannerReminders, cancelAll } = await import('../lib/notifications');
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
      }

      // ── Real push: works even when the app is fully closed ──────────────
      // The setTimeout scheduling above only runs while this tab is alive.
      // This subscribes the browser to Web Push and mirrors the same
      // meal/planner data to Supabase so a server-side Edge Function can
      // send the reminder as an actual push message.
      try {
        const { ensurePushSubscription, syncReminderSettings, listenForSubscriptionRotation } = await import('../lib/push');
        listenForSubscriptionRotation();
        await ensurePushSubscription();
        await syncReminderSettings({ mealWeekPlan: mealPlan, plannerBlocks: blocks, plannerNotifs: notifEnabled });
      } catch (e) {
        console.warn('[fedha] push setup skipped:', e?.message);
      }

      // Notify about registered hackathons close to their deadline
      const { getHackathons } = await import('../lib/db');
      const { countdownTo, URGENT_MS } = await import('../lib/utils');
      const { showNotif, VIBRATE } = await import('../lib/notifications');
      const hacks = await getHackathons();
      const alertedKey = `hack_alerted_${todayISO()}`;
      const alerted = await getSetting(alertedKey, []);
      const newlyAlerted = [...alerted];
      for (const h of hacks || []) {
        if (!h.deadline) continue;
        if ((h.status || (h.submitted ? 'submitted' : 'active')) !== 'active') continue;
        const c = countdownTo(h.deadline);
        // within the shared urgency window, not past, and not already alerted today
        if (c && !c.past && c.total < URGENT_MS && !alerted.includes(h.id)) {
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

      // Income plans and loans: alert when their due date is close, same
      // urgency window and same "once per item per day" dedup as hackathons.
      // The actual message is phrased by Jarvis (lib/jarvis-nudges.js) so
      // it reads as Jarvis noticing something, rather than a templated
      // system string — this replaces what used to be a plain showNotif
      // call here.
      const { getIncomePlans, getLoans } = await import('../lib/db');
      const { formatShort } = await import('../lib/utils');
      const { fireJarvisNudge } = await import('../lib/jarvis-nudges');
      const plans = await getIncomePlans();
      const planAlertedKey = `income_alerted_${todayISO()}`;
      const planAlerted = await getSetting(planAlertedKey, []);
      const newlyPlanAlerted = [...planAlerted];
      for (const p of plans || []) {
        if (!p.expected_date || p.is_received) continue;
        const c = countdownTo(p.expected_date);
        if (c && !c.past && c.total < URGENT_MS && !planAlerted.includes(p.id)) {
          await fireJarvisNudge(
            `income_${p.id}`,
            `The user is expecting income "${p.name}" (${formatShort(Number(p.expected_amount))}) — ${c.days > 0 ? `${c.days}d ${c.hours}h` : `${c.hours}h ${c.minutes}m`} left until the expected date. Nudge them to watch for it and mark it received once it lands.`
          );
          newlyPlanAlerted.push(p.id);
        }
      }
      if (newlyPlanAlerted.length !== planAlerted.length) await setSettingSafe(planAlertedKey, newlyPlanAlerted);

      const loans = await getLoans();
      const loanAlertedKey = `loan_alerted_${todayISO()}`;
      const loanAlerted = await getSetting(loanAlertedKey, []);
      const newlyLoanAlerted = [...loanAlerted];
      for (const l of loans || []) {
        if (!l.due_date || l.status !== 'active') continue;
        const c = countdownTo(l.due_date);
        if (c && !c.past && c.total < URGENT_MS && !loanAlerted.includes(l.id)) {
          await fireJarvisNudge(
            `loan_${l.id}`,
            l.type === 'borrowed'
              ? `The user owes ${l.contact_name} ${formatShort(Number(l.remaining ?? l.amount))} — ${c.days > 0 ? `${c.days}d ${c.hours}h` : `${c.hours}h ${c.minutes}m`} left until it's due. Remind them to sort it out.`
              : `${l.contact_name} owes the user ${formatShort(Number(l.remaining ?? l.amount))} — ${c.days > 0 ? `${c.days}d ${c.hours}h` : `${c.hours}h ${c.minutes}m`} left until due. Suggest following up.`
          );
          newlyLoanAlerted.push(l.id);
        }
      }
      if (newlyLoanAlerted.length !== loanAlerted.length) await setSettingSafe(loanAlertedKey, newlyLoanAlerted);

      // Budget overspending — the one nudge type not already covered above.
      const { checkBudgetNudges } = await import('../lib/jarvis-nudges');
      await checkBudgetNudges();
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
  // Defer rendering the page until the client has mounted so the server HTML
  // and the first client paint match exactly (prevents hydration mismatches
  // caused by date/time and client-only data rendered during initial render).
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState(undefined); // undefined = still checking
  const isLoginPage = router.pathname === '/login';
  // Certificate verification links are meant to be opened by anyone, logged
  // in or not — they're read-only and fetch their own data via the public
  // /api/certificate/[id] endpoint, so they never need AppProvider/Supabase
  // auth at all.
  const isPublicPage = isLoginPage || router.pathname === '/certificate/[id]';

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isSupabaseEnabled()) { setSession(null); return; }
    let unsub = () => {};
    getSession().then(setSession);
    unsub = onAuthChange(setSession);
    return () => unsub();
  }, []);

  // Redirect based on auth state once we actually know it.
  useEffect(() => {
    if (!mounted || session === undefined) return;
    if (!session && !isPublicPage) router.replace('/login');
    else if (session && isLoginPage) router.replace('/');
  }, [mounted, session, isPublicPage, isLoginPage, router]);

  if (!isSupabaseEnabled() && !isPublicPage) return <ConfigErrorScreen />;
  if (!mounted || (session === undefined && !isPublicPage)) return <Splash />;

  // The certificate page never needs auth or AppProvider — render it as-is.
  if (router.pathname === '/certificate/[id]') return <Component {...pageProps} />;

  // Unauthenticated: only the login page itself is allowed to render.
  if (!session) return isLoginPage ? <Component {...pageProps} /> : <Splash />;

  // Authenticated but sitting on /login (about to redirect) — show splash
  // instead of flashing the login form.
  if (isLoginPage) return <Splash />;

  return (
    <AppProvider>
      <NotificationScheduler />
      <Component {...pageProps} />
    </AppProvider>
  );
}
