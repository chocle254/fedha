import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { getUser } from '../lib/supabase';
import { startProPayment, pollPaymentStatus } from '../lib/payments';

const PRO_PERKS = [
  { icon: '☁️', text: 'Cloud sync & backup across all your devices' },
  { icon: '👛', text: 'Unlimited wallets & budgets' },
  { icon: '🏆', text: 'All savings challenges + milestone badges' },
  { icon: '🤖', text: 'AI activity & income suggestions' },
  { icon: '📲', text: 'M-Pesa SMS auto-import' },
  { icon: '📄', text: 'PDF & Excel statement export' },
];

export default function UpgradeModal({ onClose }) {
  const { currency } = useApp();
  const price = Number(process.env.NEXT_PUBLIC_PRO_PRICE_KES) || 300;
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState('intro'); // intro | sending | waiting | done | failed
  const [msg, setMsg] = useState('');

  async function pay() {
    const user = await getUser();
    if (!user) { setMsg('Please sign in first to upgrade.'); return; }
    if (!/^(?:\+?254|0)?[17]\d{8}$/.test(phone.replace(/\s/g, ''))) {
      setMsg('Enter a valid Safaricom number'); return;
    }
    try {
      setStage('sending'); setMsg('Sending payment request to your phone…');
      const reference = await startProPayment(user.id, phone, price);
      setStage('waiting'); setMsg('Check your phone and enter your M-Pesa PIN to confirm.');
      const result = await pollPaymentStatus(reference, {
        onUpdate: (s) => s === 'pending' && setMsg('Waiting for confirmation…'),
      });
      if (result === 'success') { setStage('done'); setMsg('You are now Fedha Pro! 🎉'); }
      else if (result === 'timeout') { setStage('failed'); setMsg('Timed out. If you paid, it will activate shortly.'); }
      else { setStage('failed'); setMsg('Payment was not completed. Try again.'); }
    } catch (e) { setStage('failed'); setMsg(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Upgrade to Fedha Pro</div>
          <button className="btn-icon" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ textAlign: 'center', margin: '4px 0 16px' }}>
            <span className="font-num" style={{ fontSize: 30, fontWeight: 800, color: 'var(--green)' }}>KSh {price}</span>
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}> / month</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {PRO_PERKS.map((p) => (
              <div key={p.text} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>{p.icon}</span>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{p.text}</span>
              </div>
            ))}
          </div>

          {stage === 'done' ? (
            <div style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 700, padding: '12px 0' }}>{msg}</div>
          ) : (
            <>
              <label style={{ fontSize: 12, color: 'var(--text-3)' }}>M-Pesa phone number</label>
              <input className="input" inputMode="tel" placeholder="07XX XXX XXX" value={phone}
                disabled={stage === 'sending' || stage === 'waiting'}
                onChange={(e) => setPhone(e.target.value)} style={{ marginBottom: 12 }} />
              <button className="btn-primary" style={{ width: '100%' }} onClick={pay}
                disabled={stage === 'sending' || stage === 'waiting'}>
                {stage === 'sending' || stage === 'waiting' ? 'Awaiting M-Pesa…' : `Pay KSh ${price} via M-Pesa`}
              </button>
            </>
          )}
          {msg && stage !== 'done' && (
            <div style={{ fontSize: 12, marginTop: 10, textAlign: 'center', color: stage === 'failed' ? 'var(--red, #EF4444)' : 'var(--text-3)' }}>{msg}</div>
          )}
        </div>
      </div>
    </div>
  );
}
