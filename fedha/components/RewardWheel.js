import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatShort, formatCurrency, formatDate } from '../lib/utils';
import { fireConfetti } from '../lib/confetti';
import { WHEELS, TREAT_SHARE, pickSegment, prizeAmount, getSpins, getRewardHistory, awardSpin, takeSpin, logReward } from '../lib/rewards';

const SPIN_MS = 4600;
const label = { fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 };

// Point on a circle, angle in degrees clockwise from the top.
function pt(cx, cy, r, a) { const t = (a * Math.PI) / 180; return [cx + r * Math.sin(t), cy - r * Math.cos(t)]; }

function Wheel({ wheel, jar, currency, rotation }) {
  const size = 280, c = size / 2, r = c - 6, seg = 360 / wheel.length;
  return (
    <div style={{ position: 'relative', width: size, maxWidth: '100%', margin: '0 auto' }}>
      {/* pointer */}
      <div style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', zIndex: 2, width: 0, height: 0,
        borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderTop: '22px solid var(--text)' }} />
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ display: 'block', transform: `rotate(${rotation}deg)`,
        transition: `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.7, 0.1, 1)` }}>
        {wheel.map((s, i) => {
          const a0 = i * seg, a1 = a0 + seg, mid = a0 + seg / 2;
          const [x0, y0] = pt(c, c, r, a0); const [x1, y1] = pt(c, c, r, a1);
          const amt = prizeAmount(s, jar);
          const text = s.bonus ? s.label : s.treat ? s.label : amt > 0 ? formatShort(amt, currency) : s.label;
          return (
            <g key={i}>
              <path d={`M${c},${c} L${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1} Z`} fill={s.color} stroke="var(--card)" strokeWidth="2" />
              <text x={c} y={c - r * 0.62} transform={`rotate(${mid} ${c} ${c})`} textAnchor="middle" dominantBaseline="middle"
                fill="#fff" style={{ fontSize: 12, fontWeight: 800, fontFamily: 'inherit' }}>{text}</text>
            </g>
          );
        })}
        <circle cx={c} cy={c} r={24} fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
        <text x={c} y={c} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 20 }}>🎁</text>
      </svg>
    </div>
  );
}

