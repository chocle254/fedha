import { useMemo, useState } from 'react';
import { REAL_SCALE, realScale, nextMilestone } from '../../lib/trading-core';

// The real-money MT5 account as a vault: dark and gold, the balance hidden until tapped (surprise mode: the
// owner checks less, and the only real-money alerts are the $500+ milestones), the road to the next milestone,
// the risk step for this balance, and the controls folded away so nothing gets changed by accident.
const GOLD = '#D4AF37';
const GOLD_SOFT = 'rgba(212,175,55,.14)';
const usd = (v, d = 2) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const GOALS = [100]; // the first goal: no withdrawals until $100, then the milestone alerts take over

function goalAfter(b) {
  const g = GOALS.find((x) => x > b);
  return g ?? nextMilestone(Math.max(b, 100));
}
function goalBefore(b) {
  let prev = 0;
  for (let m = GOALS[0]; m <= b; m = goalAfter(m)) prev = m;
  return prev;
}

export default function RealVault({ account, settings, trades, children }) {
  const [shown, setShown] = useState(false);
  const info = account.info;
  const cfg = account.settings || {};
  const live = !!(settings.allow_real && cfg.enabled);
  const bal = Number(info.balance) || 0;
  const eq = Number(info.equity) || 0;
  const start = Number(settings.milestones?.[account.key]?.start) || null;
  const tier = realScale(bal, cfg.risk_pct);
  const next = goalAfter(bal);
  const prev = goalBefore(bal);
  const pct = Math.max(2, Math.min(100, ((bal - prev) / Math.max(1, next - prev)) * 100));
  const realChannels = Object.entries(settings.ladder?.channels || {}).filter(([, c]) => c.stage === 'real').map(([n]) => n);

  const stats = useMemo(() => {
    const by = {};
    for (const t of trades) (by[t.signal_key] = by[t.signal_key] || []).push(t);
    const done = Object.values(by).filter((l) => l.every((x) => ['won', 'lost', 'cancelled'].includes(x.status)) && l.some((x) => ['won', 'lost'].includes(x.status)));
    const pnl = done.map((l) => l.reduce((s, x) => s + Number(x.profit || 0), 0));
    const list = Object.entries(by).map(([key, l]) => ({ key, side: l[0].side, symbol: l[0].symbol, source: l[0].source, at: l[0].created_at, live: l.some((x) => ['pending', 'open'].includes(x.status)), profit: l.reduce((s, x) => s + Number(x.profit || 0), 0) }))
      .filter((g) => g.live || by[g.key].some((x) => ['won', 'lost'].includes(x.status))).sort((a, b) => (a.at < b.at ? 1 : -1));
    return { list, signals: done.length, wins: pnl.filter((p) => p > 0).length, profit: pnl.reduce((s, p) => s + p, 0), open: list.filter((g) => g.live).length };
  }, [trades]);

  const hide = (node) => (shown ? node : <span style={{ filter: 'blur(9px)', userSelect: 'none' }}>{node}</span>);

  return (
    <div style={{ margin: '12px 14px', borderRadius: 20, padding: 1, background: `linear-gradient(140deg, ${GOLD}, rgba(212,175,55,.15) 40%, rgba(212,175,55,.05) 60%, ${GOLD})` }}>
      <style>{'@keyframes luxeVaultPulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.6)}70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}'}</style>
      <div style={{ borderRadius: 19, padding: '16px 16px 14px', background: 'radial-gradient(120% 90% at 100% 0%, rgba(212,175,55,.16), transparent 55%), linear-gradient(180deg, #0E1411, #080B09)', color: '#F5F1E6' }}>
        {/* Top line: what this is and whether it's live */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 10.5, letterSpacing: 2, fontWeight: 800, color: GOLD }}>🔒 REAL MONEY VAULT</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: live ? '#22C55E' : '#F59E0B' }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: live ? '#22C55E' : '#F59E0B', animation: live ? 'luxeVaultPulse 2s infinite' : 'none' }} />
            {live ? 'LIVE' : 'PAUSED'}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'rgba(245,241,230,.55)', marginTop: 3 }}>{account.name} · #{info.login} · {info.server} · 1:{info.leverage}</div>

        {/* Balance */}
        <button type="button" onClick={() => setShown((v) => !v)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: 0, marginTop: 16, color: 'inherit', cursor: 'pointer' }} aria-label={shown ? 'Hide balance' : 'Reveal balance'}>
          <div style={{ fontSize: 10.5, letterSpacing: 1.5, color: 'rgba(245,241,230,.5)', fontWeight: 700 }}>BALANCE</div>
          <div className="font-num" style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.1, marginTop: 2, background: `linear-gradient(180deg, #FFF6D5, ${GOLD})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            {hide(usd(bal))}
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(245,241,230,.5)', marginTop: 4 }}>
            {shown ? 'Tap to hide' : '🎁 Surprise mode: tap to peek. You get a notification at $500, then at every milestone after.'}
          </div>
        </button>

        {/* Key numbers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
          {[
            ['Equity', hide(usd(eq))],
            ['Closed profit', hide(<span style={{ color: stats.profit >= 0 ? '#22C55E' : '#EF4444' }}>{stats.profit >= 0 ? '+' : ''}{usd(stats.profit)}</span>)],
            [start ? 'Since start' : 'Signals', start ? hide(`${(bal / start).toFixed(2)}×`) : `${stats.signals}${stats.open ? ` · ${stats.open} open` : ''}`],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: '9px 10px', borderRadius: 12, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(212,175,55,.18)' }}>
              <div style={{ fontSize: 10, letterSpacing: 1, color: 'rgba(245,241,230,.5)', fontWeight: 700 }}>{k.toUpperCase()}</div>
              <div className="font-num" style={{ fontSize: 14.5, fontWeight: 800, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Road to the next milestone */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700 }}>
            <span style={{ color: 'rgba(245,241,230,.7)' }}>{next === 100 ? 'First goal: $100 (no withdrawals before it)' : `Next milestone: ${usd(next, 0)}`}</span>
            <span className="font-num" style={{ color: GOLD }}>{shown ? `${Math.round(pct)}%` : '•••'}</span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,.07)', marginTop: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: shown ? `${pct}%` : '0%', borderRadius: 99, background: `linear-gradient(90deg, #8C6B1F, ${GOLD}, #FFF1B8)`, transition: 'width .6s ease' }} />
          </div>
        </div>

        {/* Risk step for this balance */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10.5, letterSpacing: 1.5, color: 'rgba(245,241,230,.5)', fontWeight: 700 }}>RISK SCALES WITH THE BALANCE</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${REAL_SCALE.length}, 1fr)`, gap: 4, marginTop: 6 }}>
            {REAL_SCALE.map((t, i) => {
              const on = i === tier.index;
              const from = i ? REAL_SCALE[i - 1].upTo : 0;
              return (
                <div key={t.label} style={{ padding: '7px 4px', borderRadius: 10, textAlign: 'center', background: on ? GOLD_SOFT : 'rgba(255,255,255,.03)', border: `1px solid ${on ? GOLD : 'rgba(255,255,255,.06)'}` }}>
                  <div className="font-num" style={{ fontSize: 14, fontWeight: 800, color: on ? GOLD : 'rgba(245,241,230,.6)' }}>{Math.min(t.pct, Number(cfg.risk_pct) || t.pct)}%</div>
                  <div style={{ fontSize: 9.5, color: 'rgba(245,241,230,.45)', marginTop: 1 }}>{t.upTo === Infinity ? `$${from / 1000}k+` : `${from >= 1000 ? `$${from / 1000}k` : `$${from}`}–${t.upTo >= 1000 ? `$${t.upTo / 1000}k` : `$${t.upTo}`}`}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(245,241,230,.6)', marginTop: 6 }}>
            Now: {tier.pct}% a trade{shown ? `, about ${usd((bal * tier.pct) / 100)}` : ''}. The percent steps down as the account grows, so gains are protected.
          </div>
        </div>

        {/* Who may trade it */}
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', fontSize: 12, lineHeight: 1.5 }}>
          {realChannels.length
            ? <><b style={{ color: GOLD }}>{realChannels.length} channel{realChannels.length === 1 ? '' : 's'} trading:</b> {realChannels.join(', ')}</>
            : <><b style={{ color: GOLD }}>No channel has earned real money yet.</b> The bar: 10 signals since Proven, over 4+ days, +0.3R each, 80% confident.</>}
          <div style={{ color: 'rgba(245,241,230,.5)', marginTop: 4 }}>Trades here are silent. {live ? 'It runs on its own.' : 'Real trading is switched off, so nothing is placed.'}</div>
        </div>

        {/* Trade history, behind the same surprise */}
        {stats.list.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'rgba(245,241,230,.65)', listStyle: 'none' }}>📜 Trade history ({stats.list.length})</summary>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {stats.list.slice(0, 15).map((g) => (
                <div key={g.key} style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: 8, alignItems: 'center', fontSize: 12, padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,.03)' }}>
                  <b style={{ color: g.side === 'BUY' ? '#22C55E' : '#EF4444', fontSize: 11 }}>{g.side}</b>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.symbol} <span style={{ color: 'rgba(245,241,230,.45)' }}>· {g.source}</span></span>
                  <b className="font-num" style={{ color: g.live ? '#5B9BFF' : g.profit >= 0 ? '#22C55E' : '#EF4444' }}>{g.live ? 'open' : hide(`${g.profit >= 0 ? '+' : ''}${usd(g.profit)}`)}</b>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Controls, folded away */}
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'rgba(245,241,230,.65)', listStyle: 'none' }}>⚙️ Vault controls</summary>
          <div style={{ marginTop: 8, padding: '4px 0', borderRadius: 12, background: 'rgba(0,0,0,.25)' }}>{children}</div>
        </details>
      </div>
    </div>
  );
}
