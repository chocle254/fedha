import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { genId, todayISO, CATEGORIES, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../lib/utils';

export default function TransactionModal({ onClose }) {
  const { wallets, addTransaction, currency } = useApp();
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [walletId, setWalletId] = useState(wallets[0]?.id || '');
  const [toWalletId, setToWalletId] = useState(wallets[1]?.id || '');
  const [category, setCategory] = useState('food');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayISO());
  const [isImpulse, setIsImpulse] = useState(false);
  const [saving, setSaving] = useState(false);

  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  async function handleSubmit() {
    if (!amount || Number(amount) <= 0) return;
    setSaving(true);
    try {
      await addTransaction({
        type,
        amount: Number(amount),
        wallet_id: walletId,
        to_wallet_id: type === 'transfer' ? toWalletId : undefined,
        category: type !== 'transfer' ? category : undefined,
        description,
        date,
        is_impulse: isImpulse,
        currency,
      });
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
              <select className="input" value={toWalletId} onChange={(e) => setToWalletId(e.target.value)}>
                {wallets.filter((w) => w.id !== walletId).map((w) => (
                  <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
                ))}
              </select>
            </div>
          )}

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
                      fontFamily: 'Outfit',
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
                <div style={{ fontSize: 14, fontWeight: 600, color: isImpulse ? '#F59E0B' : 'var(--text)', fontFamily: 'Outfit' }}>
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

          <button className="btn-primary" onClick={handleSubmit} disabled={saving || !amount}>
            {saving ? 'Saving…' : `Save ${type === 'expense' ? 'Expense' : type === 'income' ? 'Income' : 'Transfer'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
