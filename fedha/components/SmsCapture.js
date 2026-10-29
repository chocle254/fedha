import { useEffect, useState } from 'react';
import { formatCurrency, INCOME_CATEGORIES, EXPENSE_CATEGORIES, getCategoryById } from '../lib/utils';
import { KIND_LABEL, partyKey, FIXED_CATEGORY, loanIdOf } from '../lib/sms-parser';
import { useApp } from '../context/AppContext';
import { loanBalance } from '../lib/finance-actions';

// Luxe → Wallets: link the Android app so it reads M-Pesa and Ziidi texts (like Truecaller), pick which SIM is
// which M-Pesa account, and see how each captured message was read. Server: lib/sms-capture.js.
// Step 1 (now): capture and show only; nothing is recorded yet. Message text is wiped once recorded or after 7 days.
const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const when = (iso) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function SmsCapture({ wallets }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const { loans = [] } = useApp();
  const openLoans = loans.filter((l) => l.status !== 'settled');
  // How a chosen category reads: a normal one, or a loan link.
  const choiceLabel = (c, p) => {
    if (c === 'loan_new') return { icon: '🤝', label: p.kind === 'received' ? 'Borrowed (new loan)' : 'Lent (new loan)', color: '#A78BFA' };
    if (loanIdOf(c)) {
      const l = loans.find((x) => x.id === loanIdOf(c));
      const more = c.startsWith('loanadd:');
      return { icon: '🤝', label: !l ? 'Loan (removed)' : more ? `${l.type === 'lent' ? 'Lent more to' : 'Borrowed more from'} ${l.contact_name.trim()}` : `Loan ${l.type === 'lent' ? 'repayment from' : 'payment to'} ${l.contact_name.trim()}`, color: '#A78BFA' };
    }
    return getCategoryById(c);
  };
  const mpesa = wallets.filter((w) => w.type === 'mobile' && !w.pocket);
  const nameOf = (id) => wallets.find((w) => w.id === id)?.name || null;

  const load = () => fetch('/api/sms/inbox', { cache: 'no-store' }).then((r) => r.json()).then(setData).catch(() => setData({ items: [] }));
  useEffect(() => { load(); }, []);

  const put = async (body) => {
    const r = await fetch('/api/sms/inbox', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) setData(await r.json());
  };

  const link = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/sms/pair', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not link.');
      window.location.href = j.link; // opens the Luxe app's PairActivity, which asks for SMS access
      setTimeout(load, 8000);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const d = data?.device;
  const items = data?.items || [];
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>📲 Read M-Pesa & Ziidi SMS</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.45 }}>
            {d ? `Phone linked${d.last_seen ? ` · last message ${when(d.last_seen)}` : ' · waiting for the first message'}.`
              : 'The Luxe app reads only M-Pesa and Ziidi texts on both SIMs and sends them here. Other messages never leave your phone.'}
          </div>
        </div>
        <button className={d ? 'btn-ghost' : 'btn-primary'} style={{ whiteSpace: 'nowrap' }} disabled={busy || !isAndroid()} onClick={link}>{busy ? '…' : d ? 'Re-link' : 'Link this phone'}</button>
      </div>
      {!isAndroid() && !d && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>Open this page in the Luxe Android app to link.</div>}
      {data?.needsMigration && <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 6 }}>Run supabase-migration-sms-inbox.sql to start saving messages.</div>}
      {err && <div style={{ fontSize: 12, color: '#EF4444', marginTop: 6 }}>{err}</div>}

      {d && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {[1, 2].map((slot) => (
            <label key={slot} style={{ flex: 1, fontSize: 12, color: 'var(--text-3)' }}>SIM {slot} is
              <select className="input" style={{ marginTop: 4 }} value={d.sims?.[slot] || ''} onChange={(e) => put({ sims: { ...d.sims, [slot]: e.target.value || null } })}>
                <option value="">— none —</option>
                {mpesa.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <>
          <button type="button" className="tx-link" style={{ marginTop: 10, fontSize: 12.5, background: 'none', border: 0, color: 'var(--text-2)', padding: 0 }} onClick={() => setOpen((o) => !o)}>
            {open ? '▴' : '▾'} {items.length} captured · {items.filter((x) => partyKey(x.parsed) && !x.parsed.category).length} need a category · {items.filter((x) => x.parsed && !x.wallet_id).length} need an account · {items.filter((x) => !x.parsed).length} not understood{data?.learned ? ` · ${data.learned} names learned` : ''}
          </button>
          {open && (
            <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Checking how Luxe reads your messages; nothing is recorded yet. Pick a category the first time a name shows up, and every later message from that name uses it. Message text is deleted once recorded, or after 7 days.</div>
              {items.map((x) => {
                const p = x.parsed;
                const ziidi = p?.kind === 'ziidi' || p?.ziidiMove;
                return (
                  <div key={x.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 12.5 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <b>{p ? (KIND_LABEL[p.kind] || p.kind) : 'Not understood'}{p?.ziidiMove ? ` · ${p.ziidiMove === 'in' ? 'into' : 'out of'} Ziidi` : ''}</b>
                      <span className="font-num">{p?.amount != null ? formatCurrency(p.amount, 'KES') : ''}</span>
                      <span style={{ flex: 1, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.party || ''}</span>
                      <span style={{ color: 'var(--text-3)', fontSize: 11 }}>SIM {x.sim_slot || '?'} · {when(x.received_at)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', color: 'var(--text-3)', fontSize: 11.5 }}>
                      <span className="font-num">{p?.balance != null ? `balance ${formatCurrency(p.balance, 'KES')}` : ''}{p?.cost ? ` · fee ${formatCurrency(p.cost, 'KES')}` : ''}{x.code ? ` · ${x.code}` : ''}</span>
                      <span style={{ flex: 1 }} />
                      <select className="input" style={{ width: 'auto', padding: '2px 6px', fontSize: 11.5 }} value={x.wallet_id || ''} onChange={(e) => put({ id: x.id, wallet_id: e.target.value })}>
                        <option value="">Which account?</option>
                        {wallets.filter((w) => w.type === 'mobile' && (ziidi ? w.pocket === 'ziidi' || !w.pocket : !w.pocket)).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                    {p?.fuliza && (
                      <div className="font-num" style={{ marginTop: 4, fontSize: 11.5, color: '#F59E0B' }}>
                        Fuliza covered {formatCurrency(p.fuliza.borrowed, 'KES')}{p.fuliza.fee ? ` · fee ${formatCurrency(p.fuliza.fee, 'KES')}` : ''}{p.fuliza.owed != null ? ` · you owe Fuliza ${formatCurrency(p.fuliza.owed, 'KES')}` : ''}{p.fuliza.due ? ` by ${p.fuliza.due}` : ''}
                      </div>
                    )}
                    {p?.kind === 'fuliza_repay' && (
                      <div style={{ marginTop: 4, fontSize: 11.5, color: '#22C55E' }}>{p.fully ? 'Fuliza fully paid off' : 'Part of Fuliza paid'}{p.limit != null ? ` · limit now ${formatCurrency(p.limit, 'KES')}` : ''}</div>
                    )}
                    {partyKey(p) && !FIXED_CATEGORY[p.kind] && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', fontSize: 11.5 }}>
                        {p.category
                          ? (() => { const c = choiceLabel(p.category, p); return <span style={{ color: c.color }}>{c.icon} {c.label}{p.category_auto ? ' · auto' : ''}</span>; })()
                          : <span style={{ color: '#F59E0B' }}>First time from {p.party}: pick a category, Luxe remembers it</span>}
                        <span style={{ flex: 1 }} />
                        <select className="input" style={{ width: 'auto', padding: '2px 6px', fontSize: 11.5 }} value={p.category || ''} onChange={(e) => put({ id: x.id, category: e.target.value })}>
                          <option value="">{p.category ? 'Change…' : 'Category…'}</option>
                          <optgroup label="Category">
                            {(p.kind === 'received' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                          </optgroup>
                          <optgroup label="Loans">
                            {/* Money in pays down a loan you gave; money out pays down one you took. */}
                            {openLoans.filter((l) => (p.kind === 'received' ? l.type === 'lent' : l.type === 'borrowed')).map((l) => (
                              <option key={l.id} value={`loan:${l.id}`}>🤝 {p.kind === 'received' ? 'Repayment from' : 'Repaying'} {l.contact_name.trim()} ({formatCurrency(loanBalance(l), 'KES')} left)</option>
                            ))}
                            {openLoans.filter((l) => (p.kind === 'received' ? l.type === 'borrowed' : l.type === 'lent')).map((l) => (
                              <option key={`add${l.id}`} value={`loanadd:${l.id}`}>🤝 {p.kind === 'received' ? 'Borrowed more from' : 'Lent more to'} {l.contact_name.trim()} ({formatCurrency(loanBalance(l), 'KES')} so far)</option>
                            ))}
                            <option value="loan_new">🤝 {p.kind === 'received' ? 'Borrowed: new loan' : 'Lent: new loan'}</option>
                          </optgroup>
                        </select>
                      </div>
                    )}
                    {x.body && !p && <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--text-2)' }}>{x.body}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
