import { useState } from 'react';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatShort, monthRange } from '../lib/utils';

const ZIIDI_COLOR = '#10B981';

export default function HealthPage() {
  const { wallets, transactions, budgets, loans, goals, addGoal, updateGoal, currency, addTransaction } = useApp();
  const [showTxn, setShowTxn] = useState(false);
  const [ziidiAmount, setZiidiAmount] = useState('');
  const [showZiidiSetup, setShowZiidiSetup] = useState(false);
  const [walletId, setWalletId] = useState(wallets[0]?.id || '');

  const { from, to } = monthRange(0);
  const monthTxns = transactions.filter(t => t.date >= from && t.date <= to);
  const monthIncome = monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const monthExpense = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const totalBalance = wallets.reduce((s, w) => s + Number(w.balance || 0), 0);
  const totalBudgeted = budgets.reduce((s, b) => s + Math.max(0, Number(b.allocated || 0) - Number(b.spent || 0)), 0);
  const totalBorrowed = loans.filter(l => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount || 0), 0);
  const totalLent = loans.filter(l => l.type === 'lent' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount || 0), 0);
  const floating = Math.max(0, totalBalance - totalBudgeted - totalBorrowed);
  const netWorth = totalBalance + totalLent - totalBorrowed;
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

  // Recommendations
  const recs = [];

  if (savings < 0) {
    recs.push({ type:'danger', icon:'🚨', title:'You are spending more than you earn', body:`You spent ${formatShort(Math.abs(savings), currency)} more than you earned this month. Cut food costs by planning meals around what you have. Reduce impulse buys.`, action:null });
  }

  if (savingsRate >= 0 && savingsRate < 10 && monthIncome > 0) {
    const suggestSave = Math.round(monthIncome * 0.1);
    recs.push({ type:'warning', icon:'💰', title:`Save at least KSh ${suggestSave.toLocaleString()} this month`, body:`That is 10% of your income. Even saving KSh ${Math.round(suggestSave/4).toLocaleString()} a week builds a cushion fast. Move it to Ziidi immediately when income arrives.`, action:'ziidi' });
  }

  if (savingsRate >= 10) {
    const ziidiSuggest = Math.round(monthIncome * 0.15);
    const leisureSuggest = Math.round(floating * 0.3);
    const foodSuggest = Math.round(floating * 0.25);
    const personalSuggest = Math.round(floating * 0.1);
    recs.push({ type:'success', icon:'✅', title:`Good saving rate — here is how to split your ${formatShort(floating, currency)} floating cash`, body:`Ziidi (untouchable savings): ${formatShort(ziidiSuggest, currency)}\nFood & ingredients: ${formatShort(foodSuggest, currency)}\nLeisure & bae: ${formatShort(leisureSuggest, currency)}\nPersonal pocket cash: ${formatShort(personalSuggest, currency)}`, action:'ziidi' });
  }

  if (!ziidiGoal || ziidiSaved === 0) {
    recs.push({ type:'info', icon:'🏦', title:'Set up your Ziidi emergency fund', body:'Ziidi is money you never touch — it is your safety net for when things go wrong. Start with just KSh 500. Every time you earn, move 10% here before spending anything.', action:'ziidi' });
  } else {
    const target = ziidiGoal.target;
    const pct = Math.min(100, (ziidiSaved / target) * 100);
    recs.push({ type:'success', icon:'🏦', title:`Ziidi: ${formatShort(ziidiSaved, currency)} saved (${pct.toFixed(0)}%)`, body:`You have ${formatShort(ziidiSaved, currency)} in your emergency fund. Target is ${formatShort(target, currency)}. Keep adding — this money is only for true emergencies.`, action:null });
  }

  if (impulseTotal > 0) {
    recs.push({ type:'warning', icon:'⚡', title:`You spent ${formatShort(impulseTotal, currency)} on impulse this month`, body:'Before buying anything unplanned, ask: "Do I need this or do I just want it right now?" Wait 24 hours before any purchase over KSh 500.', action:null });
  }

  if (totalBorrowed > 0) {
    recs.push({ type:'warning', icon:'📤', title:`You owe ${formatShort(totalBorrowed, currency)} — pay loans before saving`, body:'Loans cost more the longer they sit. Pay the smallest loan first (quick win), then attack the next. Do not borrow more while you still have active loans.', action:null });
  }

  if (floating > 500 && savingsRate >= 0) {
    const food = Math.round(floating * 0.25);
    const save = Math.round(floating * 0.20);
    const leisure = Math.round(floating * 0.30);
    const personal = Math.round(floating * 0.15);
    const reserve = floating - food - save - leisure - personal;
    recs.push({ type:'info', icon:'📊', title:`Budget your ${formatShort(floating, currency)} floating cash`, body:`Suggested split:\n🍽️ Food: ${formatShort(food, currency)}\n🏦 Ziidi: ${formatShort(save, currency)}\n🎉 Leisure: ${formatShort(leisure, currency)}\n💵 Personal: ${formatShort(personal, currency)}\n🔒 Reserve: ${formatShort(reserve, currency)}`, action:'ziidi' });
  }

  async function createZiidi() {
    const amount = Number(ziidiAmount);
    if (!amount || amount <= 0) return;
    if (ziidiGoal) {
      await updateGoal({ ...ziidiGoal, current: (ziidiGoal.current || 0) + amount });
    } else {
      await addGoal({ name:'Ziidi — Emergency Fund', target: Math.max(amount * 10, 5000), current: amount, icon:'🏦', color:'#10B981', deadline:null });
    }
    await addTransaction({ type:'expense', amount, wallet_id: walletId, category:'savings', description:'Ziidi Emergency Fund', date: new Date().toISOString().split('T')[0], currency });
    setShowZiidiSetup(false);
    setZiidiAmount('');
  }

  const recColors = { danger:{ bg:'rgba(239,68,68,0.08)', border:'rgba(239,68,68,0.2)', title:'var(--red)' }, warning:{ bg:'rgba(245,158,11,0.08)', border:'rgba(245,158,11,0.2)', title:'#F59E0B' }, success:{ bg:'rgba(16,185,129,0.08)', border:'rgba(16,185,129,0.2)', title:'var(--green)' }, info:{ bg:'rgba(59,130,246,0.08)', border:'rgba(59,130,246,0.2)', title:'var(--blue)' } };

  return (
    <Layout onFab={() => setShowTxn(true)}>
      <div className="page">
        <div className="page-header">
          <h1 style={{ fontSize:22, fontWeight:700, marginBottom:16 }}>Finance Health 💚</h1>

          {/* Health score */}
          <div className="hero-card" style={{ padding:'24px 20px', marginBottom:16, textAlign:'center' }}>
            <div style={{ fontSize:12, color:'rgba(237,242,255,0.5)', fontWeight:600, letterSpacing:1, textTransform:'uppercase', marginBottom:12 }}>Your Health Score</div>
            <div style={{ position:'relative', width:120, height:120, margin:'0 auto 16px' }}>
              <svg viewBox="0 0 120 120" style={{ width:120, height:120, transform:'rotate(-90deg)' }}>
                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
                <circle cx="60" cy="60" r="50" fill="none" stroke={scoreColor} strokeWidth="10"
                  strokeDasharray={`${score * 3.14} ${314 - score * 3.14}`} strokeLinecap="round" />
              </svg>
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                <div className="font-num" style={{ fontSize:28, fontWeight:700, color:scoreColor }}>{score}</div>
                <div style={{ fontSize:10, color:'rgba(237,242,255,0.5)' }}>/ 100</div>
              </div>
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:scoreColor }}>{scoreLabel}</div>
          </div>

          {/* Key metrics */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            {[
              { label:'Net Worth', value:netWorth, color: netWorth>=0 ? 'var(--green)' : 'var(--red)' },
              { label:'Savings Rate', value:null, display:`${savingsRate.toFixed(1)}%`, color: savingsRate>=20 ? 'var(--green)' : savingsRate>=0 ? '#F59E0B' : 'var(--red)' },
              { label:'Floating Cash', value:floating, color:'var(--blue)' },
              { label:'Ziidi Saved', value:ziidiSaved, color:ZIIDI_COLOR },
            ].map(m => (
              <div key={m.label} className="card-2" style={{ padding:'12px 14px' }}>
                <div style={{ fontSize:11, color:'var(--text-3)', fontWeight:600, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 }}>{m.label}</div>
                <div className="font-num" style={{ fontSize:16, fontWeight:700, color:m.color }}>
                  {m.display || formatShort(m.value, currency)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:'0 20px' }}>
          <div className="section-title" style={{ marginBottom:12 }}>RECOMMENDATIONS</div>
          <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:24 }}>
            {recs.map((rec, i) => {
              const c = recColors[rec.type];
              return (
                <div key={i} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:8 }}>
                    <span style={{ fontSize:22, flexShrink:0 }}>{rec.icon}</span>
                    <div style={{ fontSize:14, fontWeight:700, color:c.title, lineHeight:1.4 }}>{rec.title}</div>
                  </div>
                  <div style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6, whiteSpace:'pre-line', marginBottom: rec.action ? 12 : 0 }}>{rec.body}</div>
                  {rec.action === 'ziidi' && (
                    <button onClick={() => setShowZiidiSetup(true)}
                      style={{ padding:'8px 16px', background:ZIIDI_COLOR, border:'none', borderRadius:8, color:'#000', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Outfit' }}>
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
              In Fedha, Ziidi lives in your Goals — it builds up over time until it reaches your target (ideally 3 months of living expenses).
            </div>
            <button onClick={() => setShowZiidiSetup(true)} style={{ marginTop:12, width:'100%', padding:'11px', background:'var(--green-dim)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:10, color:'var(--green)', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'Outfit' }}>
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
