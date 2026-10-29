import { useEffect, useMemo, useState } from 'react';
import { getSetting } from '../../lib/db';
import { genId } from '../../lib/utils';

// Startup → 💰 Customers: the people you are turning into paying customers, from first message to paid.
//   - each person sits at a stage (Lead → Contacted → Demo → Trial → Paid, or Lost)
//   - ✍️ writes the next WhatsApp message for their stage (pages/api/startup/outreach.js) and opens WhatsApp
//   - follow-ups come due by date, overdue ones first
//   - when someone here pays you on M-Pesa, Luxe spots their number in the SMS (lib/sms-capture.js), moves them to
//     Paid and celebrates; those payments arrive through the 'startup_payments' setting and are merged in here.
const STAGES = [
  ['lead', 'Lead', '#94A3B8'], ['contacted', 'Contacted', '#3B82F6'], ['demo', 'Demo', '#A78BFA'],
  ['trial', 'Trial', '#F59E0B'], ['paid', 'Paid', '#22C55E'], ['lost', 'Lost', '#EF4444'],
];
const stageOf = (k) => STAGES.find((s) => s[0] === k) || STAGES[0];
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const waNumber = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('0') ? `254${d.slice(1)}` : d; };
const kes = (n) => `KES ${Math.round(Number(n) || 0).toLocaleString('en-KE')}`;

