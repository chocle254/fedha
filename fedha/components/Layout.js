import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useApp } from '../context/AppContext';

const NAV = [
  { href:'/', label:'Home', icon:(a) => (
    <svg viewBox="0 0 24 24" fill={a?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )},
  { href:'/transactions', label:'Txns', icon:(a) => (
    <svg viewBox="0 0 24 24" fill={a?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )},
  { href:'/budgets', label:'Budget', icon:(a) => (
    <svg viewBox="0 0 24 24" fill={a?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )},
  { href:'/meals', label:'Food', icon:(a) => (
    <svg viewBox="0 0 24 24" fill={a?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )},
];

// Secondary pages surfaced through the "More" menu
const MORE = [
  { href:'/goals',    label:'Savings Goals', emoji:'🎯', desc:'What you are saving for' },
  { href:'/wallets',  label:'Wallets',       emoji:'👛', desc:'Accounts & balances' },
  { href:'/reports',  label:'Reports',       emoji:'📊', desc:'Spending insights' },
  { href:'/workout',  label:'Workout',       emoji:'💪', desc:'Training log' },
  { href:'/planner',  label:'Planner',       emoji:'📅', desc:'Schedule & tasks' },
  { href:'/discover', label:'Discover',      emoji:'🧭', desc:'Tips & explore' },
  { href:'/health',   label:'Health',        emoji:'❤️', desc:'Wellness tracking' },
  { href:'/beauty',   label:'Beauty',        emoji:'💆', desc:'Skin, teeth & hair care' },
  { href:'/tech-hub', label:'Tech Hub',      emoji:'🚀', desc:'Hackathons & startups' },
];

const MORE_HREFS = MORE.map((m) => m.href);

function MoreIcon(a) {
  return (
    <svg viewBox="0 0 24 24" fill={a?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

export default function Layout({ children, fab, onFab }) {
  const router = useRouter();
  const { isOnline } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive = MORE_HREFS.includes(router.pathname);

  return (
    <div style={{ background:'var(--bg)', minHeight:'100vh' }}>
      {!isOnline && (
        <div style={{ background:'rgba(239,68,68,0.15)', borderBottom:'1px solid rgba(239,68,68,0.3)', padding:'6px 20px', display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#EF4444', position:'fixed', top:0, left:0, right:0, zIndex:999 }}>
          <span className="offline-dot" />
          Offline — changes saved locally
        </div>
      )}

      <main>{children}</main>

      {fab !== false && (
        <button className="fab" onClick={onFab} aria-label="Add transaction">+</button>
      )}

      {/* More menu sheet */}
      {moreOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setMoreOpen(false)}>
          <div className="modal-sheet">
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
            <div className="modal-header">
              <span style={{ fontSize: 16, fontWeight: 700 }}>More</span>
              <button className="btn-icon" onClick={() => setMoreOpen(false)} aria-label="Close">✕</button>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {MORE.map((m) => {
                const active = router.pathname === m.href;
                return (
                  <Link key={m.href} href={m.href} onClick={() => setMoreOpen(false)} style={{ textDecoration: 'none' }}>
                    <div className="card-2" style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 8, borderColor: active ? 'var(--green)' : 'var(--border)' }}>
                      <span style={{ fontSize: 26 }}>{m.emoji}</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: active ? 'var(--green)' : 'var(--text)' }}>{m.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{m.desc}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="bottom-nav">
        {NAV.map(({ href, label, icon }) => {
          const active = router.pathname === href;
          return (
            <Link key={href} href={href} className={`nav-item ${active?'active':''}`}>
              {icon(active)}
              {label}
            </Link>
          );
        })}
        <button
          className={`nav-item ${moreActive ? 'active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-label="More pages"
        >
          {MoreIcon(moreActive)}
          More
        </button>
      </nav>
    </div>
  );
}
