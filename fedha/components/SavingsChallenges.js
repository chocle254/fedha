import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatShort, formatCurrency, todayISO, getCategoryById, formatDate } from '../lib/utils';
import { fireConfetti } from '../lib/confetti';
import {
  CHALLENGE_TEMPLATES, FREEZE_EVERY, NOSPEND_CATEGORY_CHOICES, NOSPEND_DEFAULT,
  getTemplate, isPaced, amountAt, challengeTarget, challengeStatus, noSpendStatus, impulseTaxStatus,
  spinAmount, milestoneCrossed, earnedBadges, daysOfSpending, levelUpSettings,
} from '../lib/challenges';
import { TREAT_SHARE, awardSpin } from '../lib/rewards';

const label = { fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 };
const isFinished = (c) => c.status === 'finished';
const periodWord = (tpl) => ({ day: "today's", envelope: "today's envelope", week: "this week's", weekend: "this weekend's", month: "this month's" }[tpl.periodLabel] || 'next');

function Sheet({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
          <button className="btn-icon" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function Chips({ items, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {items.map((it) => (
        <button key={it.id} className={`chip ${value === it.id ? 'active' : ''}`} onClick={() => onChange(it.id)}>{it.label}</button>
      ))}
    </div>
  );
}

// "≈ 3 days of your usual spending"
function meaningOf(amount, transactions, today) {
  const d = daysOfSpending(amount, transactions, today);
  if (!(d >= 0.5)) return '';
  const n = d >= 10 ? Math.round(d) : Math.round(d * 10) / 10;
  return `≈ ${n} day${n === 1 ? '' : 's'} of your usual spending`;
}

export default function SavingsChallenges() {
  const {
    challenges, addChallenge, updateChallenge, removeChallenge, currency, transactions,
    goals, wallets, addGoal, saveToGoal, removeTransaction,
  } = useApp();
  const today = todayISO();
  const txIds = useMemo(() => new Set(transactions.map((t) => t.id)), [transactions]);

  const [picking, setPicking] = useState(false);
  const [joinFor, setJoinFor] = useState(null);       // template being set up
  const [saveFor, setSaveFor] = useState(null);       // { id, indices, title }
  const [gridFor, setGridFor] = useState(null);       // challenge id
  const [celebrate, setCelebrate] = useState(null);   // toast
  const [finishedFor, setFinishedFor] = useState(null); // challenge just completed
  const [spinning, setSpinning] = useState(null);     // { id, shown }
  const [showShelf, setShowShelf] = useState(false);
  const toastTimer = useRef(null);

  const active = challenges.filter((c) => !isFinished(c));
  const finished = challenges.filter(isFinished).sort((a, b) => String(b.finished_at || '').localeCompare(String(a.finished_at || '')));
  const activeTemplateIds = new Set(active.map((c) => c.template_id));

  function toast(t) {
    clearTimeout(toastTimer.current);
    setCelebrate(t);
    toastTimer.current = setTimeout(() => setCelebrate(null), 3200);
  }
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // No-Spend challenges finish on their own once their last day is over.
  useEffect(() => {
    for (const c of active) {
      const tpl = getTemplate(c.template_id);
      if (!tpl?.auto) continue;
      const s = noSpendStatus(tpl, c, transactions, today);
      if (!s.finished) continue;
      updateChallenge({ ...c, status: 'finished', finished_at: today, result: { clean: s.clean, of: tpl.periods } });
      // A perfect run earns a jackpot spin, 70%+ clean days a normal one.
      if (s.clean === tpl.periods) awardSpin('jackpot', `${c.emoji} Perfect ${c.name}!`);
      else if (s.clean >= tpl.periods * 0.7) awardSpin('normal', `${c.emoji} ${c.name}: ${s.clean}/${tpl.periods} clean days`);
    }
  }, [challenges, transactions, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Saving ────────────────────────────────────────────────────────────────
  async function doSave(c, indices, walletId, goalId) {
    const tpl = getTemplate(c.template_id);
    const amounts = { ...(c.amounts || {}) };
    if (tpl.spin) for (const i of indices) if (amounts[i] == null) amounts[i] = spinAmount(c.min, c.max);
    const withAmounts = { ...c, amounts };
    const amount = indices.reduce((s, i) => s + (amountAt(tpl, withAmounts, i) || 0), 0);
    const before = challengeStatus(tpl, c, today, txIds);
    const goal = goals.find((g) => g.id === goalId);

    const tx = await saveToGoal({
      id: `ch_${c.id}_${indices.length === 1 ? indices[0] : 'catchup'}_${Date.now().toString(36)}`,
      amount, walletId, goalId, treatShare: TREAT_SHARE,
      description: `${c.emoji} ${c.name}${indices.length > 1 ? ` (catch-up ×${indices.length})` : ''}`,
    });

    const saves = { ...(c.saves || {}) };
    for (const i of indices) saves[i] = tx.id;
    const completed = [...new Set([...(c.completed || []), ...indices])].sort((a, b) => a - b);
    const frozen = (c.frozen || []).filter((i) => !indices.includes(i));
    let next = { ...withAmounts, completed, saves, frozen, wallet_id: walletId, goal_id: goalId };

    const after = challengeStatus(tpl, next, today, new Set([...txIds, tx.id]));
    next.best_streak = Math.max(Number(c.best_streak) || 0, after.streak);
    // Each milestone earns its spin once, even if a save is undone and redone.
    const m = milestoneCrossed(before.pct, after.pct);
    const newSpin = m && m.pct < 100 && !(c.spun_milestones || []).includes(m.pct);
    if (newSpin) next.spun_milestones = [...(c.spun_milestones || []), m.pct];
    const firstFinish = after.allDone && !(c.spun_milestones || []).includes(100);
    if (after.allDone) next = { ...next, status: 'finished', finished_at: today, result: { saved: after.savedAmount }, spun_milestones: [...(next.spun_milestones || []), 100] };
    await updateChallenge(next);
    setSaveFor(null);

    if (after.allDone) {
      fireConfetti({ count: 220 });
      setFinishedFor({ ...next, savedAmount: after.savedAmount });
      if (firstFinish) awardSpin('jackpot', `${c.emoji} ${c.name} complete!`);
      return;
    }
    if (newSpin) awardSpin('normal', `${m.badge} ${m.title} in ${c.name}`);
    const meaning = meaningOf(after.savedAmount, transactions, today);
    if (m) {
      fireConfetti({ count: 120 });
      toast({ icon: m.badge, title: m.title, line: `${formatShort(after.savedAmount, currency)} in ${goal?.name || 'your goal'}`, sub: newSpin ? '🎡 You earned a spin on the reward wheel!' : meaning });
    } else if (Math.floor(after.saved.size / FREEZE_EVERY) > Math.floor(before.saved.size / FREEZE_EVERY)) {
      toast({ icon: '❄️', title: 'Streak freeze earned', line: 'Use it to cover a day you miss.', sub: '' });
    } else if (after.streak > 1 && after.streak % 7 === 0) {
      fireConfetti({ count: 80 });
      toast({ icon: '🔥', title: `${after.streak}-${tpl.periodLabel} streak!`, line: `${formatCurrency(amount, currency)} saved`, sub: meaning });
    } else {
      toast({ icon: '✅', title: `${formatCurrency(amount, currency)} saved`, line: `→ ${goal?.icon || '🎯'} ${goal?.name || 'goal'}`, sub: after.streak > 1 ? `🔥 ${after.streak} in a row` : meaning });
    }
  }

  async function payImpulseTax(c, walletId, goalId) {
    const s = impulseTaxStatus(c, transactions);
    if (!(s.owed > 0)) return;
    await saveToGoal({ id: `ch_${c.id}_tax_${Date.now().toString(36)}`, amount: s.owed, walletId, goalId, treatShare: TREAT_SHARE, description: `🧾 Impulse tax (${s.unpaid.length})` });
    await updateChallenge({ ...c, paid: [...(c.paid || []), ...s.unpaid.map((t) => t.id)], wallet_id: walletId, goal_id: goalId });
    setSaveFor(null);
    toast({ icon: '🧾', title: 'Impulse tax paid', line: `${formatCurrency(s.owed, currency)} into your goal`, sub: 'Every impulse buy now grows your savings too.' });
  }

  async function undoSave(c, idx) {
    const tpl = getTemplate(c.template_id);
    const txId = c.saves?.[idx];
    const group = txId ? Object.keys(c.saves).filter((k) => c.saves[k] === txId).map(Number) : [idx];
    const amount = group.reduce((s, i) => s + (amountAt(tpl, c, i) || 0), 0);
    const msg = txId
      ? `Undo this save? ${formatCurrency(amount, currency)} goes back from the goal to your account${group.length > 1 ? ` (it covered ${group.length} ${tpl.periodLabel}s)` : ''}.`
      : `Unmark ${tpl.periodLabel} ${idx + 1}?`;
    if (!window.confirm(msg)) return;
    if (txId && txIds.has(txId)) await removeTransaction(txId);
    const saves = { ...(c.saves || {}) };
    for (const i of group) delete saves[i];
    await updateChallenge({ ...c, completed: (c.completed || []).filter((i) => !group.includes(i)), saves });
  }

  async function applyFreeze(c, idx) {
    await updateChallenge({ ...c, frozen: [...new Set([...(c.frozen || []), idx])] });
    setSaveFor(null);
    toast({ icon: '❄️', title: 'Freeze used', line: 'Your streak is safe.', sub: '' });
  }

  function spin(c, idx) {
    const t0 = Date.now();
    const final = spinAmount(c.min, c.max);
    const timer = setInterval(async () => {
      if (Date.now() - t0 < 1300) { setSpinning({ id: c.id, shown: spinAmount(c.min, c.max) }); return; }
      clearInterval(timer);
      setSpinning(null);
      await updateChallenge({ ...c, amounts: { ...(c.amounts || {}), [idx]: final } });
      toast({ icon: '🎰', title: formatCurrency(final, currency), line: "Today's amount. Save it to keep your streak.", sub: '' });
    }, 70);
  }

  async function join(tpl, cfg) {
    let goalId = cfg.goalId;
    if (!tpl.auto && goalId === 'new') {
      const g = await addGoal({ name: cfg.goalName || tpl.name, target: Number(cfg.goalTarget) || 1000, icon: tpl.emoji, color: '#10B981', deadline: null });
      goalId = g.id;
    }
    await addChallenge({
      template_id: tpl.id, name: tpl.name, emoji: tpl.emoji, level: 1,
      ...(tpl.spin ? { min: Number(cfg.min), max: Number(cfg.max) } : {}),
      ...(tpl.amountFor ? { step: Number(cfg.step) } : {}),
      ...(tpl.auto ? { nospend_categories: cfg.categories } : { goal_id: goalId }),
    });
    setJoinFor(null);
    setPicking(false);
  }

  async function levelUp(c) {
    const tpl = getTemplate(c.template_id);
    const level = (Number(c.level) || 1) + 1;
    await addChallenge({
      template_id: tpl.id, name: tpl.name, emoji: tpl.emoji, level,
      goal_id: c.goal_id, wallet_id: c.wallet_id, nospend_categories: c.nospend_categories,
      ...(tpl.spin ? { min: c.min, max: c.max } : {}), ...(tpl.amountFor ? { step: c.step } : {}),
      ...levelUpSettings(tpl, c),
    });
    setFinishedFor(null);
    toast({ icon: '⬆️', title: `Level ${level} started`, line: `${tpl.name}, 25% more each ${tpl.periodLabel || 'time'}`, sub: '' });
  }

  const saveChallenge = saveFor && challenges.find((c) => c.id === saveFor.id);
  const gridChallenge = gridFor && challenges.find((c) => c.id === gridFor);

  return (
    <div className="section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Savings Challenges</div>
        {active.length > 0 && (
          <button onClick={() => setPicking(true)} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ New</button>
        )}
      </div>

      {active.length === 0 ? (
        <div className="card" style={{ padding: '22px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>🏆</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Turn saving into a game</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.5 }}>
            Every save moves real money into one of your goals. Keep your streak, earn freezes, level up.
          </div>
          <button className="btn-primary" style={{ width: '100%' }} onClick={() => setPicking(true)}>Browse challenges</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {active.map((c) => {
            const tpl = getTemplate(c.template_id);
            if (!tpl) return null;
            if (tpl.auto) return <NoSpendCard key={c.id} c={c} tpl={tpl} transactions={transactions} today={today} onRemove={() => removeChallenge(c.id)} />;
            if (tpl.impulse) return <ImpulseCard key={c.id} c={c} transactions={transactions} goals={goals} currency={currency} onPay={() => setSaveFor({ id: c.id, tax: true })} onRemove={() => removeChallenge(c.id)} />;
            return (
              <MoneyCard key={c.id} c={c} tpl={tpl} today={today} txIds={txIds} goals={goals} currency={currency} transactions={transactions}
                spinning={spinning?.id === c.id ? spinning.shown : null}
                onSpin={(i) => spin(c, i)}
                onSave={(indices, title) => setSaveFor({ id: c.id, indices, title })}
                onGrid={() => setGridFor(c.id)}
                onRemove={() => removeChallenge(c.id)} />
            );
          })}
        </div>
      )}

      {finished.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setShowShelf((v) => !v)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
            🏆 Trophy shelf ({finished.length}) {showShelf ? '▾' : '▸'}
          </button>
          {showShelf && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {finished.map((c) => {
                const tpl = getTemplate(c.template_id);
                const result = tpl?.auto
                  ? `${c.result?.clean ?? 0}/${c.result?.of ?? tpl.periods} clean days`
                  : `${formatShort(c.result?.saved ?? 0, currency)} saved`;
                return (
                  <div key={c.id} className="card-2" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 12 }}>
                    <span style={{ fontSize: 22 }}>{c.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{c.name}{c.level > 1 ? ` · Lv ${c.level}` : ''}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{result}{c.finished_at ? ` · ${formatDate(c.finished_at)}` : ''}</div>
                    </div>
                    {tpl && !activeTemplateIds.has(tpl.id) && (
                      <button className="chip" onClick={() => levelUp(c)}>⬆️ Level up</button>
                    )}
                    <button className="btn-icon" aria-label="Remove from shelf" style={{ width: 28, height: 28 }} onClick={() => window.confirm('Remove this trophy?') && removeChallenge(c.id)}>✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {celebrate && (
        <div style={{ position: 'fixed', left: '50%', top: '26%', transform: 'translateX(-50%)', zIndex: 10000, width: 'min(320px, calc(100vw - 32px))',
          background: 'var(--card)', border: '1px solid var(--green)', borderRadius: 18, padding: '18px 22px',
          textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: 'pop 0.3s ease' }} onClick={() => setCelebrate(null)}>
          <div style={{ fontSize: 40, marginBottom: 4 }}>{celebrate.icon}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)' }}>{celebrate.title}</div>
          {celebrate.line && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{celebrate.line}</div>}
          {celebrate.sub && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{celebrate.sub}</div>}
        </div>
      )}

      {picking && !joinFor && (
        <Sheet title="Choose a challenge" onClose={() => setPicking(false)}>
          {CHALLENGE_TEMPLATES.map((t) => {
            const joined = activeTemplateIds.has(t.id);
            return (
              <div key={t.id} className="card-2" style={{ padding: 14, borderRadius: 14, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ fontSize: 24 }}>{t.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t.name}</div>
                      {t.tier && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 100, padding: '1px 7px' }}>{t.tier}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {t.impulse ? 'Ongoing' : `${t.periods} ${t.periodLabel}s`}{t.auto ? ' · auto-tracked' : isPaced(t) ? ` · one per ${t.periodLabel === 'envelope' ? 'day' : t.periodLabel}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 12 }}>{t.blurb}</div>
                <button className="btn-primary" style={{ width: '100%', opacity: joined ? 0.5 : 1 }} disabled={joined} onClick={() => setJoinFor(t)}>
                  {joined ? 'Already active' : 'Set up'}
                </button>
              </div>
            );
          })}
        </Sheet>
      )}

      {joinFor && <JoinSheet tpl={joinFor} goals={goals} currency={currency} onJoin={(cfg) => join(joinFor, cfg)} onClose={() => setJoinFor(null)} />}

      {saveChallenge && (() => {
        const tpl = getTemplate(saveChallenge.template_id);
        if (saveFor.tax) {
          const s = impulseTaxStatus(saveChallenge, transactions);
          return <SaveSheet title="Pay impulse tax" amount={s.owed} c={saveChallenge} wallets={wallets} goals={goals} currency={currency}
            note={`${s.unpaid.length} impulse buy${s.unpaid.length === 1 ? '' : 's'} since you started.`}
            onConfirm={(w, g) => payImpulseTax(saveChallenge, w, g)} onClose={() => setSaveFor(null)} />;
        }
        const st = challengeStatus(tpl, saveChallenge, today, txIds);
        const amount = saveFor.indices.reduce((s, i) => s + (amountAt(tpl, saveChallenge, i) ?? (Number(saveChallenge.min) + Number(saveChallenge.max)) / 2), 0);
        const single = saveFor.indices.length === 1 ? saveFor.indices[0] : null;
        const canFreeze = single != null && st.missed.includes(single) && st.freezesLeft > 0;
        const unspun = tpl.spin && saveFor.indices.some((i) => saveChallenge.amounts?.[i] == null);
        return <SaveSheet title={saveFor.title} amount={amount} approx={unspun} c={saveChallenge} wallets={wallets} goals={goals} currency={currency}
          note={unspun ? 'Missed spins get a random amount when you confirm.' : ''}
          freeze={canFreeze ? { left: st.freezesLeft, onUse: () => applyFreeze(saveChallenge, single) } : null}
          onConfirm={(w, g) => doSave(saveChallenge, saveFor.indices, w, g)} onClose={() => setSaveFor(null)} />;
      })()}

      {gridChallenge && (
        <GridSheet c={gridChallenge} tpl={getTemplate(gridChallenge.template_id)} today={today} txIds={txIds} currency={currency}
          onSave={(i) => { setGridFor(null); setSaveFor({ id: gridChallenge.id, indices: [i], title: `Save ${getTemplate(gridChallenge.template_id).periodLabel} ${i + 1}` }); }}
          onUndo={(i) => undoSave(gridChallenge, i)} onClose={() => setGridFor(null)} />
      )}

      {finishedFor && (() => {
        const tpl = getTemplate(finishedFor.template_id);
        const next = levelUpSettings(tpl, finishedFor);
        return (
          <Sheet title="Challenge complete! 🏆" onClose={() => setFinishedFor(null)}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48 }}>{finishedFor.emoji}</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{finishedFor.name}{finishedFor.level > 1 ? ` · Level ${finishedFor.level}` : ''}</div>
              <div className="font-num" style={{ fontSize: 26, fontWeight: 800, color: 'var(--green)', marginTop: 6 }}>{formatCurrency(finishedFor.savedAmount, currency)}</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{meaningOf(finishedFor.savedAmount, transactions, today) || 'saved into your goal'}</div>
              {finishedFor.best_streak > 1 && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>Best streak: 🔥 {finishedFor.best_streak}</div>}
            </div>
            <button className="btn-primary" onClick={() => levelUp(finishedFor)}>
              ⬆️ Level up{next.step ? `: ${formatShort(next.step, currency)} per step` : next.max ? `: spin ${formatShort(next.min, currency)}–${formatShort(next.max, currency)}` : ''}
            </button>
            <button className="btn-ghost" onClick={() => setFinishedFor(null)}>Later (it's on your trophy shelf)</button>
          </Sheet>
        );
      })()}
    </div>
  );
}

// ─── Cards ─────────────────────────────────────────────────────────────────
function CardHeader({ c, sub, right, onRemove }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 26 }}>{c.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{c.name}{c.level > 1 ? <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}> · Lv {c.level}</span> : null}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{sub}</div>
      </div>
      {right}
      <button onClick={() => window.confirm(`Quit this challenge? Money already saved stays in your goal.`) && onRemove()} className="btn-icon" aria-label="Quit challenge" style={{ width: 30, height: 30 }}>✕</button>
    </div>
  );
}

function StreakChip({ n, freezes }) {
  if (!n && !freezes) return null;
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, fontWeight: 700 }}>
      {n > 0 && <span style={{ color: '#F97316' }} title="Streak">🔥{n}</span>}
      {freezes > 0 && <span style={{ color: '#38BDF8' }} title="Streak freezes">❄️{freezes}</span>}
    </div>
  );
}

function MoneyCard({ c, tpl, today, txIds, goals, currency, transactions, spinning, onSpin, onSave, onGrid, onRemove }) {
  const st = challengeStatus(tpl, c, today, txIds);
  const goal = goals.find((g) => g.id === c.goal_id);
  const badges = earnedBadges(st.pct);
  const meaning = meaningOf(st.savedAmount, transactions, today);
  const missedAmount = st.missed.reduce((s, i) => s + (amountAt(tpl, c, i) ?? (Number(c.min) + Number(c.max)) / 2), 0);
  const curAmount = st.current >= 0 ? amountAt(tpl, c, st.current) : null;
  const paced = isPaced(tpl);

  let action;
  if (st.currentDue && tpl.spin && curAmount == null) {
    action = (
      <button className="btn-primary" style={{ flex: 1 }} onClick={() => onSpin(st.current)} disabled={spinning != null}>
        {spinning != null ? <span className="font-num">🎰 {formatCurrency(spinning, currency)}</span> : "🎰 Spin today's amount"}
      </button>
    );
  } else if (st.currentDue) {
    action = <button className="btn-primary" style={{ flex: 1 }} onClick={() => onSave([st.current], `Save ${periodWord(tpl)} amount`)}>Save {formatCurrency(curAmount, currency)}</button>;
  } else if (st.missed.length) {
    action = <button className="btn-primary" style={{ flex: 1 }} onClick={() => onSave(st.missed, `Catch up ${st.missed.length} missed`)}>Catch up {formatCurrency(missedAmount, currency)}</button>;
  } else {
    action = (
      <div style={{ flex: 1, fontSize: 13, color: 'var(--green)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
        ✅ Done{paced && st.nextOpens ? `. Next opens ${st.nextOpens === today ? 'today' : formatDate(st.nextOpens)}` : ''}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <CardHeader c={c} onRemove={onRemove}
        sub={paced ? `${tpl.periodLabel[0].toUpperCase()}${tpl.periodLabel.slice(1)} ${Math.max(1, st.opened)} of ${tpl.periods} · ${st.saved.size} saved` : `${st.saved.size} / ${tpl.periods} ${tpl.periodLabel}s`}
        right={<>
          <StreakChip n={st.streak} freezes={st.freezesLeft} />
          {badges.length > 0 && <span style={{ fontSize: 15 }} title={badges.map((b) => b.title).join(' · ')}>{badges[badges.length - 1].badge}</span>}
        </>} />

      <div style={{ fontSize: 12, color: goal ? 'var(--text-2)' : 'var(--text-3)', marginBottom: 8 }}>
        {goal
          ? <>→ {goal.icon || '🎯'} {goal.name} · {Math.round(Math.min(100, ((goal.current || 0) / (goal.target || 1)) * 100))}% there</>
          : 'No goal linked yet. You\'ll pick one on your next save.'}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span className="font-num" style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{formatShort(st.savedAmount, currency)}</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>of {tpl.spin ? '~' : ''}{formatShort(st.target, currency)} · {Math.round(st.pct)}%</span>
      </div>
      <div className="progress-bar" style={{ height: 8, marginBottom: meaning ? 6 : 12 }}>
        <div className="progress-fill" style={{ width: `${st.pct}%`, background: 'linear-gradient(90deg, #10B98199, #10B981)' }} />
      </div>
      {meaning && <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>{meaning}</div>}

      {st.missed.length > 0 && st.currentDue && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--red-dim, rgba(239,68,68,0.1))', marginBottom: 10, fontSize: 12 }}>
          <span style={{ flex: 1, color: 'var(--red)' }}>⚠ {st.missed.length} missed · {formatShort(missedAmount, currency)} behind</span>
          <button className="chip" onClick={() => onSave(st.missed, `Catch up ${st.missed.length} missed`)}>Catch up</button>
          {st.freezesLeft > 0 && <button className="chip" onClick={() => onSave([st.missed[st.missed.length - 1]], `Missed ${tpl.periodLabel} ${st.missed[st.missed.length - 1] + 1}`)}>❄️</button>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {action}
        <button className="btn-ghost" style={{ padding: '0 16px', width: 'auto' }} onClick={onGrid}>Grid</button>
      </div>
    </div>
  );
}

function NoSpendCard({ c, tpl, transactions, today, onRemove }) {
  const s = noSpendStatus(tpl, c, transactions, today);
  const cats = (c.nospend_categories || NOSPEND_DEFAULT).map((id) => getCategoryById(id).label.split(' ')[0]).join(', ');
  const todayState = s.days.find((d) => d.date === today)?.state;
  const colour = { clean: 'var(--green)', broken: 'var(--red)', today: '#F59E0B', future: 'var(--border)' };
  return (
    <div className="card" style={{ padding: 16 }}>
      <CardHeader c={c} onRemove={onRemove} sub={`${s.clean} clean · ${s.broken} slipped · ${tpl.periods} days`} right={<StreakChip n={s.streak} />} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {s.days.map((d) => (
          <div key={d.date} title={d.date} style={{ width: 14, height: 14, borderRadius: 4, background: d.state === 'future' ? 'transparent' : colour[d.state], border: `1px solid ${colour[d.state]}` }} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: todayState === 'broken' ? 'var(--red)' : 'var(--text-2)' }}>
        {todayState === 'broken' ? 'Slipped today. Tomorrow is a fresh start.' : todayState === 'today' ? `So far so good today. No ${cats} or impulse buys.` : ''}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Counts: {cats} + anything marked impulse. Bills never count.</div>
    </div>
  );
}

function ImpulseCard({ c, transactions, goals, currency, onPay, onRemove }) {
  const s = impulseTaxStatus(c, transactions);
  const goal = goals.find((g) => g.id === c.goal_id);
  return (
    <div className="card" style={{ padding: 16 }}>
      <CardHeader c={c} onRemove={onRemove} sub={`${s.items.length} impulse buy${s.items.length === 1 ? '' : 's'} since ${formatDate(c.start_date)}`} />
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>{goal ? `→ ${goal.icon || '🎯'} ${goal.name}` : 'No goal linked yet.'}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <span className="font-num" style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{formatShort(s.savedAmount, currency)} <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>tax paid</span></span>
        {s.owed > 0 && <span className="font-num" style={{ fontSize: 13, color: 'var(--red)', fontWeight: 700 }}>{formatShort(s.owed, currency)} owed</span>}
      </div>
      {s.owed > 0
        ? <button className="btn-primary" style={{ width: '100%' }} onClick={onPay}>Pay {formatCurrency(s.owed, currency)} impulse tax</button>
        : <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>✅ Nothing owed. Mark a spend as impulse and it shows up here.</div>}
    </div>
  );
}

// ─── Sheets ────────────────────────────────────────────────────────────────
function JoinSheet({ tpl, goals, currency, onJoin, onClose }) {
  const openGoals = goals.filter((g) => (g.current || 0) < g.target);
  const [step, setStep] = useState(String(tpl.defaultStep ?? ''));
  const [min, setMin] = useState(String(tpl.defaultMin ?? ''));
  const [max, setMax] = useState(String(tpl.defaultMax ?? ''));
  const [categories, setCategories] = useState(NOSPEND_DEFAULT);
  const [goalId, setGoalId] = useState(openGoals[0]?.id || 'new');
  const [goalName, setGoalName] = useState(tpl.name);
  const draft = { step: Number(step), min: Number(min), max: Number(max) };
  const target = tpl.impulse || tpl.auto ? 0 : challengeTarget(tpl, draft);
  const [goalTarget, setGoalTarget] = useState(String(Math.round(target) || 5000));
  const [busy, setBusy] = useState(false);
  const valid = tpl.auto ? categories.length > 0
    : (tpl.spin ? Number(min) > 0 && Number(max) >= Number(min) : !tpl.amountFor || Number(step) > 0)
      && (goalId !== 'new' || (goalName.trim() && Number(goalTarget) > 0));

  return (
    <Sheet title={`${tpl.emoji} ${tpl.name}`} onClose={onClose}>
      <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{tpl.blurb}</div>

      {tpl.spin && (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={label}>Min</label><input className="input font-num" type="number" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label style={label}>Max</label><input className="input font-num" type="number" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} /></div>
        </div>
      )}
      {tpl.amountFor && (
        <div><label style={label}>{tpl.stepLabel}</label><input className="input font-num" type="number" inputMode="numeric" value={step} onChange={(e) => setStep(e.target.value)} /></div>
      )}
      {target > 0 && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Total: <b className="font-num">{tpl.spin ? '~' : ''}{formatCurrency(target, currency)}</b> over {tpl.periods} {tpl.periodLabel}s</div>}

      {tpl.auto && (
        <div>
          <label style={label}>Spending that breaks a day</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {NOSPEND_CATEGORY_CHOICES.map((id) => {
              const cat = getCategoryById(id);
              const on = categories.includes(id);
              return <button key={id} className={`chip ${on ? 'active' : ''}`} onClick={() => setCategories((p) => (on ? p.filter((x) => x !== id) : [...p, id]))}>{cat.icon} {cat.label}</button>;
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>Anything you mark as impulse always counts. Rent, bills, transport and fees never do.</div>
        </div>
      )}

      {!tpl.auto && (
        <div>
          <label style={label}>Save into</label>
          <Chips value={goalId} onChange={setGoalId}
            items={[...openGoals.map((g) => ({ id: g.id, label: `${g.icon || '🎯'} ${g.name}` })), { id: 'new', label: '＋ New goal' }]} />
          {goalId === 'new' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <input className="input" style={{ flex: 2 }} placeholder="Goal name" value={goalName} onChange={(e) => setGoalName(e.target.value)} />
              <input className="input font-num" style={{ flex: 1 }} type="number" inputMode="numeric" placeholder="Target" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} />
            </div>
          )}
        </div>
      )}

      <button className="btn-primary" disabled={!valid || busy} onClick={async () => { setBusy(true); await onJoin({ step, min, max, categories, goalId, goalName: goalName.trim(), goalTarget }); setBusy(false); }}>
        Start challenge
      </button>
    </Sheet>
  );
}

function SaveSheet({ title, amount, approx, c, wallets, goals, currency, note, freeze, onConfirm, onClose }) {
  const openGoals = goals.filter((g) => (g.current || 0) < g.target || g.id === c.goal_id);
  const [walletId, setWalletId] = useState(wallets.find((w) => w.id === c.wallet_id)?.id || (wallets.length === 1 ? wallets[0].id : ''));
  const [goalId, setGoalId] = useState(goals.find((g) => g.id === c.goal_id)?.id || (openGoals.length === 1 ? openGoals[0].id : ''));
  const [busy, setBusy] = useState(false);
  const wallet = wallets.find((w) => w.id === walletId);
  const short = wallet && Number(wallet.balance) < amount;

  return (
    <Sheet title={title} onClose={onClose}>
      <div style={{ textAlign: 'center' }}>
        <div className="font-num" style={{ fontSize: 30, fontWeight: 800, color: 'var(--green)' }}>{approx ? '~' : ''}{formatCurrency(amount, currency)}</div>
        {note && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{note}</div>}
        {amount > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>
            {formatShort(amount * (1 - TREAT_SHARE), currency)} to your goal · {formatShort(amount * TREAT_SHARE, currency)} to 🎁 Treat Jar
          </div>
        )}
      </div>
      <div>
        <label style={label}>From</label>
        {wallets.length ? <Chips value={walletId} onChange={setWalletId} items={wallets.map((w) => ({ id: w.id, label: `${w.icon || '💳'} ${w.name}` }))} />
          : <div style={{ fontSize: 13, color: 'var(--red)' }}>Add an account first.</div>}
        {short && <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 6 }}>This takes {wallet.name} below zero.</div>}
      </div>
      <div>
        <label style={label}>Into goal</label>
        {openGoals.length ? <Chips value={goalId} onChange={setGoalId} items={openGoals.map((g) => ({ id: g.id, label: `${g.icon || '🎯'} ${g.name}` }))} />
          : <div style={{ fontSize: 13, color: 'var(--red)' }}>Add a goal first (Goals page).</div>}
      </div>
      <button className="btn-primary" disabled={!walletId || !goalId || busy || !(amount > 0)}
        onClick={async () => { setBusy(true); try { await onConfirm(walletId, goalId); } catch (e) { alert(e.message); } setBusy(false); }}>
        Move it to my goal
      </button>
      {freeze && <button className="btn-ghost" onClick={freeze.onUse}>❄️ Use a streak freeze instead ({freeze.left} left)</button>}
    </Sheet>
  );
}

function GridSheet({ c, tpl, today, txIds, currency, onSave, onUndo, onClose }) {
  const st = challengeStatus(tpl, c, today, txIds);
  const missed = new Set(st.missed);
  return (
    <Sheet title={`${c.emoji} ${c.name}`} onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
        Tap an open {tpl.periodLabel} to save it, or a saved one to undo it. {isPaced(tpl) ? `A new ${tpl.periodLabel} opens on schedule. 🔒 ones aren't open yet.` : ''}
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-3)', flexWrap: 'wrap' }}>
        <span>🟩 saved</span><span>❄️ frozen</span><span style={{ color: 'var(--red)' }}>▢ missed</span><span>🔒 locked</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {Array.from({ length: tpl.periods }).map((_, i) => {
          const isSaved = st.saved.has(i);
          const isFrozen = st.frozen.has(i);
          const locked = i >= st.opened && !isSaved;
          const isMissed = missed.has(i);
          const isCurrent = i === st.current && st.currentDue;
          const amt = amountAt(tpl, c, i);
          return (
            <button key={i} disabled={locked || isFrozen}
              onClick={() => (isSaved ? onUndo(i) : onSave(i))}
              style={{
                aspectRatio: '1', borderRadius: 10, cursor: locked || isFrozen ? 'default' : 'pointer', padding: 2, fontFamily: 'inherit',
                border: `1px solid ${isSaved ? 'var(--green)' : isMissed ? 'var(--red)' : isCurrent ? '#F59E0B' : isFrozen ? '#38BDF8' : 'var(--border)'}`,
                background: isSaved ? 'var(--green-dim, rgba(16,185,129,0.15))' : isFrozen ? 'rgba(56,189,248,0.12)' : 'var(--card-2)',
                color: isSaved ? 'var(--green)' : 'var(--text-2)', opacity: locked ? 0.4 : 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, opacity: 0.7 }}>{tpl.periodLabel.charAt(0).toUpperCase()}{i + 1}</span>
              <span style={{ fontSize: 11, fontWeight: 700 }}>
                {isFrozen ? '❄️' : locked ? '🔒' : amt == null ? '🎰' : formatShort(amt, currency)}
              </span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
