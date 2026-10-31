import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../lib/utils';
import { clientTotals } from '../lib/client-pay';
import { relabelSms } from '../lib/sms-relabel';

// "What was it?" — money from (or to) someone Luxe doesn't know yet is recorded straight away as Other, so the
// balance is right; this card, on every screen, asks what it really was. One tap relabels that same transaction
// (or links it to a Tech Hub client / loan), and Luxe remembers the person next time. Also opened by the push
// notification sent the moment the SMS arrives (url /?sms=ask). "Later" hides it until the app is reopened.

const RECENT_MS = 3 * 864e5;
const QUICK_OUT = ['food', 'transport', 'shopping', 'bills', 'family'];

export default function SmsCategoryPrompt() {
  const app = useApp();
  const { wallets = [], clientProjects = [] } = app;
  const [waiting, setWaiting] = useState([]);
  const [busy, setBusy] = useState(false);
  const [later, setLater] = useState(() => { try { return JSON.parse(sessionStorage.getItem('luxe_sms_later') || '[]'); } catch { return []; } });

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/sms/inbox', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      const now = Date.now();
      // Only while automatic recording is on: otherwise you record payments yourself.
      if (!j.device?.auto?.on) { setWaiting([]); return; }
      setWaiting((j.items || []).filter((x) => x.plan?.needsCategory && !x.parsed?.category && ['recorded', 'captured'].includes(x.status)
        && now - new Date(x.received_at).getTime() < RECENT_MS));
    } catch { /* offline */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 90e3);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [load]);

  const shown = waiting.filter((x) => !later.includes(x.id));
  const x = shown[0];
  if (!x) return null;
  const p = x.parsed || {};
  const inbound = p.kind === 'received';
  const owing = inbound ? clientProjects.filter((c) => c.status !== 'completed' && clientTotals(c).remaining > 0) : [];
  const cats = inbound
    ? INCOME_CATEGORIES.filter((c) => c.id !== 'other')
    : EXPENSE_CATEGORIES.filter((c) => QUICK_OUT.includes(c.id));

  const choose = async (choice) => {
    setBusy(true);
    try {
      if (x.status === 'recorded') await relabelSms(x, choice, app);
      await fetch('/api/sms/inbox', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: x.id, category: choice }) });
      setWaiting((w) => w.filter((y) => y.id !== x.id));
      load();
    } finally { setBusy(false); }
  };
  const snooze = () => {
    const next = [...later, x.id];
    setLater(next);
    try { sessionStorage.setItem('luxe_sms_later', JSON.stringify(next)); } catch { /* private mode */ }
  };
  const wallet = wallets.find((w) => w.id === x.wallet_id)?.name;
  const time = new Date(x.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="smsq" role="dialog" aria-label="What was this payment?">
      <div className="smsq-top">
        <span className="smsq-ic">{inbound ? '💸' : '🧾'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="smsq-t"><b className="font-num">KSh {Number(p.amount || 0).toLocaleString()}</b> {inbound ? 'from' : 'to'} {p.party || 'someone new'}</div>
          <div className="smsq-s">{time}{wallet ? ` · ${wallet}` : ''} · what was it?{shown.length > 1 ? ` · ${shown.length - 1} more waiting` : ''}</div>
        </div>
        <button className="smsq-x" onClick={snooze} aria-label="Ask me later">Later</button>
      </div>
      <div className="smsq-chips">
        {owing.map((c) => (
          <button key={c.id} disabled={busy} className="smsq-chip client" onClick={() => choose(`client:${c.id}`)}>💼 {c.client_name} — {c.name}</button>
        ))}
        {cats.map((c) => <button key={c.id} disabled={busy} className="smsq-chip" onClick={() => choose(c.id)}>{c.icon} {c.label}</button>)}
        <button disabled={busy} className="smsq-chip" onClick={() => choose('other')}>📦 Other</button>
        <a className="smsq-chip" href="/wallets">More (loans)…</a>
      </div>
      <div className="smsq-s" style={{ marginTop: 8 }}>Already counted as Other, so your balance is right. Luxe remembers {p.party ? p.party.split(' ')[0] : 'them'} next time.</div>
    </div>
  );
}
