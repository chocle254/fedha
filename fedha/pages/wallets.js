import { useEffect, useState } from 'react';
import { pocketsOf, enableZiidi, move, getUnlocks, requestUnlock, cancelUnlock, walletSplit, releaseDueUnlocks, UNLOCK_HOURS } from '../lib/ziidi';
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
  const [phoneNumber, setPhoneNumber] = useState(initial?.phone_number || '');

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
          {type === 'mobile' && <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Mobile Money Number</label>
            <input className="input" type="tel" inputMode="tel" placeholder="07XXXXXXXX or 2547XXXXXXXX" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required />
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>Used for UpesiPay top-ups from this wallet.</div>
          </div>}
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
          <button className="btn-primary" onClick={() => onSave({ ...initial, name, type, phone_number: type === 'mobile' ? phoneNumber.trim() : '', balance: Number(balance), color, icon, currency, id: initial?.id || genId(), created_at: initial?.created_at || todayISO() })}>
            {initial ? 'Save Changes' : 'Add Wallet'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Value for a datetime-local input, in local time.
const localInput = (d = new Date()) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); };
const releaseLabel = (startedLocal) => {
  const t = new Date(startedLocal).getTime();
  if (!Number.isFinite(t)) return '';
  const r = new Date(t + UNLOCK_HOURS * 3600e3);
  return r <= new Date() ? 'already finished, so it moves to Ziidi straight away' : `lands in Ziidi ${r.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
};

function timeLeft(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'releasing now';
  const h = Math.floor(ms / 3600e3);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : `${h}h ${Math.floor((ms % 3600e3) / 60e3)}m left`;
}

const MOVES = {
  push: { title: 'Push to Ziidi', from: 'mpesa', to: 'ziidi', verb: 'Move', desc: 'M-Pesa → Ziidi. Earns interest and is still withdrawable any time.' },
  lock: { title: 'Lock for savings', from: 'ziidi', to: 'locked', verb: 'Lock', desc: `Ziidi → Ziidi Locked. Taking it out later needs a ${UNLOCK_HOURS}-hour unlock.` },
  unlock: { title: 'Unlock', from: 'locked', to: 'ziidi', verb: 'Start unlock', desc: `Starts the ${UNLOCK_HOURS}-hour wait. The money moves to Ziidi by itself when it's done.` },
  withdraw: { title: 'Withdraw to M-Pesa', from: 'ziidi', to: 'mpesa', verb: 'Withdraw', desc: 'Ziidi → M-Pesa balance, ready to spend.' },
};

function MoveModal({ kind, pockets, available, currency, onDone, onClose }) {
  const m = MOVES[kind];
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [earlier, setEarlier] = useState(false);
  const [startedAt, setStartedAt] = useState(localInput());
  const max = Math.max(0, available);
  async function go() {
    const a = Number(amount);
    if (!(a > 0)) { setErr('Enter an amount.'); return; }
    if (a > max + 1e-9) { setErr(`Only ${formatCurrency(max, currency)} available.`); return; }
    setBusy(true);
    if (kind === 'unlock' && earlier && !(new Date(startedAt).getTime() <= Date.now())) { setErr('The start time must be in the past.'); return; }
    try { await onDone(a, kind === 'unlock' && earlier ? new Date(startedAt).toISOString() : null); } catch (e) { setErr(e.message || 'Could not move the money.'); setBusy(false); }
  }
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>{m.title}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{m.desc}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Available: <b className="font-num" style={{ color: 'var(--text)' }}>{formatCurrency(max, currency)}</b></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input font-num" type="number" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            <button className="btn-ghost" onClick={() => setAmount(String(Math.floor(max * 100) / 100))}>All</button>
          </div>
          {kind === 'unlock' && (
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
                <input type="checkbox" checked={earlier} onChange={(e) => setEarlier(e.target.checked)} /> I already started this unlock in the M-Pesa app
              </label>
              {earlier && (
                <div style={{ marginTop: 8 }}>
                  <input className="input" type="datetime-local" max={localInput()} value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>Started {startedAt ? new Date(startedAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}: {releaseLabel(startedAt)}.</div>
                </div>
              )}
            </div>
          )}
          {err && <div style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div>}
          <button className="btn-primary" disabled={busy} onClick={go}>{busy ? '…' : kind === 'unlock' && earlier ? 'Add unlock' : m.verb}</button>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Do the same move in the M-Pesa app too. This keeps Fedha's balances matching your phone.</div>
        </div>
      </div>
    </div>
  );
}

