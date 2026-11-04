import { useCallback, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { getSession } from '../lib/supabase';
import { getTransaction } from '../lib/db';
import { showNotif } from '../lib/notifications';
import { applyCredits } from '../lib/nestlink-credits';
import { summarize, incomeLine } from '../lib/earnings';

// Payouts are rare: check every minute, and every 3 s for 5 minutes after you start one (a request every 3 s
// all day kept the phone's radio awake and warmed it up).
const POLL_MS = 60000;
const FAST_MS = 3000;
const FAST_FOR = 5 * 60000;

// Invisible. While Luxe is open it asks the server which NestLink payouts have
// finished, credits them to the "mpesa 2" wallet and shows a notification.
export default function NestLinkCredits() {
  const { wallets, addTransaction, transactions } = useApp();
  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;
  const txRef = useRef(transactions);
  txRef.current = transactions;
  const busy = useRef(false);
  const warned = useRef(false);

  const run = useCallback(async () => {
    if (busy.current || document.visibilityState !== 'visible') return;
    busy.current = true;
    try {
      const session = await getSession();
      const token = session?.access_token;
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const r = await fetch('/api/utilities/credits', { headers, cache: 'no-store' });
      if (!r.ok) return;
      const payload = await r.json().catch(() => null);
      if (!payload || (!payload.completed?.length && !payload.failed?.length)) return;

      const { acked, missingWallet } = await applyCredits(payload, {
        wallets: walletsRef.current, addTransaction, getTransaction, notify: showNotif,
        // Totals counted before this payout is added, plus the payout itself.
        moneyLine: (amount) => incomeLine(summarize(txRef.current, Date.now(), amount)),
      });
      if (missingWallet && !warned.current) {
        warned.current = true;
        showNotif({ title: 'Wallet "mpesa 2" not found', body: 'A NestLink payout finished but could not be credited. Create a wallet named mpesa 2.', tag: 'nestlink-missing-wallet' });
      }
      if (acked.length) {
        await fetch('/api/utilities/credits', {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ references: acked })
        });
      }
    } catch (e) {
      console.warn('[fedha] NestLink credit check failed:', e?.message);
    } finally {
      busy.current = false;
    }
  }, [addTransaction]);

  useEffect(() => {
    let fastUntil = 0; let t = 0;
    const loop = () => { run(); t = setTimeout(loop, Date.now() < fastUntil ? FAST_MS : POLL_MS); };
    loop();
    const onVisible = () => run();
    const onSweep = () => { fastUntil = Date.now() + FAST_FOR; clearTimeout(t); loop(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('nestlink-sweep', onSweep);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('nestlink-sweep', onSweep);
    };
  }, [run]);

  return null;
}
