import { useState } from 'react';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, getCategoryById, genId, todayISO } from '../lib/utils';

const WALLET_COLORS = ['#10B981','#3B82F6','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#14B8A6'];
const WALLET_ICONS = ['💳','📱','🏦','💵','📲','🏧','💰','🪙'];

function WalletForm({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [type, setType] = useState(initial?.type || 'cash');
  const [balance, setBalance] = useState(initial?.balance ?? 0);
  const [color, setColor] = useState(initial?.color || '#10B981');
  const [icon, setIcon] = useState(initial?.icon || '💳');
  const [currency, setCurrency] = useState(initial?.currency || 'KES');

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>{initial ? 'Edit Wallet' : 'Add Wallet'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Icon</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {WALLET_ICONS.map((ic) => (
                <button key={ic} onClick={() => setIcon(ic)}
                  style={{ fontSize: 24, width: 44, height: 44, borderRadius: 10, border: `2px solid ${icon === ic ? 'var(--green)' : 'var(--border)'}`, background: icon === ic ? 'var(--green-dim)' : 'var(--card-2)', cursor: 'pointer' }}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Name</label>
            <input className="input" placeholder="e.g. M-Pesa" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="mobile">Mobile Money</option>
              <option value="bank">Bank Account</option>
              <option value="crypto">Crypto</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Opening Balance</label>
            <input className="input font-num" type="number" inputMode="decimal" placeholder="0.00" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Currency</label>
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {['KES','USD','EUR','GBP','UGX','TZS'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Color</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {WALLET_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  style={{ width: 32, height: 32, borderRadius: 8, background: c, border: `3px solid ${color === c ? '#fff' : 'transparent'}`, cursor: 'pointer', transition: 'transform 0.1s', transform: color === c ? 'scale(1.2)' : 'none' }} />
              ))}
            </div>
          </div>
          <button className="btn-primary" onClick={() => onSave({ ...initial, name, type, balance: Number(balance), color, icon, currency, id: initial?.id || genId(), created_at: initial?.created_at || todayISO() })}>
            {initial ? 'Save Changes' : 'Add Wallet'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WalletsPage() {
  const { wallets, transactions, addWallet, updateWallet, removeWallet, currency } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [editWallet, setEditWallet] = useState(null);
  const [showTxn, setShowTxn] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState(null);

  async function handleSave(data) {
    if (editWallet) { await updateWallet(data); setEditWallet(null); }
    else { await addWallet(data); setShowAdd(false); }
  }

  const totalBalance = wallets.reduce((s, w) => s + Number(w.balance || 0), 0);

  return (
    <Layout onFab={() => setShowTxn(true)}>
      <div className="page">
        <div className="page-header">
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Wallets</h1>
          <div className="font-num" style={{ fontSize: 14, color: 'var(--text-3)' }}>Total: {formatCurrency(totalBalance, currency)}</div>
        </div>

        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {wallets.map((w) => {
            const txns = transactions.filter((t) => t.wallet_id === w.id || t.to_wallet_id === w.id);
            const recent = txns.slice(0, 3);
            return (
              <div key={w.id} className="card" style={{ overflow: 'hidden', borderColor: `${w.color}25` }}>
                {/* Wallet header */}
                <div style={{ padding: '16px', background: `linear-gradient(135deg, ${w.color}15 0%, transparent 100%)`, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 16, background: `${w.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
                    {w.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{w.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'capitalize' }}>{w.type}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="font-num" style={{ fontSize: 20, fontWeight: 700, color: Number(w.balance) >= 0 ? w.color : 'var(--red)' }}>
                      {formatCurrency(w.balance, w.currency || currency)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{w.currency || currency}</div>
                  </div>
                </div>

                {/* Recent txns */}
                {recent.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {recent.map((tx, i) => {
                      const cat = getCategoryById(tx.category);
                      const isIncoming = tx.to_wallet_id === w.id;
                      return (
                        <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: i < recent.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <span style={{ fontSize: 16 }}>{tx.type === 'transfer' ? '⇄' : cat.icon}</span>
                          <div style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tx.description || (tx.type === 'transfer' ? 'Transfer' : cat.label)}
                          </div>
                          <div className="font-num" style={{ fontSize: 13, fontWeight: 600, flexShrink: 0, color: (tx.type === 'income' || isIncoming) ? 'var(--green)' : 'var(--red)' }}>
                            {(tx.type === 'income' || isIncoming) ? '+' : '-'}{formatCurrency(tx.amount, currency)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
                  <button onClick={() => setEditWallet(w)} style={{ flex: 1, padding: '10px', background: 'transparent', border: 'none', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    ✏️ Edit
                  </button>
                  <div style={{ width: 1, background: 'var(--border)' }} />
                  <button onClick={() => removeWallet(w.id)} style={{ flex: 1, padding: '10px', background: 'transparent', border: 'none', color: 'var(--red)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit', opacity: 0.7 }}>
                    🗑 Remove
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add wallet button */}
          <button className="btn-ghost" onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
            <span style={{ fontSize: 20 }}>+</span> Add Wallet
          </button>
        </div>
      </div>

      {(showAdd || editWallet) && (
        <WalletForm
          initial={editWallet}
          onSave={handleSave}
          onClose={() => { setShowAdd(false); setEditWallet(null); }}
        />
      )}
      {showTxn && <TransactionModal onClose={() => setShowTxn(false)} />}
    </Layout>
  );
}
