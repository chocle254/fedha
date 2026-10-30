import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatShort, monthRange, todayISO } from '../lib/utils';
import { getSetting, setSetting } from '../lib/db';

const ZIIDI_COLOR = '#10B981';

export default function HealthPage() {
  const { wallets, transactions, budgets, loans, goals, addGoal, updateGoal, currency, addTransaction } = useApp();
  const [showTxn, setShowTxn] = useState(false);
  const [ziidiAmount, setZiidiAmount] = useState('');
  const [showZiidiSetup, setShowZiidiSetup] = useState(false);
  const [walletId, setWalletId] = useState(wallets[0]?.id || '');
  // Wallets often load after the first render — pick the first one once they arrive.
  useEffect(() => { if (!walletId && wallets[0]?.id) setWalletId(wallets[0].id); }, [wallets, walletId]);
  // Ziidi "standby for next update" flow — remember the floating-cash level at the last save
  const [ziidiBasis, setZiidiBasis] = useState(null);
  const [lastSaved, setLastSaved] = useState(0);

  useEffect(() => {
    getSetting('ziidi_basis', null).then((v) => { if (v != null) setZiidiBasis(Number(v)); });
    getSetting('ziidi_last_saved', 0).then((v) => setLastSaved(Number(v) || 0));
  }, []);

  const { from, to } = monthRange(0);
  const monthTxns = transactions.filter(t => t.date >= from && t.date <= to);
  const monthIncome = monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  // Money moved to savings (Ziidi) is stored as an expense so wallet balances
  // drop, but it isn't spending — counting it made saving lower your score.
  const isSaving = (t) => t.category === 'savings';
  const monthExpense = monthTxns.filter(t => t.type === 'expense' && !isSaving(t)).reduce((s, t) => s + Number(t.amount), 0);
  const monthSaved = monthTxns.filter(t => t.type === 'expense' && isSaving(t)).reduce((s, t) => s + Number(t.amount), 0);

  // Where the money went this month, biggest first.
  const byCategory = {};
  monthTxns.filter(t => t.type === 'expense' && !isSaving(t)).forEach(t => { const c = t.category || 'other'; byCategory[c] = (byCategory[c] || 0) + Number(t.amount); });
  const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const totalBalance = wallets.reduce((s, w) => s + Number(w.balance || 0), 0);
  const totalBudgeted = budgets.reduce((s, b) => s + Math.max(0, Number(b.allocated || 0) - Number(b.spent || 0)), 0);
  const totalBorrowed = loans.filter(l => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount || 0), 0);
  const floating = Math.max(0, totalBalance - totalBudgeted - totalBorrowed);
  const netWorth = totalBalance; // open loans count only once settled
  const savings = monthIncome - monthExpense;
  const savingsRate = monthIncome > 0 ? (savings / monthIncome) * 100 : 0;
  const impulseTotal = monthTxns.filter(t => t.is_impulse).reduce((s, t) => s + Number(t.amount), 0);

  // Ziidi goal
  const ziidiGoal = goals.find(g => g.name === 'Ziidi — Emergency Fund');
  const ziidiSaved = ziidiGoal?.current || 0;

  // Health score (0-100)
  let score = 50;
  if (savingsRate >= 20) score += 20;
  else if (savingsRate >= 10) score += 10;
  else if (savingsRate < 0) score -= 20;
  if (totalBorrowed === 0) score += 10;
  else if (totalBorrowed > totalBalance) score -= 15;
  if (ziidiSaved > 0) score += 10;
  if (impulseTotal > monthExpense * 0.3) score -= 10;
  if (budgets.length > 0) score += 5;
  if (goals.length > 0) score += 5;
  score = Math.max(0, Math.min(100, score));

  const scoreColor = score >= 70 ? '#10B981' : score >= 45 ? '#F59E0B' : '#EF4444';
  const scoreLabel = score >= 70 ? 'Healthy 💚' : score >= 45 ? 'Needs Attention 🟡' : 'Critical — Act Now 🔴';

  // Ziidi "standby" gate: after a save, hide the split numbers and show motivation
  // until the user's floating cash grows again (i.e. a balance/income update arrives).
  const newMoneySinceSave = ziidiBasis == null || floating > ziidiBasis + 1;
  const showSplit = newMoneySinceSave;

  // Recommendations
  const recs = [];

  // Show celebratory motivation right after a save, before the next balance update.
  if (ziidiBasis != null && !showSplit && lastSaved > 0) {
    recs.push({
      type: 'success',
      icon: '🎉',
      title: `Great — you've made a saving of ${formatShort(lastSaved, currency)}!`,
      body: `That money is now locked in Ziidi. Standby for the next update — when fresh cash lands in your wallet, Luxe will show you the new amount to move to Ziidi. Keep the momentum going! 💪`,
      action: null,
    });
  }

  // Recommendations in priority order — the first one is "do this next".
  // Only one money-split card, and no "save more" advice while you're
  // overspending or carrying loans (those come first).
  const overspending = savings < 0;
  const hasLoans = totalBorrowed > 0;

  if (overspending) {
    const top = topCategories[0];
    recs.push({ type:'danger', icon:'🚨', title:`You've spent ${formatShort(Math.abs(savings), currency)} more than you earned this month`, body: top ? `Your biggest spend is ${top[0]} at ${formatShort(top[1], currency)} (${Math.round((top[1] / (monthExpense || 1)) * 100)}% of spending). Cutting that by a quarter saves about ${formatShort(top[1] * 0.25, currency)}.` : 'Pause anything non-essential until income lands.', action:null });
  }

  if (hasLoans) {
    const active = loans.filter(l => l.type === 'borrowed' && l.status === 'active').sort((a, b) => Number(a.remaining || a.amount || 0) - Number(b.remaining || b.amount || 0));
    const smallest = active[0];
    recs.push({ type:'warning', icon:'📤', title:`You owe ${formatShort(totalBorrowed, currency)} across ${active.length} loan${active.length === 1 ? '' : 's'}`, body: smallest ? `Clear the smallest first: ${smallest.contact_name || smallest.name || 'that loan'} — ${formatShort(Number(smallest.remaining || smallest.amount || 0), currency)}. Quick wins free up cash for the next one. Don't take new loans until these are done.` : 'Pay these down before saving extra.', action:null });
  }

  if (!overspending && monthIncome > 0 && savingsRate < 10) {
    const suggestSave = Math.round(monthIncome * 0.1);
    recs.push({ type:'warning', icon:'💰', title:`Aim to keep ${formatShort(suggestSave, currency)} this month`, body:`That's 10% of the ${formatShort(monthIncome, currency)} you've earned. Right now you're keeping ${savingsRate.toFixed(0)}%.${hasLoans ? ' Put it toward your loans first.' : ` Moving ${formatShort(Math.round(suggestSave / 4), currency)} a week to Ziidi gets you there.`}`, action: hasLoans ? null : 'ziidi' });
  }

  if (!overspending && !hasLoans && showSplit && floating > 500) {
    const save = Math.round(floating * 0.20);
    const food = Math.round(floating * 0.25);
    const leisure = Math.round(floating * 0.25);
    const personal = Math.round(floating * 0.15);
    const reserve = floating - save - food - leisure - personal;
    recs.push({ type:'info', icon:'📊', title:`How to use your ${formatShort(floating, currency)} floating cash`, body:`🏦 Ziidi: ${formatShort(save, currency)}\n🍽️ Food: ${formatShort(food, currency)}\n🎉 Leisure: ${formatShort(leisure, currency)}\n💵 Personal: ${formatShort(personal, currency)}\n🔒 Reserve: ${formatShort(reserve, currency)}`, action:'ziidi' });
  }

  if (impulseTotal > 0) {
    recs.push({ type:'warning', icon:'⚡', title:`${formatShort(impulseTotal, currency)} went on impulse buys this month`, body:`That's ${Math.round((impulseTotal / (monthExpense || 1)) * 100)}% of your spending. Before anything unplanned over ${formatShort(500, currency)}, wait 24 hours.`, action:null });
  }

  if (topCategories.length && !overspending) {
    recs.push({ type:'info', icon:'🧾', title:'Where your money went this month', body: topCategories.map(([c, v]) => `${c}: ${formatShort(v, currency)} (${Math.round((v / (monthExpense || 1)) * 100)}%)`).join('\n'), action:null });
  }

  if (!ziidiGoal || ziidiSaved === 0) {
    recs.push({ type:'info', icon:'🏦', title:'Set up your Ziidi emergency fund', body:`Money you never touch — your safety net. Start with ${formatShort(500, currency)}.${hasLoans ? ' Once your loans are cleared, move 10% of every income here first.' : ' Every time you earn, move 10% here before spending.'}`, action: hasLoans ? null : 'ziidi' });
  } else {
    const target = ziidiGoal.target;
    const pct = Math.min(100, (ziidiSaved / target) * 100);
    const monthlyExpense = monthExpense || 1;
    recs.push({ type:'success', icon:'🏦', title:`Ziidi: ${formatShort(ziidiSaved, currency)} saved (${pct.toFixed(0)}% of target)`, body:`That covers about ${(ziidiSaved / monthlyExpense).toFixed(1)} months of this month's spending. Aim for 3.${monthSaved > 0 ? ` You've added ${formatShort(monthSaved, currency)} this month.` : ''}`, action:null });
  }

  async function createZiidi() {
    const amount = Number(ziidiAmount);
    if (!amount || amount <= 0) return;
    if (ziidiGoal) {
      await updateGoal({ ...ziidiGoal, current: (ziidiGoal.current || 0) + amount });
    } else {
      await addGoal({ name:'Ziidi — Emergency Fund', target: Math.max(amount * 10, 5000), current: amount, icon:'🏦', color:'#10B981', deadline:null });
    }
    await addTransaction({ type:'expense', amount, wallet_id: walletId, category:'savings', description:'Ziidi Emergency Fund', date: todayISO(), currency });

    // Lock in the "standby for next update" state: basis = floating cash AFTER this save.
    const newBasis = Math.max(0, floating - amount);
    setZiidiBasis(newBasis);
    setLastSaved(amount);
    await setSetting('ziidi_basis', newBasis);
    await setSetting('ziidi_last_saved', amount);

    setShowZiidiSetup(false);
    setZiidiAmount('');
  }

  const recColors = { danger:{ bg:'rgba(239,68,68,0.08)', border:'rgba(239,68,68,0.2)', title:'var(--red)' }, warning:{ bg:'rgba(245,158,11,0.08)', border:'rgba(245,158,11,0.2)', title:'#F59E0B' }, success:{ bg:'rgba(16,185,129,0.08)', border:'rgba(16,185,129,0.2)', title:'var(--green)' }, info:{ bg:'rgba(59,130,246,0.08)', border:'rgba(59,130,246,0.2)', title:'var(--blue)' } };

  return (
    <Layout onFab={() => setShowTxn(true)}>
      <div className="page">
        <div className="page-header">
          <h1 className="lx-h1" style={{ marginBottom: 16 }}>Finance health</h1>

          {/* Health score */}
          <div className="hero-card" style={{ padding:'20px 20px 18px', marginBottom:16, textAlign:'center' }}>
            {(() => {
              // Half-circle gauge: 0 on the left, 100 on the right, with the bands it is judged by.
              const r = 84, cx = 110, cy = 100, a0 = Math.PI, pt = (v) => { const a = a0 - (v / 100) * Math.PI; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
              const arc = (v1, v2) => { const [x1, y1] = pt(v1); const [x2, y2] = pt(v2); return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`; };
              const [nx, ny] = pt(Math.max(0, Math.min(100, score)));
              return (
                <svg viewBox="0 0 220 116" width="100%" style={{ maxWidth: 300, display: 'block', margin: '0 auto' }} role="img" aria-label={`Health score ${score} out of 100, ${scoreLabel}`}>
                  <path d={arc(0, 100)} fill="none" stroke="rgba(255,246,232,0.08)" strokeWidth="14" strokeLinecap="round" />
                  {[[0, 40, '#F87171'], [40, 60, '#F5B54A'], [60, 80, '#A3E635'], [80, 100, '#34D399']].map(([v1, v2, c]) => <path key={v1} d={arc(v1 + 1, v2 - 1)} fill="none" stroke={c} strokeOpacity="0.28" strokeWidth="14" />)}
                  <path d={arc(0, Math.max(1, Math.min(100, score)))} fill="none" stroke={scoreColor} strokeWidth="14" strokeLinecap="round" />
                  <circle cx={nx} cy={ny} r="9" fill="#141210" stroke={scoreColor} strokeWidth="4" />
                  <text x="110" y="86" textAnchor="middle" fontSize="38" fontWeight="700" fill="var(--text)" className="font-num">{score}</text>
                  <text x="110" y="106" textAnchor="middle" fontSize="11" fill="var(--text-3)">out of 100</text>
                  <text x="22" y="114" textAnchor="middle" fontSize="9.5" fill="var(--text-3)">Poor</text>
                  <text x="198" y="114" textAnchor="middle" fontSize="9.5" fill="var(--text-3)">Great</text>
                </svg>
              );
            })()}
            <div style={{ fontSize:17, fontWeight:650, color:scoreColor, marginTop:8 }}>{scoreLabel}</div>
            <div style={{ fontSize:12.5, color:'var(--text-2)', marginTop:3 }}>Built from your savings rate, cash cushion, debt and spending habits</div>
          </div>

          {/* Key metrics */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            {[
              { label:'Net worth', value:netWorth, color: netWorth>=0 ? 'var(--green)' : 'var(--red)' },
              { label:'Savings rate', value:null, display:`${savingsRate.toFixed(1)}%`, color: savingsRate>=20 ? 'var(--green)' : savingsRate>=0 ? '#F59E0B' : 'var(--red)' },
              { label:'Floating cash', value:floating, color:'var(--blue)' },
              { label:'Ziidi saved', value:ziidiSaved, color:ZIIDI_COLOR },
            ].map(m => (
              <div key={m.label} className="card" style={{ padding:'13px 14px' }}>
                <div style={{ fontSize:12.5, color:'var(--text-2)', fontWeight:500, marginBottom:5 }}>{m.label}</div>
                <div className="font-num" style={{ fontSize:19, fontWeight:700, color:m.color }}>
                  {m.display || formatShort(m.value, currency)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:'0 20px' }}>
          <div className="section-title" style={{ marginBottom:12 }}>Recommendations</div>
          <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:24 }}>
            {recs.map((rec, i) => {
              const c = recColors[rec.type];
              return (
                <div key={i} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:12, padding:'14px 16px' }}>
                  {i === 0 && <div style={{ fontSize:10, fontWeight:800, letterSpacing:1.5, color:c.title, marginBottom:6 }}>DO THIS NEXT</div>}
                  <div style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:8 }}>
                    <span style={{ fontSize:22, flexShrink:0 }}>{rec.icon}</span>
                    <div style={{ fontSize:14, fontWeight:700, color:c.title, lineHeight:1.4 }}>{rec.title}</div>
                  </div>
                  <div style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6, whiteSpace:'pre-line', marginBottom: rec.action ? 12 : 0 }}>{rec.body}</div>
                  {rec.action === 'ziidi' && (
                    <button onClick={() => setShowZiidiSetup(true)}
                      style={{ padding:'8px 16px', background:ZIIDI_COLOR, border:'none', borderRadius:8, color:'#000', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Onest' }}>
                      🏦 Move to Ziidi Now
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ziidi explanation */}
          <div className="card" style={{ padding:'16px', marginBottom:24 }}>
            <div style={{ fontSize:15, fontWeight:700, color:ZIIDI_COLOR, marginBottom:8 }}>🏦 What is Ziidi?</div>
            <div style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>
              Ziidi (meaning "extra" in Swahili) is your emergency fund — money you set aside and <strong style={{ color:'var(--text)' }}>never touch</strong> unless something truly critical happens.{'\n\n'}
              Rule: When money comes in, move 10% to Ziidi before you spend anything. Treat it like it does not exist.{'\n\n'}
              In Luxe, Ziidi lives in your Goals — it builds up over time until it reaches your target (ideally 3 months of living expenses).
            </div>
            <button onClick={() => setShowZiidiSetup(true)} style={{ marginTop:12, width:'100%', padding:'11px', background:'var(--green-dim)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:10, color:'var(--green)', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'Onest' }}>
              {ziidiGoal ? `Add More to Ziidi (${formatShort(ziidiSaved, currency)} saved)` : 'Set Up Ziidi Emergency Fund'}
            </button>
          </div>
        </div>
      </div>

      {/* Ziidi modal */}
      {showZiidiSetup && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowZiidiSetup(false)}>
          <div className="modal-sheet">
            <div style={{ width:36, height:4, background:'var(--border)', borderRadius:2, margin:'12px auto' }} />
            <div className="modal-header">
              <span style={{ fontSize:16, fontWeight:700 }}>🏦 Move to Ziidi</span>
              <button className="btn-icon" onClick={() => setShowZiidiSetup(false)}>✕</button>
            </div>
            <div className="modal-body">
              {ziidiGoal && (
                <div style={{ padding:'10px 14px', background:'var(--green-dim)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:10, fontSize:13, color:'var(--green)' }}>
                  Current Ziidi balance: {formatCurrency(ziidiSaved, currency)}
                </div>
              )}
              <div style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6, background:'var(--card-2)', padding:'10px 14px', borderRadius:10 }}>
                This amount will be recorded as spent from your wallet and added to your Ziidi goal. Once in Ziidi — do not touch it.
              </div>
              <div>
                <label style={{ fontSize:12, color:'var(--text-3)', fontWeight:600, letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:8 }}>Amount to Save</label>
                <input className="input font-num" type="number" inputMode="decimal" placeholder="0.00" value={ziidiAmount} onChange={e => setZiidiAmount(e.target.value)} style={{ fontSize:22, fontWeight:600 }} autoFocus />
              </div>
              <div>
                <label style={{ fontSize:12, color:'var(--text-3)', fontWeight:600, letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:8 }}>From Wallet</label>
                <select className="input" value={walletId} onChange={e => setWalletId(e.target.value)}>
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.icon} {w.name} — {formatShort(w.balance, w.currency || currency)}</option>)}
                </select>
              </div>
              <button className="btn-primary" disabled={!ziidiAmount || Number(ziidiAmount) <= 0} onClick={createZiidi}
                style={{ background:ZIIDI_COLOR }}>
                Lock {ziidiAmount ? formatCurrency(ziidiAmount, currency) : 'Amount'} in Ziidi 🔒
              </button>
            </div>
          </div>
        </div>
      )}

      {showTxn && <TransactionModal onClose={() => setShowTxn(false)} />}
    </Layout>
  );
}
