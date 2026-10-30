import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { todayISO, INCOME_CATEGORIES, EXPENSE_CATEGORIES, toBaseAmount, goalsInTurnOrder, formatCurrency, DEPOSIT_SAVINGS_CUT } from '../lib/utils';
import { addTransactionWithFee } from '../lib/finance-actions';

export default function TransactionModal({ onClose }) {
  const { wallets, goals, addTransaction, currency, lastSavedGoalId } = useApp();
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('');
  const [walletId, setWalletId] = useState(wallets[0]?.id || '');
  const [toWalletId, setToWalletId] = useState(wallets[1]?.id || '');
  const [category, setCategory] = useState('food');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayISO());
  const [isImpulse, setIsImpulse] = useState(false);
  const [saving, setSaving] = useState(false);

  const cats = (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).filter((c) => c.id !== 'fees');
  // Never transfer a wallet into itself: if the picked "to" wallet is the same
  // as "from", fall back to the first other wallet.
  const otherWallets = wallets.filter((w) => w.id !== walletId);
  const effectiveTo = otherWallets.some((w) => w.id === toWalletId) ? toWalletId : otherWallets[0]?.id || '';
  const feeNum = Number(fee) || 0;
  const amountNum = Number(amount) || 0;
  // After income is saved, the user is asked to save 30% for the goal whose turn it is.
  const nextGoal = goalsInTurnOrder(goals, lastSavedGoalId)[0];

  async function handleSubmit() {
    if (!amountNum || amountNum <= 0 || feeNum < 0) return;
    if (type === 'transfer' && !effectiveTo) return;
    setSaving(true);
    try {
      // Amounts are typed in the display currency but stored in the base
      // currency (KES); convert so USD/EUR entries aren't stored as shillings.
      await addTransactionWithFee(addTransaction, {
        type,
        amount: toBaseAmount(amountNum, currency),
        wallet_id: walletId,
        to_wallet_id: type === 'transfer' ? effectiveTo : undefined,
        category: type !== 'transfer' ? category : undefined,
        description,
        date,
        is_impulse: isImpulse,
        currency,
      }, toBaseAmount(feeNum, currency));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        {/* Handle bar */}
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />

        {/* Type tabs */}
        <div style={{ display: 'flex', padding: '0 20px 4px', gap: 8 }}>
          {[['expense', '↓ Expense'], ['income', '↑ Income'], ['transfer', '⇄ Transfer']].map(([t, l]) => (
            <button key={t} className={`chip ${type === t ? 'active' : ''}`} onClick={() => setType(t)}
              style={type === t && t === 'expense' ? { background: 'rgba(239,68,68,0.12)', borderColor: 'var(--red)', color: 'var(--red)' } : undefined}>
              {l}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {/* Amount */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Amount</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontWeight: 500 }}>
                {currency === 'KES' ? 'KSh' : currency}
              </span>
              <input
                className="input font-num"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ paddingLeft: currency === 'KES' ? 52 : 48, fontSize: 22, fontWeight: 600 }}
                autoFocus
              />
            </div>
            {type === 'income' && nextGoal && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                30%{amountNum > 0 ? ` (${formatCurrency(toBaseAmount(amountNum, currency) * DEPOSIT_SAVINGS_CUT, currency)})` : ''} for {nextGoal.icon} {nextGoal.name}? You'll be asked after saving
              </div>
            )}
          </div>

          {/* Source wallet */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              {type === 'transfer' ? 'From Wallet' : 'Wallet'}
            </label>
            <select className="input" value={walletId} onChange={(e) => setWalletId(e.target.value)}>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
              ))}
            </select>
          </div>

          {/* Destination wallet (transfer only) */}
          {type === 'transfer' && (
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>To Wallet</label>
              <select className="input" value={effectiveTo} onChange={(e) => setToWalletId(e.target.value)}>
                {wallets.filter((w) => w.id !== walletId).map((w) => (
                  <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Transaction fee */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Transaction Fee (optional)</label>
            <input className="input font-num" type="number" inputMode="decimal" min="0" placeholder="0 — e.g. M-Pesa / bank charge" value={fee} onChange={(e) => setFee(e.target.value)} />
            {feeNum > 0 && amountNum > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
                {type === 'transfer'
                  ? <>{wallets.find((w) => w.id === walletId)?.name || 'Source'} goes down by {(amountNum + feeNum).toLocaleString()}, {wallets.find((w) => w.id === effectiveTo)?.name || 'destination'} goes up by {amountNum.toLocaleString()}.</>
                  : type === 'income'
                    ? <>You keep {(amountNum - feeNum).toLocaleString()} after the fee.</>
                    : <>Total out of your wallet: {(amountNum + feeNum).toLocaleString()}.</>}
                {' '}The fee is saved as its own "Transaction Fees" expense.
              </div>
            )}
          </div>

          {/* Category (not for transfer) */}
          {type !== 'transfer' && (
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Category</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {cats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 8,
                      border: `1px solid ${category === c.id ? c.color : 'var(--border)'}`,
                      background: category === c.id ? `${c.color}22` : 'var(--card-2)',
                      color: category === c.id ? c.color : 'var(--text-2)',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: 'Onest',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    <span>{c.icon}</span> {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Note (optional)</label>
            <input className="input" placeholder="What was this for?" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {/* Date */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/* Impulse flag */}
          {type === 'expense' && (
            <button
              onClick={() => setIsImpulse(!isImpulse)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: isImpulse ? 'rgba(245,158,11,0.1)' : 'var(--card-2)',
                border: `1px solid ${isImpulse ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <span style={{ fontSize: 22 }}>⚡</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: isImpulse ? '#F59E0B' : 'var(--text)', fontFamily: 'Onest' }}>
                  {isImpulse ? 'Marked as impulse spend' : 'Was this an impulse buy?'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {isImpulse ? "Good to know — awareness is the first step" : "Tap to flag for your awareness"}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', width: 20, height: 20, borderRadius: 4, border: `2px solid ${isImpulse ? '#F59E0B' : 'var(--border)'}`, background: isImpulse ? '#F59E0B' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isImpulse && <span style={{ color: '#000', fontSize: 13, fontWeight: 700 }}>✓</span>}
              </div>
            </button>
          )}

          {type === 'transfer' && !effectiveTo && (
            <div style={{ fontSize: 13, color: 'var(--red)' }}>Add a second wallet to transfer between wallets.</div>
          )}
          <button className="btn-primary" onClick={handleSubmit} disabled={saving || !amount || (type === 'transfer' && !effectiveTo)}>
            {saving ? 'Saving…' : `Save ${type === 'expense' ? 'Expense' : type === 'income' ? 'Income' : 'Transfer'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