function SetupZiidiModal({ wallet, currency, onSave, onClose }) {
  const [ziidi, setZiidi] = useState('');
  const [locked, setLocked] = useState('');
  const [wasCounted, setWasCounted] = useState(false);
  const [unlocking, setUnlocking] = useState('');
  const [unlockStart, setUnlockStart] = useState(localInput());
  const total = (Number(ziidi) || 0) + (Number(locked) || 0); // unlocking money was in Locked, never in M-Pesa
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>Add Ziidi to {wallet.name}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>Open Ziidi in your M-Pesa app and copy the two balances here.</div>
          <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Ziidi balance (not locked)
            <input className="input font-num" type="number" inputMode="decimal" placeholder="0" value={ziidi} onChange={(e) => setZiidi(e.target.value)} style={{ marginTop: 6 }} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Locked funds 🔒
            <input className="input font-num" type="number" inputMode="decimal" placeholder="0" value={locked} onChange={(e) => setLocked(e.target.value)} style={{ marginTop: 6 }} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Unlocking right now ⏳ (already left Locked, not yet in Ziidi)
            <input className="input font-num" type="number" inputMode="decimal" placeholder="0" value={unlocking} onChange={(e) => setUnlocking(e.target.value)} style={{ marginTop: 6 }} />
          </label>
          {Number(unlocking) > 0 && (
            <label style={{ fontSize: 12, color: 'var(--text-3)' }}>When you started that unlock
              <input className="input" type="datetime-local" max={localInput()} value={unlockStart} onChange={(e) => setUnlockStart(e.target.value)} style={{ marginTop: 6 }} />
              <div style={{ marginTop: 6 }}>{releaseLabel(unlockStart)}.</div>
            </label>
          )}
          {total > 0 && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
              <input type="checkbox" checked={wasCounted} onChange={(e) => setWasCounted(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Only tick this if {wallet.name}&apos;s balance in Fedha ({formatCurrency(wallet.balance, currency)}) already includes this {formatCurrency(total, currency)} of Ziidi money. Fedha will then take it out of {wallet.name}. If {wallet.name} matches your M-Pesa balance, leave it unticked.</span>
            </label>
          )}
          <button className="btn-primary" onClick={() => onSave({ ziidi: Number(ziidi) || 0, locked: Number(locked) || 0, unlocking: Number(unlocking) || 0, unlockStart: new Date(unlockStart).toISOString(), wasCounted: wasCounted && total > 0 })}>Add Ziidi</button>
        </div>
      </div>
    </div>
  );
}

