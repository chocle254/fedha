import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import { useApp } from '../context/AppContext';
import { formatShort, formatCurrency, formatDate, getCategoryById } from '../lib/utils';

export default function TransactionsPage() {
  const router = useRouter();
  const { transactions, wallets, removeTransaction, currency, loading } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterWallet, setFilterWallet] = useState('all');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (filterWallet !== 'all' && t.wallet_id !== filterWallet) return false;
      if (search) {
        const q = search.toLowerCase();
        const cat = getCategoryById(t.category);
        if (!t.description?.toLowerCase().includes(q) && !cat.label.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [transactions, filterType, filterWallet, search]);

  // Group by date
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((t) => {
      if (!map[t.date]) map[t.date] = [];
      map[t.date].push(t);
    });
    // Within each date, show the most recently created transaction first.
    Object.values(map).forEach((txns) => {
      txns.sort((a, b) => {
        const timeA = Date.parse(a.created_at || a.createdAt || a.timestamp || '') || 0;
        const timeB = Date.parse(b.created_at || b.createdAt || b.timestamp || '') || 0;
        return timeB - timeA;
      });
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const totalIncome = filtered.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  async function handleDelete(id) {
    await removeTransaction(id);
    setConfirmDelete(null);
  }

  // Jarvis can open the transaction logger directly (e.g. "log an expense").
  useEffect(() => {
    if (!router.isReady || router.query.add !== '1') return;
    setShowAdd(true);
    router.replace('/transactions', undefined, { shallow: true });
  }, [router.isReady, router.query.add]);

  return (
    <Layout onFab={() => setShowAdd(true)}>
      <div className="page">
        <div className="page-header">
          <h1 className="lx-h1" style={{ marginBottom: 16 }}>Activity</h1>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input
              className="input"
              placeholder="Search by name, category or amount"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 40 }}
            />
          </div>

          {/* Filters */}
          <div className="lx-segbar" role="tablist" aria-label="Type">
            {[['all', 'All'], ['expense', 'Spent'], ['income', 'Received'], ['transfer', 'Moved']].map(([v, l]) => (
              <button key={v} role="tab" aria-selected={filterType === v} className={filterType === v ? 'on' : ''} onClick={() => setFilterType(v)}>{l}</button>
            ))}
          </div>

          {/* Wallet filter */}
          {wallets.length > 1 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingTop: 8, paddingBottom: 2 }}>
              <button className={`chip ${filterWallet === 'all' ? 'active' : ''}`} onClick={() => setFilterWallet('all')}>All wallets</button>
              {wallets.map((w) => (
                <button key={w.id} className={`chip ${filterWallet === w.id ? 'active' : ''}`} onClick={() => setFilterWallet(w.id)}
                  style={filterWallet === w.id ? { background: `${w.color}20`, borderColor: w.color, color: w.color } : undefined}>
                  {w.icon} {w.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Summary: in, out, net, and how the two compare */}
        {filtered.length > 0 && (
          <div style={{ padding: '0 20px 18px' }}>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                {[['Received', totalIncome, 'var(--green)', '+'], ['Spent', totalExpense, 'var(--text)', '−'], ['Net', totalIncome - totalExpense, totalIncome - totalExpense >= 0 ? 'var(--green)' : 'var(--red)', '']].map(([l, v, c, sign]) => (
                  <div key={l} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>{l}</div>
                    <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: c, marginTop: 3, whiteSpace: 'nowrap' }}>{sign}{formatShort(Math.abs(v), currency)}</div>
                  </div>
                ))}
              </div>
              {totalIncome + totalExpense > 0 && (
                <div style={{ display: 'flex', height: 6, borderRadius: 6, overflow: 'hidden', marginTop: 12, background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{ width: `${(totalIncome / (totalIncome + totalExpense)) * 100}%`, background: 'var(--green)' }} />
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.35)' }} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Transaction list */}
        <div style={{ padding: '0 20px' }}>
          {loading ? (
            [...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 12, marginBottom: 8 }} />)
          ) : grouped.length === 0 ? (
            <div className="empty-state">
              <div className="icon" style={{ opacity: 0.5 }}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>
              </div>
              <h3>{search ? 'Nothing matches that' : 'No activity yet'}</h3>
              <p>{search ? 'Try different search terms' : 'Tap + to add your first transaction'}</p>
            </div>
          ) : (
            grouped.map(([date, txns]) => (
              <div key={date} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{formatDate(date)}</span>
                  <span className="font-num" style={{ color: 'var(--text-3)' }}>
                    {txns.reduce((s, t) => t.type === 'income' ? s + Number(t.amount) : t.type === 'expense' ? s - Number(t.amount) : s, 0) >= 0 ? '+' : ''}
                    {formatCurrency(txns.reduce((s, t) => t.type === 'income' ? s + Number(t.amount) : t.type === 'expense' ? s - Number(t.amount) : s, 0), currency)}
                  </span>
                </div>
                <div className="card" style={{ overflow: 'hidden' }}>
                  {txns.map((tx, i) => {
                    const cat = getCategoryById(tx.category);
                    const wallet = wallets.find((w) => w.id === tx.wallet_id);
                    const toWallet = wallets.find((w) => w.id === tx.to_wallet_id);
                    const txTimestamp = tx.created_at || tx.createdAt || tx.timestamp;
                    const txTime = txTimestamp && !Number.isNaN(Date.parse(txTimestamp))
                      ? new Date(txTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '';
                    return (
                      <div key={tx.id} className="lx-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < txns.length - 1 ? '1px solid var(--border)' : 'none' }}
                        onClick={() => setConfirmDelete(tx.id)} >
                        <div style={{ width: 42, height: 42, borderRadius: 12, background: `${tx.type === 'transfer' ? '#3B82F6' : cat.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                          {tx.type === 'transfer' ? '⇄' : cat.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {tx.description || (tx.type === 'transfer' ? `${wallet?.name} → ${toWallet?.name}` : cat.label)}
                            </span>
                            {tx.is_impulse && <span className="impulse-badge">⚡</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                            {wallet?.icon} {wallet?.name}
                            {tx.type !== 'transfer' && ` · ${cat.label}`}
                            {txTime && ` · ${txTime}`}
                          </div>
                        </div>
                        <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: tx.type === 'income' ? 'var(--green)' : tx.type === 'transfer' ? 'var(--text-2)' : 'var(--text)', flexShrink: 0 }}>
                          {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '' : '−'}
                          {formatCurrency(tx.amount, tx.currency || currency)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-sheet" style={{ padding: 24 }}>
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 20px' }} />
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Delete transaction?</div>
            <div style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 24 }}>This will reverse the wallet balance change.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn-primary" style={{ background: 'var(--red)', color: '#fff' }} onClick={() => handleDelete(confirmDelete)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showAdd && <TransactionModal onClose={() => setShowAdd(false)} />}
    </Layout>
  );
}
