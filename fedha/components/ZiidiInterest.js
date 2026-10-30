import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { creditZiidiInterest } from '../lib/ziidi';

// Invisible: once the wallets have loaded, credits the Ziidi Locked interest for every midnight since the last run.
let ran = false;
export default function ZiidiInterest() {
  const { wallets, addTransaction, loading } = useApp();
  const busy = useRef(false);
  useEffect(() => {
    if (ran || busy.current || loading || !wallets?.length || !addTransaction) return;
    busy.current = true;
    creditZiidiInterest(wallets, addTransaction).catch(() => null).finally(() => { ran = true; busy.current = false; });
  }, [wallets, addTransaction, loading]);
  return null;
}