// Set the three balances to exactly what the M-Pesa app shows (a correction, not a transaction).
function EditBalancesModal({ wallet, pockets, unlocking, currency, onSave, onClose }) {
  const [mpesa, setMpesa] = useState(String(Number(wallet.balance) || 0));
  const [ziidi, setZiidi] = useState(String(Number(pockets.ziidi?.balance) || 0));
  const [locked, setLocked] = useState(String(Math.max(0, (Number(pockets.locked?.balance) || 0) - unlocking)));
  const [busy, setBusy] = useState(false);
  const field = (label, value, set, hint) => (
    <label style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}
      <input className="input font-num" type="number" inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} style={{ marginTop: 6 }} />
      {hint && <div style={{ fontSize: 11, marginTop: 4 }}>{hint}</div>}
    </label>
  );
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>Edit {wallet.name} balances</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>Type exactly what the M-Pesa app shows. This corrects the numbers without adding transactions.</div>
          {field('📱 M-Pesa balance', mpesa, setMpesa)}
          {field('📈 Ziidi balance', ziidi, setZiidi)}
          {field('🔒 Locked funds', locked, setLocked, unlocking > 0 ? `Money that's unlocking (${formatCurrency(unlocking, currency)}) is kept separately. Change or cancel it under the wallet.` : null)}
          <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); await onSave({ mpesa: Number(mpesa) || 0, ziidi: Number(ziidi) || 0, locked: (Number(locked) || 0) + unlocking }); }}>{busy ? '…' : 'Save balances'}</button>
        </div>
      </div>
    </div>
  );
}