export default function RewardWheel() {
  const { treatJar, wallets, currency, withdrawFromGoal } = useApp();
  const jar = Number(treatJar?.current) || 0;
  const [spins, setSpins] = useState([]);
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [active, setActive] = useState(null);   // the spin being played
  const [result, setResult] = useState(null);   // { seg, amount, kind }
  const [walletId, setWalletId] = useState('');
  const [earned, setEarned] = useState(null);   // toast for a newly earned spin
  const timers = useRef([]);
  useEffect(() => { if (!walletId && wallets.length === 1) setWalletId(wallets[0].id); }, [wallets, walletId]);

  async function refresh() { setSpins(await getSpins()); setHistory(await getRewardHistory()); }
  useEffect(() => {
    refresh();
    const onRewards = (e) => {
      refresh();
      if (e.detail?.type === 'earned' && e.detail.spin?.reason !== 'Bonus spin') {
        setEarned(e.detail.spin);
        timers.current.push(setTimeout(() => setEarned(null), 3500));
      }
    };
    window.addEventListener('fedha:rewards', onRewards);
    window.addEventListener('fedha:db-changed', refresh);
    return () => {
      window.removeEventListener('fedha:rewards', onRewards);
      window.removeEventListener('fedha:db-changed', refresh);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const nextKind = spins.some((s) => s.kind === 'jackpot') ? 'jackpot' : 'normal';
  const shownKind = active?.kind || nextKind;
  const wheel = WHEELS[shownKind];

  async function spin() {
    if (spinning) return;
    const s = await takeSpin();
    if (!s) return;
    const w = WHEELS[s.kind];
    const idx = pickSegment(w);
    const seg = 360 / w.length;
    const centre = idx * seg + seg / 2;
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    const want = ((360 - centre + jitter) % 360 + 360) % 360;
    const now = ((rotation % 360) + 360) % 360;
    setActive(s);
    setResult(null);
    setSpinning(true);
    setRotation(rotation + 5 * 360 + ((want - now + 360) % 360));
    timers.current.push(setTimeout(() => {
      setSpinning(false);
      const amount = prizeAmount(w[idx], jar);
      setResult({ seg: w[idx], amount, kind: s.kind });
      if (amount > 0 || w[idx].treat) fireConfetti({ count: s.kind === 'jackpot' ? 200 : 110 });
      if (w[idx].bonus) awardSpin(s.kind, 'Bonus spin');
      if (!amount && !w[idx].bonus) logReward({ label: w[idx].label, amount: 0, treat: w[idx].treat || null, claimed: true });
    }, SPIN_MS + 100));
  }

  async function claim() {
    const { seg, amount } = result;
    try {
      await withdrawFromGoal({ amount, walletId, goalId: treatJar.id, description: `🎡 Reward: ${seg.label.replace(/^\d+%$/, 'cash prize')}` });
      await logReward({ label: seg.label, amount, treat: seg.treat || null, claimed: true });
      setResult({ ...result, claimed: true });
    } catch (e) { alert(e.message); }
  }
  async function leave() {
    await logReward({ label: result.seg.label, amount: result.amount, treat: result.seg.treat || null, claimed: false });
    setResult(null); setActive(null);
  }
  function close() {
    if (spinning) return;
    if (result && result.amount > 0 && !result.claimed) { leave(); }
    setOpen(false); setResult(null); setActive(null);
  }

  return (
    <div className="section">
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 28 }}>🎁</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Treat Jar</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{Math.round(TREAT_SHARE * 100)}% of every challenge save. Spend it when the wheel says so.</div>
          </div>
          <div className="font-num" style={{ fontSize: 18, fontWeight: 800, color: '#F59E0B' }}>{formatShort(jar, currency)}</div>
        </div>
        {spins.length > 0 ? (
          <button className="btn-primary" style={{ width: '100%' }} onClick={() => setOpen(true)}>
            🎡 Spin the wheel ({spins.length}){nextKind === 'jackpot' ? ' · 🌟 Jackpot' : ''}
          </button>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Earn spins by hitting challenge milestones. Finishing a challenge or reaching a goal earns a 🌟 jackpot spin.
          </div>
        )}
        {history.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {history.slice(0, 3).map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)' }}>
                <span>{h.label}{h.amount > 0 && !h.claimed ? ' (left in jar)' : ''}</span>
                <span>{h.amount > 0 ? formatShort(h.amount, currency) : ''} · {formatDate(h.at.slice(0, 10))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {earned && (
        <div style={{ position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)', zIndex: 10001, width: 'min(320px, calc(100vw - 32px))',
          background: 'var(--card)', border: '1px solid #F59E0B', borderRadius: 14, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)', animation: 'pop 0.3s ease' }} onClick={() => { setEarned(null); setOpen(true); }}>
          <span style={{ fontSize: 26 }}>{earned.kind === 'jackpot' ? '🌟' : '🎡'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#F59E0B' }}>{earned.kind === 'jackpot' ? 'Jackpot spin earned!' : 'Spin earned!'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{earned.reason}</div>
          </div>
        </div>
      )}

      {open && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="modal-sheet">
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
            <div className="modal-header">
              <span style={{ fontSize: 16, fontWeight: 700 }}>{shownKind === 'jackpot' ? '🌟 Jackpot wheel' : '🎡 Reward wheel'}</span>
              <button className="btn-icon" aria-label="Close" onClick={close}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
                {(active || spins.find((s) => s.kind === nextKind))?.reason ? `For: ${(active || spins.find((s) => s.kind === nextKind)).reason}` : ''}
                <div>Treat Jar: <b className="font-num">{formatCurrency(jar, currency)}</b></div>
              </div>

              <Wheel wheel={wheel} jar={jar} currency={currency} rotation={rotation} />

              {!result && (
                <button className="btn-primary" disabled={spinning || !spins.length} onClick={spin}>
                  {spinning ? 'Spinning…' : spins.length ? `SPIN (${spins.length} left)` : 'No spins left'}
                </button>
              )}

              {result && (
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {result.seg.bonus ? (
                    <>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>🎁 Bonus spin!</div>
                      <button className="btn-primary" onClick={() => { setResult(null); setActive(null); }}>Spin again</button>
                    </>
                  ) : result.amount > 0 ? (
                    <>
                      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>You won</div>
                      <div className="font-num" style={{ fontSize: 32, fontWeight: 800, color: '#F59E0B' }}>{formatCurrency(result.amount, currency)}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{result.seg.treat || 'Guilt-free. Spend it on something that makes you happy.'}</div>
                      {result.claimed ? (
                        <>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>✅ Sent to {wallets.find((w) => w.id === walletId)?.name}. Enjoy!</div>
                          {spins.length > 0 && <button className="btn-primary" onClick={() => { setResult(null); setActive(null); }}>Next spin ({spins.length})</button>}
                        </>
                      ) : (
                        <>
                          <div style={{ textAlign: 'left' }}>
                            <label style={label}>Send to</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {wallets.map((w) => (
                                <button key={w.id} className={`chip ${walletId === w.id ? 'active' : ''}`} onClick={() => setWalletId(w.id)}>{w.icon} {w.name}</button>
                              ))}
                            </div>
                          </div>
                          <button className="btn-primary" disabled={!walletId} onClick={claim}>Claim my prize</button>
                          <button className="btn-ghost" onClick={leave}>Leave it in the jar</button>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{result.seg.label}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                        {result.seg.treat || 'Your Treat Jar is empty right now. Keep saving in challenges and it fills up.'}
                      </div>
                      <button className="btn-primary" onClick={() => { setResult(null); setActive(null); if (!spins.length) setOpen(false); }}>
                        {spins.length ? `Next spin (${spins.length})` : 'Love it'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
