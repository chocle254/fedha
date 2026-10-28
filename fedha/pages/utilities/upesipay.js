import React, { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '../../components/Layout';
import { getSession } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';

const panel = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, padding: 18 };
async function authHeaders() {
  const session = await getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}
function kes(value) {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 2 }).format(n) : '—';
}

export default function UpesiPayUtilitiesPage() {
  const { wallets: userWallets, addTransaction, currency: appCurrency } = useApp();
  const mobileWallets = userWallets.filter(item => item.type === 'mobile' && item.phone_number);
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const selectedMoneyWallet = mobileWallets.find(item => item.id === selectedWalletId) || null;
  const [wallet, setWallet] = useState({ configured: false, balance: null, loading: true, error: '', updatedAt: null, message: '' });
  const [amount, setAmount] = useState('100');
  const [topupBusy, setTopupBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const requestBusy = useRef(false);

  const refreshBalance = useCallback(async (quiet = false) => {
    if (requestBusy.current) return;
    requestBusy.current = true;
    if (!quiet) setWallet(current => ({ ...current, loading: true, error: '' }));
    try {
      const response = await fetch('/api/utilities/upesipay-balance', { headers: await authHeaders(), cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || ('Server error ' + response.status));
      setWallet({
        configured: Boolean(result.configured),
        balance: result.serviceWalletBalance ?? null,
        loading: false,
        error: '',
        updatedAt: result.checkedAt ? new Date(result.checkedAt) : null,
        message: result.message || ''
      });
    } catch (error) {
      setWallet(current => ({ ...current, loading: false, error: error.message || 'Could not connect to UpesiPay.' }));
    } finally {
      requestBusy.current = false;
    }
  }, []);

  useEffect(() => {
    refreshBalance();
    const poll = () => {
      if (document.visibilityState === 'visible') refreshBalance(true);
    };
    const timer = setInterval(poll, 3000);
    document.addEventListener('visibilitychange', poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [refreshBalance]);

  const submitTopup = async (event) => {
    event.preventDefault();
    if (topupBusy) return;
    const numericAmount = Number(amount);
    if (!Number.isSafeInteger(numericAmount) || numericAmount < 1 || numericAmount > 100000) {
      setNotice({ type: 'error', text: 'Enter a whole-number amount between KES 1 and KES 100,000.' });
      return;
    }
    if (!selectedMoneyWallet) {
      setNotice({ type: 'error', text: 'Choose a saved Mobile Money wallet with a phone number first.' });
      return;
    }
    if (!window.confirm('Request an M-Pesa STK prompt for KES ' + numericAmount + ' using ' + selectedMoneyWallet.name + ' (' + selectedMoneyWallet.phone_number + ')? If UpesiPay accepts the request, Luxe will record this as an expense from that wallet.')) return;
    setTopupBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/utilities/upesipay-topup', {
        method: 'POST',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: numericAmount, phone_number: selectedMoneyWallet.phone_number })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || ('Server error ' + response.status));
      await addTransaction({
        id: 'upesipay_topup_' + String(result.reference || result.checkoutRequestId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_'),
        type: 'expense',
        amount: numericAmount,
        wallet_id: selectedMoneyWallet.id,
        category: 'utilities',
        description: 'UpesiPay service wallet top-up' + (result.reference ? ' (' + result.reference + ')' : ''),
        currency: selectedMoneyWallet.currency || appCurrency || 'KES',
        date: new Date().toISOString().slice(0, 10),
        skipSavingsCut: true
      });
      setNotice({ type: 'success', text: 'Top-up request ' + (result.status || 'QUEUED') + ' accepted. Luxe recorded KES ' + numericAmount + ' as an expense from ' + selectedMoneyWallet.name + ' and deducted it from that wallet balance. Check your phone and approve the M-Pesa prompt. This records the request; it does not confirm UpesiPay has credited its service wallet.' + (result.reference ? ' Reference: ' + result.reference : '') });
    } catch (error) {
      setNotice({ type: 'error', text: (error.message || 'Top-up request failed.') + ' Check your UpesiPay balance before retrying to avoid duplicate requests.' });
    } finally {
      setTopupBusy(false);
      refreshBalance();
    }
  };

  return <Layout fab={false}>
    <div className="page">
      <div className="page-header" style={{ paddingBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>Money tools</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Utilities ⚡</h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 8, maxWidth: 540 }}>Choose a provider to manage its balance separately. UpesiPay checks run every 3 seconds only while this page is open and visible.</p>
      </div>
      <div style={{ padding: '0 20px', maxWidth: 820, margin: '0 auto 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <a href="/utilities" style={{ textDecoration: 'none', textAlign: 'center', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 800, fontSize: 13 }}>↗ NestLink</a>
        <a href="/utilities/upesipay" aria-current="page" style={{ textDecoration: 'none', textAlign: 'center', padding: '12px 14px', borderRadius: 12, background: 'var(--green)', color: '#fff', fontWeight: 800, fontSize: 13 }}>◈ UpesiPay</a>
      </div>
      <div style={{ padding: '0 20px 28px', display: 'grid', gap: 14, maxWidth: 820, margin: '0 auto' }}>
        <section style={{ ...panel, background: 'linear-gradient(135deg,var(--card),var(--card-2))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>UpesiPay · service wallet</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>Service wallet balance</div>
              <div className="font-num" style={{ fontSize: 34, fontWeight: 800, marginTop: 5, letterSpacing: -1 }}>{wallet.loading && wallet.balance === null ? 'Checking…' : wallet.configured ? kes(wallet.balance) : 'Not connected'}</div>
              <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 6 }}>For service charges only. This does not display your payments or disbursement wallet balances.</div>
              {wallet.configured && wallet.balance !== null && Number(wallet.balance) <= 0 && <div role="alert" style={{ marginTop: 12, padding: 10, borderRadius: 10, border: '1px solid rgba(239,68,68,.35)', background: 'rgba(239,68,68,.07)', color: 'var(--red)', fontSize: 12, fontWeight: 700, lineHeight: 1.5 }}>Service wallet is empty — top up below to keep your services running.</div>}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: wallet.error ? 'var(--red)' : wallet.configured ? 'var(--green)' : 'var(--text-3)', background: 'var(--card)', border: '1px solid var(--border)', padding: '8px 10px', borderRadius: 999 }}>{wallet.error ? '● API error' : wallet.configured ? '● API connected' : '● Setup required'}</div>
          </div>
          {wallet.error && <div role="alert" style={{ marginTop: 12, padding: 10, borderRadius: 10, border: '1px solid rgba(239,68,68,.35)', background: 'rgba(239,68,68,.07)', color: 'var(--red)', fontSize: 12, lineHeight: 1.5 }}>{wallet.error}</div>}
          {!wallet.configured && !wallet.error && wallet.message && <div style={{ marginTop: 10, color: 'var(--text-3)', fontSize: 12 }}>{wallet.message}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{wallet.updatedAt ? 'Last checked ' + wallet.updatedAt.toLocaleTimeString() : 'Balance not verified'} · every 3 seconds while visible</span>
            <button type="button" onClick={() => refreshBalance()} disabled={wallet.loading} style={{ padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card-2)', color: 'var(--text)', fontWeight: 700 }}>{wallet.loading ? 'Checking…' : '↻ Refresh now'}</button>
          </div>
        </section>
        <section style={panel}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Top up service wallet</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 12, lineHeight: 1.6, marginTop: 5 }}>Choose one of your saved Mobile Money wallets. After UpesiPay accepts the request, Luxe records the amount as an expense from that wallet.</p>
          <form onSubmit={submitTopup} style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700 }}>Amount (KES)<input type="number" min="1" max="100000" step="1" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="e.g. 100" style={{ width: '100%', padding: '12px 13px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-2)', color: 'var(--text)', fontSize: 14 }} /></label>
              <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700 }}>Pay from wallet<select required value={selectedWalletId} onChange={event => setSelectedWalletId(event.target.value)} style={{ width: '100%', padding: '12px 13px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-2)', color: 'var(--text)', fontSize: 14 }}><option value="">Choose a Mobile Money wallet</option>{mobileWallets.map(item => <option key={item.id} value={item.id}>{item.name} · {item.phone_number} · {kes(item.balance)}</option>)}</select>{mobileWallets.length === 0 && <span style={{ color: 'var(--red)', fontWeight: 500 }}>Add or edit a wallet and set its type to Mobile Money with a phone number first.</span>}</label>
            </div>
            <button type="submit" disabled={topupBusy || !wallet.configured || !selectedMoneyWallet} style={{ padding: '13px 16px', borderRadius: 11, border: 'none', fontWeight: 800, fontSize: 14, cursor: topupBusy || !wallet.configured || !selectedMoneyWallet ? 'not-allowed' : 'pointer', color: '#fff', background: 'var(--green)', opacity: topupBusy || !wallet.configured || !selectedMoneyWallet ? 0.55 : 1 }}>{topupBusy ? 'Requesting STK prompt…' : '＋ Top Up Service Wallet'}</button>
          </form>
          {notice && <div role="status" style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid ' + (notice.type === 'error' ? 'rgba(239,68,68,.35)' : 'rgba(16,185,129,.35)'), background: notice.type === 'error' ? 'rgba(239,68,68,.07)' : 'rgba(16,185,129,.08)', color: notice.type === 'error' ? 'var(--red)' : 'var(--text)', fontSize: 12, lineHeight: 1.6 }}>{notice.text}</div>}
        </section>
        <section style={panel}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Server setup</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 12, lineHeight: 1.6, marginTop: 7 }}>These credentials must stay in Vercel Environment Variables and must never be placed in browser code.</p>
          <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>{['UPESIPAY_API_USERNAME', 'UPESIPAY_API_PASSWORD'].map(name => <div key={name} style={{ fontSize: 12 }}><span style={{ color: 'var(--green)' }}>• </span><code>{name}</code></div>)}</div>
        </section>
      </div>
    </div>
  </Layout>;
}
