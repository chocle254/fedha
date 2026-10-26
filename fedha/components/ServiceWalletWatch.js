import { useEffect, useRef } from 'react';
import { getSession } from '../lib/supabase';

const POLL_MS = 60000;

// Invisible. While Fedha is open it checks the UpesiPay service wallet once a minute; the
// server sends the zero-balance push notification (once) when the balance reaches zero.
export default function ServiceWalletWatch() {
  const busy = useRef(false);
  useEffect(() => {
    const run = async () => {
      if (busy.current || document.visibilityState !== 'visible') return;
      busy.current = true;
      try {
        const session = await getSession();
        if (!session?.access_token) return;
        await fetch('/api/utilities/upesipay-watch', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
      } catch (e) {
        console.warn('[fedha] UpesiPay watch failed:', e?.message);
      } finally {
        busy.current = false;
      }
    };
    run();
    const t = setInterval(run, POLL_MS);
    document.addEventListener('visibilitychange', run);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', run); };
  }, []);
  return null;
}
