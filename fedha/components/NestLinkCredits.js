import { useCallback, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { getSession } from '../lib/supabase';
import { getTransaction } from '../lib/db';
import { showNotif } from '../lib/notifications';
import { applyCredits } from '../lib/nestlink-credits';

const POLL_MS = 3000;

// Invisible. While Luxe is open it asks the server which NestLink payouts have
// finished, credits them to the "mpesa 2" wallet and shows a notification.
export default function NestLinkCredits() {
  const { wallets, addTransaction } = useApp();
  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;
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
        wallets: walletsRef.current, addTransaction, getTransaction, notify: showNotif
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
    run();
    const t = setInterval(run, POLL_MS);
    const onVisible = () => run();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('nestlink-sweep', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('nestlink-sweep', onVisible);
    };
  }, [run]);

  return null;
}
