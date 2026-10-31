import { useEffect, useState } from 'react';
import { formatCurrency, INCOME_CATEGORIES, EXPENSE_CATEGORIES, getCategoryById } from '../lib/utils';
import { KIND_LABEL, partyKey, FIXED_CATEGORY, loanIdOf, clientIdOf, ASK } from '../lib/sms-parser';
import { clientTotals } from '../lib/client-pay';
import { useApp } from '../context/AppContext';
import { loanBalance } from '../lib/finance-actions';
import { relabelSms } from '../lib/sms-relabel';

// Luxe → Wallets: link the Android app so it reads M-Pesa and Ziidi texts (like Truecaller), pick which SIM is
// which M-Pesa account, and see how each captured message was read. Server: lib/sms-capture.js.
// Automatic recording is off by default (you add transactions by hand); it can be switched on below. Message text is wiped once recorded or after 7 days.
const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const when = (iso) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function SmsCapture({ wallets }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const { loans = [], clientProjects = [], updateClientProject, addTransaction, removeTransaction, addLoan, updateLoan } = useApp();
  const owingClients = clientProjects.filter((c) => c.status !== 'completed' && clientTotals(c).remaining > 0);
  const openLoans = loans.filter((l) => l.status !== 'settled');
  // How a chosen category reads: a normal one, or a loan link.
  const choiceLabel = (c, p) => {
    if (clientIdOf(c)) {
      const cp = clientProjects.find((x) => x.id === clientIdOf(c));
      return { icon: '💼', label: cp ? `Client payment: ${cp.client_name} — ${cp.name}` : 'Client payment (Freelance)', color: '#0EA5E9' };
    }
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
  // Something recorded as Other is waiting for its category: open the list so it's right there.
  useEffect(() => { if ((data?.items || []).some((x) => x.plan?.needsCategory && !x.parsed?.category)) setOpen(true); }, [data]);

  const relabel = (x, choice) => relabelSms(x, choice, { loans, wallets, clientProjects, updateClientProject, addTransaction, removeTransaction, addLoan, updateLoan });

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
      {d && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {[1, 2].map((slot) => (
            <label key={slot} style={{ flex: 1, fontSize: 12, color: 'var(--text-3)' }}>My SIM {slot} number{data?.ownGuessed && data?.own?.[slot] ? ' (guessed)' : ''}
              <input className="input font-num" style={{ marginTop: 4 }} defaultValue={data?.own?.[slot] || ''} key={data?.own?.[slot] || slot} placeholder="07…"
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (data?.own?.[slot] || '')) put({ own: { ...data?.own, [slot]: v } }); }} />
            </label>
          ))}
        </div>
      )}
      {d && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Money between these two numbers is a transfer between your M-Pesa accounts, recorded once.</div>}
      {d && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '10px 12px', borderRadius: 10, background: d.auto?.on ? 'rgba(34,197,94,0.08)' : 'var(--card-2)' }}>
          <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45 }}>
            <b>Automatic recording {d.auto?.on ? 'on' : 'off'}</b>
            <div style={{ color: 'var(--text-3)', fontSize: 11.5 }}>{d.auto?.on ? `New messages since ${when(d.auto.since)} are recorded when Luxe is open. Older ones never are.` : 'Nothing is recorded from SMS. Add transactions yourself; these messages are just a reminder of what came in and went out.'}</div>
          </div>
          <button type="button" className={d.auto?.on ? 'btn-ghost' : 'btn-primary'} style={{ width: 'auto', padding: '8px 12px', fontSize: 12.5 }}
            onClick={async () => { const r = await fetch('/api/sms/ready', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: !d.auto?.on }) }); if (r.ok) load(); }}>{d.auto?.on ? 'Turn off' : 'Turn on'}</button>
        </div>
      )}

      {items.length > 0 && (
        <>
          <button type="button" className="tx-link" style={{ marginTop: 10, fontSize: 12.5, background: 'none', border: 0, color: 'var(--text-2)', padding: 0 }} onClick={() => setOpen((o) => !o)}>
            {open ? '▴' : '▾'} {items.length} captured · {items.filter((x) => x.plan?.action === 'record').length} would record · {items.filter((x) => x.plan?.action === 'skip').length} skipped · {items.filter((x) => x.plan?.action === 'ask').length} need you{data?.learned ? ` · ${data.learned} learned` : ''}
          </button>
          {open && (
            <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Checking how Luxe reads your messages; nothing is recorded yet, and your balances are never changed from an SMS. Messages from before you linked are history only: they will never be recorded. Pick a category the first time a name shows up, and every later message from that name uses it. Changing a later one changes just that message (say, a loan to someone you usually just help). Message text is deleted once recorded, or after 7 days.</div>
              {items.map((x) => {
                const p = x.parsed;
                const ziidi = p?.kind === 'ziidi' || p?.ziidiMove;
                return (
                  <div key={x.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 12.5 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <b>{p ? (KIND_LABEL[p.kind] || p.kind) : 'Not understood'}{p?.ziidiMove ? ` · ${p.ziidiMove === 'in' ? 'into' : 'out of'} Ziidi` : ''}</b>
                      <span className="font-num">{p?.amount != null ? formatCurrency(p.amount, 'KES') : ''}</span>
                      <span style={{ flex: 1, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.party || ''}</span>
                      <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{x.status === 'history' ? 'before linking · ' : ''}SIM {x.sim_slot || '?'} · {when(x.received_at)}</span>
                    </div>
                    {x.plan && (
                      <div style={{ marginTop: 3, fontSize: 12, color: x.plan.action === 'record' ? '#22C55E' : x.plan.action === 'ask' ? '#F59E0B' : 'var(--text-3)' }}>
                        {x.status === 'recorded' ? '✅ Recorded: ' : x.status === 'ignored' ? '⏭ Skipped: ' : x.plan.action === 'record' ? (x.status === 'history' || !d?.auto?.on || new Date(x.received_at) < new Date(d.auto.since) ? '✓ Would record: ' : '⏳ Recording: ') : x.plan.action === 'ask' ? '? ' : '⏭ Skip: '}{x.plan.summary}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', color: 'var(--text-3)', fontSize: 11.5 }}>
                      <span className="font-num">{p?.cost ? `fee ${formatCurrency(p.cost, 'KES')}` : ''}{x.code ? `${p?.cost ? ' · ' : ''}${x.code}` : ''}</span>
                      <span style={{ flex: 1 }} />
                      {x.plan?.action === 'ask' && /account/i.test(x.plan.summary) && <select className="input" style={{ width: 'auto', padding: '2px 6px', fontSize: 11.5 }} value={x.wallet_id || ''} onChange={(e) => put({ id: x.id, wallet_id: e.target.value })}>
                        <option value="">Which account?</option>
                        {wallets.filter((w) => w.type === 'mobile' && (ziidi ? w.pocket === 'ziidi' || !w.pocket : !w.pocket)).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>}
                    </div>
                    {p?.fuliza && (
                      <div className="font-num" style={{ marginTop: 4, fontSize: 11.5, color: '#F59E0B' }}>
                        Fuliza covered {formatCurrency(p.fuliza.borrowed, 'KES')}{p.fuliza.fee ? ` · fee ${formatCurrency(p.fuliza.fee, 'KES')}` : ''}{p.fuliza.owed != null ? ` · you owe Fuliza ${formatCurrency(p.fuliza.owed, 'KES')}` : ''}{p.fuliza.due ? ` by ${p.fuliza.due}` : ''}
                      </div>
                    )}
                    {p?.kind === 'fuliza_repay' && (
                      <div style={{ marginTop: 4, fontSize: 11.5, color: '#22C55E' }}>{p.fully ? 'Fuliza fully paid off' : 'Part of Fuliza paid'}{p.limit != null ? ` · limit now ${formatCurrency(p.limit, 'KES')}` : ''}</div>
                    )}
                    {partyKey(p) && !FIXED_CATEGORY[p.kind] && x.plan && (x.plan.action === 'ask' ? /category/.test(x.plan.summary) : x.plan.action === 'record' && !x.plan.entries?.some((e) => e.type === 'transfer') && !/airtime|data|Safaricom Offers/i.test(x.plan.summary)) && (() => {
                      const rule = data?.rules?.[partyKey(p)];
                      const oneOff = p.category && rule && rule !== ASK && rule !== p.category && !p.category_auto;
                      return (
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', fontSize: 11.5, flexWrap: 'wrap' }}>
                        {p.category
                          ? (() => { const c = choiceLabel(p.category, p); return <span style={{ color: c.color }}>{c.icon} {c.label}{p.category_auto ? ' · auto' : oneOff ? ' · just this one' : ''}</span>; })()
                          : <span style={{ color: '#F59E0B' }}>{rule === ASK ? `You choose each time for ${p.party}` : `First time from ${p.party}: pick a category, Luxe remembers it`}</span>}
                        {oneOff && <button type="button" onClick={() => put({ id: x.id, category: p.category, scope: 'all' })} style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)', textDecoration: 'underline' }}>use for all from {p.party}</button>}
                        <span style={{ flex: 1 }} />
                        <select className="input" style={{ width: 'auto', padding: '2px 6px', fontSize: 11.5 }} value={p.category || ''} onChange={async (e) => { const v = e.target.value; if (x.status === 'recorded') await relabel(x, v); put({ id: x.id, category: v }); }}>
                          <option value="">{p.category ? 'Change…' : 'Category…'}</option>
                          <optgroup label="Category">
                            {(p.kind === 'received' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                          </optgroup>
                          {p.kind === 'received' && owingClients.length > 0 && (
                            <optgroup label="Client work (Tech Hub)">
                              {owingClients.map((c) => <option key={c.id} value={`client:${c.id}`}>💼 {c.client_name} — {c.name} ({formatCurrency(clientTotals(c).remaining, 'KES')} left)</option>)}
                            </optgroup>
                          )}
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
                          <optgroup label={p.party}>
                            <option value={ASK}>❓ Ask me every time for {p.party}</option>
                          </optgroup>
                        </select>
                      </div>
                      );
                    })()}
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
