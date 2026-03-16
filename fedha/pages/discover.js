import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatShort, genId, todayISO } from '../lib/utils';

// ─── FLOATING CASH CALCULATOR ────────────────────────────────────────────────
function useFloatingCash() {
  const { wallets, budgets, loans, currency } = useApp();
  const totalBalance = wallets.reduce((s, w) => s + Number(w.balance || 0), 0);
  const totalBudgeted = budgets.reduce((s, b) => s + Math.max(0, Number(b.allocated || 0) - Number(b.spent || 0)), 0);
  const totalOwed = loans.filter((l) => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount || 0), 0);
  const floating = totalBalance - totalBudgeted - totalOwed;
  return { floating, totalBalance, totalBudgeted, totalOwed, currency };
}

// ─── PENDING OPPORTUNITY CARD ─────────────────────────────────────────────────
function PendingCard({ opp, onMarkDone, onCancel }) {
  const { currency } = useApp();
  return (
    <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 24 }}>{opp.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{opp.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{opp.platform || opp.category}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>
            +{formatShort(opp.estimated_amount, currency)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600, marginTop: 2 }}>PENDING</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onMarkDone}
          style={{ flex: 2, padding: '10px', background: 'var(--green)', border: 'none', borderRadius: 10, color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit' }}>
          ✓ Mark as Done & Paid
        </button>
        <button onClick={onCancel}
          style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: 'var(--red)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── ACTIVITY CARD ────────────────────────────────────────────────────────────
function ActivityCard({ item, onBook, currency }) {
  return (
    <div className="card" style={{ padding: '16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
          {item.emoji}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{item.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{item.description}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--green)', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 100 }}>
          {item.is_free ? 'FREE' : `~${formatCurrency(item.estimated_cost, currency)}`}
        </span>
        <span style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 12, padding: '3px 10px', borderRadius: 100 }}>
          {item.category}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>⚡ {item.why_now}</span>
      </div>
      <button onClick={() => onBook(item)}
        style={{ width: '100%', padding: '10px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit' }}>
        Record this spend →
      </button>
    </div>
  );
}

// ─── OPPORTUNITY CARD ─────────────────────────────────────────────────────────
function OpportunityCard({ item, onClaim }) {
  const diffColor = { Easy: '#10B981', Medium: '#F59E0B', Hard: '#EF4444' };
  return (
    <div className="card" style={{ padding: '16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
          {item.emoji}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{item.title}</div>
          <div style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, marginTop: 2 }}>{item.platform}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="font-num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{item.estimated_earnings}</div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>{item.description}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ background: `${diffColor[item.difficulty]}20`, border: `1px solid ${diffColor[item.difficulty]}40`, color: diffColor[item.difficulty], fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100 }}>
          {item.difficulty}
        </span>
        <span style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 11, padding: '3px 10px', borderRadius: 100 }}>
          ⏱ {item.time_required}
        </span>
        {item.link_hint && (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>🔗 {item.link_hint}</span>
        )}
      </div>
      <button onClick={() => onClaim(item)}
        style={{ width: '100%', padding: '11px', background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, color: 'var(--green)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit' }}>
        🙋 I'll do this!
      </button>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function DiscoverPage() {
  const { addTransaction, wallets, budgets, currency } = useApp();
  const { floating, totalBalance, totalBudgeted, totalOwed } = useFloatingCash();

  const [tab, setTab] = useState('activities');
  const [dateMode, setDateMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activities, setActivities] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [pending, setPending] = useState([]);
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle'); // idle | loading | got | denied
  const [showTxn, setShowTxn] = useState(false);
  const [bookingActivity, setBookingActivity] = useState(null);
  const [bookingAmount, setBookingAmount] = useState('');
  const [walletId, setWalletId] = useState(wallets[0]?.id || '');

  const currencySymbols = { KES: 'KSh', USD: '$', EUR: '€', GBP: '£', UGX: 'USh', TZS: 'TSh' };
  const symbol = currencySymbols[currency] || currency;

  // Get location
  function getLocation() {
    if (!navigator.geolocation) { setLocationStatus('denied'); return; }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        // Reverse geocode using a free API
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const d = await r.json();
          const city = d.address?.city || d.address?.town || d.address?.county || d.address?.state || 'your area';
          setLocation({ lat, lng, city });
          setLocationStatus('got');
        } catch {
          setLocation({ lat, lng, city: 'your area' });
          setLocationStatus('got');
        }
      },
      () => setLocationStatus('denied')
    );
  }

  async function fetchActivities() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'activities',
          balance: Math.max(0, floating),
          currency,
          currency_symbol: symbol,
          location,
          dateMode,
          budgets: budgets.map((b) => ({ name: b.name, period: b.period })),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setActivities(data.results || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchOpportunities() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'opportunities',
          balance: Math.max(0, floating),
          currency,
          currency_symbol: symbol,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOpportunities(data.results || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleFetch() {
    if (tab === 'activities') fetchActivities();
    else fetchOpportunities();
  }

  // Claim opportunity → add to pending list
  function claimOpportunity(opp) {
    setPending((prev) => [{ ...opp, claimed_at: new Date().toISOString(), pending_id: genId() }, ...prev]);
    setOpportunities((prev) => prev.filter((o) => o.id !== opp.id));
  }

  // Mark pending opp as done → record income transaction
  async function markDone(pendingOpp) {
    await addTransaction({
      type: 'income',
      amount: pendingOpp.estimated_amount,
      wallet_id: wallets[0]?.id,
      category: 'freelance',
      description: `${pendingOpp.title} — ${pendingOpp.platform || 'Online'}`,
      date: todayISO(),
      currency,
    });
    setPending((prev) => prev.filter((p) => p.pending_id !== pendingOpp.pending_id));
  }

  // Book activity spend
  async function confirmBooking() {
    if (!bookingActivity || !bookingAmount) return;
    await addTransaction({
      type: 'expense',
      amount: Number(bookingAmount),
      wallet_id: walletId,
      category: bookingActivity.category === 'food' ? 'food' : bookingActivity.category === 'outdoor' ? 'entertainment' : 'entertainment',
      description: bookingActivity.title,
      date: todayISO(),
      currency,
    });
    setBookingActivity(null);
    setBookingAmount('');
  }

  return (
    <Layout onFab={() => setShowTxn(true)}>
      <div className="page">
        {/* Header */}
        <div style={{ padding: '52px 20px 0' }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Discover ✨</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>AI-powered ideas based on your money</div>
          </div>

          {/* Floating cash card */}
          <div className="hero-card" style={{ padding: '18px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'rgba(237,242,255,0.5)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
              Floating Cash (Free to Spend)
            </div>
            <div className="font-num" style={{ fontSize: 30, fontWeight: 700, color: floating >= 0 ? 'var(--green)' : 'var(--red)', marginBottom: 12 }}>
              {formatCurrency(Math.max(0, floating), currency)}
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'rgba(237,242,255,0.4)' }}>
              <span>Total: {formatShort(totalBalance, currency)}</span>
              <span>Budgeted: −{formatShort(totalBudgeted, currency)}</span>
              {totalOwed > 0 && <span>Owed: −{formatShort(totalOwed, currency)}</span>}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <button className={`chip ${tab === 'activities' ? 'active' : ''}`} onClick={() => setTab('activities')}>🎉 Activities</button>
            <button className={`chip ${tab === 'opportunities' ? 'active' : ''}`} onClick={() => setTab('opportunities')}>💼 Earn Online</button>
            {pending.length > 0 && (
              <button className={`chip ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')} style={{ position: 'relative' }}>
                ⏳ Pending
                <span style={{ background: 'var(--green)', color: '#000', borderRadius: 100, fontSize: 10, fontWeight: 700, padding: '1px 6px', marginLeft: 4 }}>{pending.length}</span>
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: '16px 20px' }}>

          {/* ── PENDING OPPORTUNITIES ─────────────────────────────────── */}
          {tab === 'pending' && (
            <div>
              <div className="section-title" style={{ marginBottom: 12 }}>Opportunities In Progress</div>
              {pending.length === 0 ? (
                <div className="empty-state"><div className="icon">⏳</div><h3>Nothing pending</h3><p>Claim an opportunity to track it here</p></div>
              ) : pending.map((p) => (
                <PendingCard key={p.pending_id} opp={p} onMarkDone={() => markDone(p)} onCancel={() => setPending((prev) => prev.filter((x) => x.pending_id !== p.pending_id))} />
              ))}
            </div>
          )}

          {/* ── ACTIVITIES ────────────────────────────────────────────── */}
          {tab === 'activities' && (
            <div>
              {/* Bae mode toggle */}
              <button onClick={() => setDateMode(!dateMode)}
                style={{ width: '100%', padding: '12px 16px', background: dateMode ? 'rgba(236,72,153,0.1)' : 'var(--card-2)', border: `1px solid ${dateMode ? 'rgba(236,72,153,0.4)' : 'var(--border)'}`, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: 14, textAlign: 'left' }}>
                <span style={{ fontSize: 24 }}>{dateMode ? '💕' : '🧍'}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: dateMode ? '#EC4899' : 'var(--text)', fontFamily: 'Outfit' }}>
                    {dateMode ? 'Bae Mode ON 💕' : 'Solo Mode'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {dateMode ? 'Showing romantic date ideas for two' : 'Tap to switch to date mode when bae is around'}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', width: 44, height: 26, borderRadius: 13, background: dateMode ? '#EC4899' : 'var(--border)', transition: 'background 0.2s', position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: dateMode ? 21 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left 0.2s' }} />
                </div>
              </button>

              {/* Location */}
              {locationStatus === 'idle' && (
                <button onClick={getLocation}
                  style={{ width: '100%', padding: '11px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  📍 Share location for better suggestions (optional)
                </button>
              )}
              {locationStatus === 'loading' && (
                <div style={{ textAlign: 'center', padding: '10px', fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>📍 Getting your location…</div>
              )}
              {locationStatus === 'got' && (
                <div style={{ padding: '10px 14px', background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, fontSize: 13, color: 'var(--green)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  📍 Location: <strong>{location?.city}</strong>
                  <button onClick={() => setLocationStatus('idle')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>clear</button>
                </div>
              )}
              {locationStatus === 'denied' && (
                <div style={{ padding: '10px 14px', background: 'var(--red-dim)', borderRadius: 10, fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>
                  📍 Location denied — suggestions will be general
                </div>
              )}

              {/* Fetch button */}
              <button className="btn-primary" onClick={fetchActivities} disabled={loading || floating <= 0}
                style={{ marginBottom: 20, background: dateMode ? '#EC4899' : undefined }}>
                {loading ? '✨ Finding ideas…' : floating <= 0 ? 'Not enough floating cash' : dateMode ? '💕 Find Date Ideas' : '🎉 Suggest Activities'}
              </button>

              {error && (
                <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--red)', marginBottom: 16 }}>
                  ⚠ {error}
                  {error.includes('ANTHROPIC_API_KEY') && <div style={{ marginTop: 6, color: 'var(--text-3)' }}>Add ANTHROPIC_API_KEY to your Vercel environment variables.</div>}
                </div>
              )}

              {activities.length > 0 && (
                <div>
                  <div className="section-title" style={{ marginBottom: 12 }}>
                    {dateMode ? '💕 Date Ideas Near You' : '🎉 Activities Near You'}
                  </div>
                  {activities.map((a) => (
                    <ActivityCard key={a.id} item={a} currency={currency}
                      onBook={(item) => { setBookingActivity(item); setBookingAmount(item.is_free ? '0' : item.estimated_cost); }} />
                  ))}
                </div>
              )}

              {!loading && activities.length === 0 && (
                <div className="empty-state">
                  <div className="icon">{dateMode ? '💕' : '🎉'}</div>
                  <h3>{dateMode ? 'Plan a date with your budget' : 'Discover what to do today'}</h3>
                  <p>Tap the button above to get AI-powered suggestions based on your {formatShort(floating, currency)} floating cash</p>
                </div>
              )}
            </div>
          )}

          {/* ── EARN ONLINE ───────────────────────────────────────────── */}
          {tab === 'opportunities' && (
            <div>
              <div style={{ padding: '12px 14px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 12, marginBottom: 16, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                💡 AI will search the web for real, current online earning opportunities accessible from Kenya. Click "I'll do this!" to track it — mark done when paid.
              </div>

              <button className="btn-primary" onClick={fetchOpportunities} disabled={loading} style={{ marginBottom: 20, background: 'var(--blue)' }}>
                {loading ? '🔍 Searching opportunities…' : '🔍 Find Online Opportunities'}
              </button>

              {error && (
                <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--red)', marginBottom: 16 }}>
                  ⚠ {error}
                  {error.includes('ANTHROPIC_API_KEY') && <div style={{ marginTop: 6, color: 'var(--text-3)' }}>Add ANTHROPIC_API_KEY to your Vercel environment variables.</div>}
                </div>
              )}

              {opportunities.length > 0 && (
                <div>
                  <div className="section-title" style={{ marginBottom: 12 }}>💼 Online Opportunities</div>
                  {opportunities.map((o) => (
                    <OpportunityCard key={o.id} item={o} onClaim={claimOpportunity} />
                  ))}
                </div>
              )}

              {!loading && opportunities.length === 0 && (
                <div className="empty-state">
                  <div className="icon">💼</div>
                  <h3>Find ways to earn online</h3>
                  <p>AI will search the web for current freelance gigs, tasks, and income ideas you can start today</p>
                </div>
              )}

              {/* Pending summary */}
              {pending.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div className="section-title" style={{ marginBottom: 12 }}>⏳ Your Pending ({pending.length})</div>
                  {pending.map((p) => (
                    <PendingCard key={p.pending_id} opp={p} onMarkDone={() => markDone(p)} onCancel={() => setPending((prev) => prev.filter((x) => x.pending_id !== p.pending_id))} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Book activity modal */}
      {bookingActivity && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setBookingActivity(null)}>
          <div className="modal-sheet">
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
            <div className="modal-header">
              <span style={{ fontSize: 16, fontWeight: 700 }}>{bookingActivity.emoji} Record this Spend</span>
              <button className="btn-icon" onClick={() => setBookingActivity(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 4 }}>{bookingActivity.title}</div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Amount Spent</label>
                <input className="input font-num" type="number" inputMode="decimal" placeholder="0.00" value={bookingAmount} onChange={(e) => setBookingAmount(e.target.value)} style={{ fontSize: 22, fontWeight: 600 }} autoFocus />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Pay From</label>
                <select className="input" value={walletId} onChange={(e) => setWalletId(e.target.value)}>
                  {wallets.map((w) => <option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
                </select>
              </div>
              <button className="btn-primary" onClick={confirmBooking} disabled={!bookingAmount}>
                Record Expense
              </button>
            </div>
          </div>
        </div>
      )}

      {showTxn && <TransactionModal onClose={() => setShowTxn(false)} />}
    </Layout>
  );
}