function ZiidiPanel({ wallet, pockets, unlocks, currency, onMove, onCancelUnlock, onEdit }) {
  const mine = unlocks.filter((u) => u.parent_id === wallet.id);
  const unlocking = Math.min(mine.reduce((s, u) => s + Number(u.amount), 0), Number(pockets.locked?.balance) || 0);
  const lockedFree = (Number(pockets.locked?.balance) || 0) - unlocking;
  const tile = (label, value, color, sub) => (
    <div style={{ flex: 1, minWidth: 0, padding: '10px 12px', background: 'var(--card-2)', borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{label}</div>
      <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color, marginTop: 2 }}>{formatCurrency(value, currency)}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const act = (k, label, disabled) => (
    <button key={k} onClick={() => onMove(k)} disabled={disabled} style={{ flex: 1, padding: '9px 4px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, color: disabled ? 'var(--text-3)' : 'var(--text)', fontSize: 12, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', fontFamily: 'Outfit', opacity: disabled ? 0.5 : 1 }}>{label}</button>
  );
  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {tile('📱 M-Pesa', wallet.balance, 'var(--text)', 'spend from here')}
        {tile('📈 Ziidi', pockets.ziidi?.balance, '#10B981', 'withdraw any time')}
        {tile('🔒 Locked', lockedFree, '#F59E0B', unlocking > 0 ? `+ ${formatCurrency(unlocking, currency)} unlocking` : 'savings')}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        {act('push', '→ Ziidi', !(Number(wallet.balance) > 0))}
        {act('lock', '🔒 Lock', !(Number(pockets.ziidi?.balance) > 0))}
        {act('unlock', '🔓 Unlock', !(lockedFree > 0))}
        {act('withdraw', '← M-Pesa', !(Number(pockets.ziidi?.balance) > 0))}
      </div>
      <button onClick={() => onEdit(unlocking)} style={{ marginTop: 8, background: 'none', border: 0, padding: 0, color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit' }}>✏️ Edit balances to match the M-Pesa app</button>
      {mine.map((u) => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: 12 }}>
          <span>⏳</span>
          <span style={{ flex: 1 }}><b className="font-num">{formatCurrency(u.amount, currency)}</b> unlocking · {timeLeft(u.release_at)} · lands in Ziidi {new Date(u.release_at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          <button onClick={() => onCancelUnlock(u.id)} style={{ background: 'none', border: 0, color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
        </div>
      ))}
    </div>
  );
}

export default function WalletsPage() {
  const { wallets, transactions, addWallet, updateWallet, removeWallet, currency } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [editWallet, setEditWallet] = useState(null);
  const [showTxn, setShowTxn] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const { addTransaction } = useApp();
  const [unlocks, setUnlocks] = useState([]);
  const [moving, setMoving] = useState(null); // { wallet, kind }
  const [settingUp, setSettingUp] = useState(null);
  const [editing, setEditing] = useState(null); // { wallet, pockets, unlocking }
  async function saveBalances({ mpesa, ziidi, locked }) {
    const { wallet: w, pockets } = editing;
    await updateWallet({ ...w, balance: mpesa });
    if (pockets.ziidi) await updateWallet({ ...pockets.ziidi, balance: ziidi });
    if (pockets.locked) await updateWallet({ ...pockets.locked, balance: locked });
    setEditing(null);
  }
  useEffect(() => { getUnlocks().then(setUnlocks); }, [wallets]);

  const pocketWallet = (w, which) => (which === 'mpesa' ? w : pocketsOf(wallets, w.id)[which === 'locked' ? 'locked' : 'ziidi']);
  function availableFor(w, kind) {
    const src = pocketWallet(w, MOVES[kind].from);
    let a = Number(src?.balance) || 0;
    if (kind === 'unlock') a -= unlocks.filter((u) => u.parent_id === w.id).reduce((s, u) => s + Number(u.amount), 0);
    return a;
  }
  async function doMove(amount, startedAt = null) {
    const { wallet: w, kind } = moving;
    if (kind === 'unlock') {
      await requestUnlock(w.id, amount, startedAt);
      await releaseDueUnlocks(wallets, addTransaction); // an unlock started 72+ h ago lands in Ziidi right away
      setUnlocks(await getUnlocks());
    } else {
      const m = MOVES[kind];
      await move(addTransaction, { from: pocketWallet(w, m.from), to: pocketWallet(w, m.to), amount, description: m.title });
    }
    setMoving(null);
  }
  // Money already unlocking sits in Locked (Fedha counts it there until it lands) with its real start time.
  async function setupZiidi({ ziidi, locked, unlocking, unlockStart, wasCounted }) {
    const w = settingUp;
    const pockets = await enableZiidi(w, { ziidi, locked: locked + unlocking }, addWallet);
    if (wasCounted) await updateWallet({ ...w, balance: (Number(w.balance) || 0) - ziidi - locked });
    if (unlocking > 0) {
      await requestUnlock(w.id, unlocking, unlockStart);
      await releaseDueUnlocks([...wallets, pockets.ziidi, pockets.locked], addTransaction);
    }
    setUnlocks(await getUnlocks());
    setSettingUp(null);
  }

  async function handleSave(data) {
    if (editWallet) { await updateWallet(data); setEditWallet(null); }
    else { await addWallet(data); setShowAdd(false); }
  }

  const totalBalance = wallets.reduce((s, w) => s + Number(w.balance || 0), 0);
  const split = walletSplit(wallets, unlocks);
  const hasAnyZiidi = wallets.some((w) => w.pocket);
  // Pockets are shown inside their M-Pesa wallet, not as wallets of their own.
  const topWallets = wallets.filter((w) => !w.pocket || !wallets.some((p) => p.id === w.parent_id));

  return (
    <Layout onFab={() => setShowTxn(true)}>
      <div className="page">
        <div className="page-header">
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Wallets</h1>
          <div className="font-num" style={{ fontSize: 14, color: 'var(--text-3)' }}>Total: {formatCurrency(totalBalance, currency)}</div>
          {hasAnyZiidi && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginTop: 12 }}>
              {[['Ready to spend', split.spendable, 'var(--text)', 'M-Pesa, cash, bank'], ['In Ziidi', split.ziidi, '#10B981', 'withdraw any time'], ['Locked savings', split.locked, '#F59E0B', `needs ${UNLOCK_HOURS}h to unlock`], ...(split.unlocking > 0 ? [['Unlocking', split.unlocking, '#F59E0B', 'on the way to Ziidi']] : [])].map(([l, v, c, sub]) => (
                <div key={l} className="card" style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{l}</div>
                  <div className="font-num" style={{ fontSize: 16, fontWeight: 700, color: c, marginTop: 2 }}>{formatCurrency(v, currency)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {topWallets.map((w) => {
            const pockets = pocketsOf(wallets, w.id);
            const ids = [w.id, pockets.ziidi?.id, pockets.locked?.id].filter(Boolean);
            const txns = transactions.filter((t) => ids.includes(t.wallet_id) || ids.includes(t.to_wallet_id));
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
                    <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'capitalize' }}>{w.type}{pockets.ziidi ? ` · with Ziidi · total ${formatCurrency(Number(w.balance) + Number(pockets.ziidi.balance || 0) + Number(pockets.locked?.balance || 0), w.currency || currency)}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="font-num" style={{ fontSize: 20, fontWeight: 700, color: Number(w.balance) >= 0 ? w.color : 'var(--red)' }}>
                      {formatCurrency(w.balance, w.currency || currency)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{w.currency || currency}</div>
                  </div>
                </div>

                {pockets.ziidi && (
                  <ZiidiPanel wallet={w} pockets={pockets} unlocks={unlocks} currency={w.currency || currency}
                    onMove={(kind) => setMoving({ wallet: w, kind })}
                    onEdit={(unlocking) => setEditing({ wallet: w, pockets, unlocking })}
                    onCancelUnlock={async (id) => { await cancelUnlock(id); setUnlocks(await getUnlocks()); }} />
                )}
                {!pockets.ziidi && w.type === 'mobile' && !w.pocket && (
                  <button onClick={() => setSettingUp(w)} style={{ width: '100%', padding: '10px 16px', background: 'transparent', border: 0, borderTop: '1px solid var(--border)', color: 'var(--green)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit', textAlign: 'left' }}>
                    📈 Add Ziidi & locked savings to this wallet
                  </button>
                )}

                {/* Recent txns */}
                {recent.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {recent.map((tx, i) => {
                      const cat = getCategoryById(tx.category);
                      const isIncoming = tx.to_wallet_id === w.id || (tx.type !== 'transfer' && tx.type === 'income');
                      const internal = tx.type === 'transfer' && ids.includes(tx.wallet_id) && ids.includes(tx.to_wallet_id);
                      return (
                        <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: i < recent.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <span style={{ fontSize: 16 }}>{tx.type === 'transfer' ? '⇄' : cat.icon}</span>
                          <div style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tx.description || (tx.type === 'transfer' ? 'Transfer' : cat.label)}
                          </div>
                          <div className="font-num" style={{ fontSize: 13, fontWeight: 600, flexShrink: 0, color: internal ? 'var(--text-3)' : (tx.type === 'income' || isIncoming) ? 'var(--green)' : 'var(--red)' }}>
                            {internal ? '⇄ ' : (tx.type === 'income' || isIncoming) ? '+' : '-'}{formatCurrency(tx.amount, currency)}
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
                  <button onClick={() => (() => {
                    // Transactions point at their wallet; the database refuses to delete a
                    // wallet that still has any, so say so instead of half-deleting it.
                    const used = transactions.filter((t) => t.wallet_id === w.id || t.to_wallet_id === w.id).length;
                    if (used) { window.alert(`"${w.name}" still has ${used} transaction${used === 1 ? '' : 's'}. Delete or move them first, then remove the wallet.`); return; }
                    if (window.confirm(`Delete wallet "${w.name}"? This can't be undone.`)) removeWallet(w.id);
                  })()} style={{ flex: 1, padding: '10px', background: 'transparent', border: 'none', color: 'var(--red)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit', opacity: 0.7 }}>
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
      {moving && <MoveModal kind={moving.kind} available={availableFor(moving.wallet, moving.kind)} currency={moving.wallet.currency || currency} onDone={doMove} onClose={() => setMoving(null)} />}
      {editing && <EditBalancesModal wallet={editing.wallet} pockets={editing.pockets} unlocking={editing.unlocking} currency={editing.wallet.currency || currency} onSave={saveBalances} onClose={() => setEditing(null)} />}
      {settingUp && <SetupZiidiModal wallet={settingUp} currency={settingUp.currency || currency} onSave={setupZiidi} onClose={() => setSettingUp(null)} />}
    </Layout>
  );
}
