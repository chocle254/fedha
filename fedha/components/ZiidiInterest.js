import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { creditZiidiInterest } from '../lib/ziidi';

// Invisible: once the wallets have loaded, credits the Ziidi interest for every midnight since the last run, and
// checks again every 10 minutes so a day rolling over while Luxe stays open is paid too (never twice).
let ran = false;
export default function ZiidiInterest() {
  const { wallets, addTransaction, loading } = useApp();
  const busy = useRef(false);
  const latest = useRef({ wallets, addTransaction }); latest.current = { wallets, addTransaction };
  const run = () => {
    const { wallets: w, addTransaction: add } = latest.current;
    if (busy.current || !w?.length || !add) return;
    busy.current = true;
    creditZiidiInterest(w, add).catch(() => null).finally(() => { ran = true; busy.current = false; });
  };
  useEffect(() => { if (!ran && !loading) run(); }, [wallets, addTransaction, loading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(run, 600000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