export default function CustomersTab({ startup, save }) {
  const customers = useMemo(() => startup.customers || [], [startup.customers]);
  const [form, setForm] = useState({ name: '', phone: '', segment: '' });
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState({}); // id -> { message, tip, follow_up_days, busy, err }
  const [price, setPrice] = useState(startup.price || '');

  const put = (list) => save({ customers: list });
  const patch = (id, p) => put(customers.map((c) => (c.id === id ? { ...c, ...p } : c)));

  // Payments Luxe saw on M-Pesa for people in this list: move them to Paid and add the money.
  useEffect(() => {
    getSetting('startup_payments', []).then((list) => {
      const mine = (Array.isArray(list) ? list : []).filter((p) => p.startupId === startup.id);
      if (!mine.length) return;
      let changed = false;
      const next = customers.map((c) => {
        const pays = mine.filter((p) => p.customerId === c.id);
        const known = new Set((c.payments || []).map((p) => p.code || p.at));
        const fresh = pays.filter((p) => !known.has(p.code || p.at));
        if (!fresh.length) return c;
        changed = true;
        const payments = [...(c.payments || []), ...fresh.map((p) => ({ amount: p.amount, at: p.at, code: p.code }))];
        return { ...c, stage: 'paid', payments, paid_total: payments.reduce((s, p) => s + Number(p.amount || 0), 0), last_at: fresh.at(-1).at };
      });
      if (changed) put(next);
    }).catch(() => {});
  }, [startup.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = () => {
    if (!form.name.trim()) return;
    put([{ id: genId(), name: form.name.trim(), phone: form.phone.trim(), segment: form.segment.trim(), stage: 'lead', notes: '', created_at: new Date().toISOString(), next_at: today() }, ...customers]);
    setForm({ name: '', phone: '', segment: '' });
  };

  const write = async (c) => {
    setDraft((d) => ({ ...d, [c.id]: { ...(d[c.id] || {}), busy: true, err: null } }));
    try {
      const r = await fetch('/api/startup/outreach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startup: { name: startup.name, mission: startup.mission, problem: startup.stages?.ideation?.problem, solution: startup.stages?.ideation?.solution, customer: Object.values(startup.stages || {}).map((st) => st?.target_users).find(Boolean) || '' }, customer: c, price }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not write it.');
      setDraft((d) => ({ ...d, [c.id]: { ...j, busy: false } }));
    } catch (e) { setDraft((d) => ({ ...d, [c.id]: { ...(d[c.id] || {}), busy: false, err: e.message } })); }
  };

  // Sent: log it, move a lead to Contacted, and set the follow-up date.
  const sent = (c, days) => {
    const note = `${today()}: messaged (${stageOf(c.stage)[1]})`;
    patch(c.id, { stage: c.stage === 'lead' ? 'contacted' : c.stage, last_at: new Date().toISOString(), next_at: addDays(days || 3), notes: [c.notes, note].filter(Boolean).join('\n') });
  };

  const counts = Object.fromEntries(STAGES.map(([k]) => [k, customers.filter((c) => c.stage === k).length]));
  const paidTotal = customers.reduce((s, c) => s + Number(c.paid_total || 0), 0);
  const due = customers.filter((c) => !['paid', 'lost'].includes(c.stage) && c.next_at && c.next_at <= today());
  const order = (c) => (c.next_at && c.next_at <= today() && !['paid', 'lost'].includes(c.stage) ? 0 : c.stage === 'paid' ? 2 : c.stage === 'lost' ? 3 : 1);
  const sorted = [...customers].sort((a, b) => order(a) - order(b) || String(a.next_at || '').localeCompare(String(b.next_at || '')));

  return (
    <div className="muse-grid"><div className="muse-col">
      <section className="card muse-card">
        <div className="muse-label">💰 TO THE FIRST PAYING CUSTOMER</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>
          {counts.paid ? `${counts.paid} paying customer${counts.paid > 1 ? 's' : ''} · ${kes(paidTotal)} in. Find 10 more like them.` : 'Everyone you are talking to, from first message to paid. When one of them pays you on M-Pesa, Luxe moves them to Paid by itself.'}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {STAGES.map(([k, l, col]) => (
            <div key={k} style={{ flex: '1 1 60px', textAlign: 'center', padding: '8px 4px', borderRadius: 10, background: `${col}18`, border: `1px solid ${col}40` }}>
              <div className="font-num" style={{ fontSize: 18, fontWeight: 800, color: col }}>{counts[k]}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{l}</div>
            </div>
          ))}
        </div>
        {due.length > 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: '#F59E0B', fontWeight: 600 }}>⏰ {due.length} follow-up{due.length > 1 ? 's' : ''} due today</div>}
        <label style={{ display: 'block', marginTop: 12, fontSize: 12, color: 'var(--text-3)' }}>Your price (used when asking people to pay)
          <input className="input" value={price} placeholder="e.g. KES 200 a month, M-Pesa till 123456" onChange={(e) => setPrice(e.target.value)} onBlur={() => price !== (startup.price || '') && save({ price })} style={{ marginTop: 4 }} />
        </label>
      </section>

      <section className="card muse-card">
        <div className="muse-label">ADD SOMEONE</div>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Phone (M-Pesa number, so Luxe can spot their payment)" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="Who they are (e.g. clinic receptionist, Kericho)" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} />
          <button type="button" className="btn-primary" onClick={add} disabled={!form.name.trim()}>＋ Add to pipeline</button>
        </div>
      </section>

      {sorted.map((c) => {
        const [, label, col] = stageOf(c.stage);
        const d = draft[c.id] || {};
        const overdue = c.next_at && c.next_at <= today() && !['paid', 'lost'].includes(c.stage);
        const isOpen = openId === c.id;
        return (
          <section key={c.id} className="card muse-card" style={overdue ? { borderColor: '#F59E0B80' } : undefined}>
            <button type="button" onClick={() => setOpenId(isOpen ? null : c.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{[c.segment, c.phone].filter(Boolean).join(' · ')}</div>
              </div>
              {c.paid_total > 0 && <b className="font-num" style={{ color: '#22C55E', fontSize: 13 }}>{kes(c.paid_total)}</b>}
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, color: col, background: `${col}20` }}>{label}</span>
            </button>
            {overdue && <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 6 }}>Follow up today</div>}
            {isOpen && (
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {STAGES.map(([k, l, colr]) => <button key={k} type="button" onClick={() => patch(c.id, { stage: k })} style={{ border: `1px solid ${c.stage === k ? colr : 'var(--border)'}`, background: c.stage === k ? `${colr}22` : 'transparent', color: c.stage === k ? colr : 'var(--text-2)', borderRadius: 999, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>{l}</button>)}
                </div>
                <button type="button" className="btn-primary" onClick={() => write(c)} disabled={d.busy}>{d.busy ? 'Writing…' : `✍️ Write the ${label.toLowerCase()} message`}</button>
                {d.err && <div style={{ fontSize: 12, color: '#EF4444' }}>{d.err}</div>}
                {d.message && (
                  <>
                    <textarea className="input" rows={4} value={d.message} onChange={(e) => setDraft((x) => ({ ...x, [c.id]: { ...d, message: e.target.value } }))} />
                    {d.tip && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>💡 {d.tip}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      {c.phone && <a className="btn-primary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }} href={`https://wa.me/${waNumber(c.phone)}?text=${encodeURIComponent(d.message)}`} target="_blank" rel="noreferrer" onClick={() => sent(c, d.follow_up_days)}>Open WhatsApp</a>}
                      <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={() => { navigator.clipboard?.writeText(d.message); sent(c, d.follow_up_days); }}>Copy & mark sent</button>
                    </div>
                  </>
                )}
                <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Next follow-up
                  <input className="input" type="date" value={c.next_at || ''} onChange={(e) => patch(c.id, { next_at: e.target.value })} style={{ marginTop: 4 }} />
                </label>
                <textarea className="input" rows={3} placeholder="Notes: what they said, what they need, objections" defaultValue={c.notes || ''} onBlur={(e) => e.target.value !== (c.notes || '') && patch(c.id, { notes: e.target.value })} />
                {(c.payments || []).length > 0 && <div style={{ fontSize: 12, color: '#22C55E' }}>Paid: {(c.payments || []).map((p) => `${kes(p.amount)} on ${String(p.at).slice(0, 10)}`).join(' · ')}</div>}
                <button type="button" className="btn-ghost" onClick={() => { if (window.confirm(`Remove ${c.name} from the pipeline?`)) put(customers.filter((x) => x.id !== c.id)); }}>Remove</button>
              </div>
            )}
          </section>
        );
      })}
    </div></div>
  );
}
