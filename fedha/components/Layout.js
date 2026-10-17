import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useApp } from '../context/AppContext';
import { signOut, getSession } from '../lib/supabase';
import JarvisWidget from './JarvisWidget';

const NAV = [
  { href:'/', label:'Home', icon:(a) => (
    <svg viewBox="0 0 24 24" fill={a?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a2 2 0 100-4 2 2 0 000 4z" />
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
  { href:'/learning', label:'Learning',      emoji:'🎓', desc:'Courses & certifications' },
  { href:'/discover', label:'Discover',      emoji:'🧭', desc:'Tips & explore' },
  { href:'/health',   label:'Health',        emoji:'❤️', desc:'Wellness tracking' },
  { href:'/tech-hub', label:'Tech Hub',      emoji:'🚀', desc:'Hackathons & startups' },
];

const MORE_HREFS = MORE.map((m) => m.href);


// ─── DESKTOP SIDEBAR (≥1024px) ─────────────────────────────────────────────
// Every page in one list, grouped, with simple line icons.
const ICON_PATHS = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6',
  txns: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 7h6m-6 4h6',
  wallet: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm18 3h-5a2 2 0 000 4h5',
  budget: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  goal: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-4a5 5 0 100-10 5 5 0 000 10zm0-4a1 1 0 100-2 1 1 0 000 2z',
  report: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055zM20.488 9H15V3.512A9.025 9.025 0 0120.488 9z',
  planner: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  food: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  workout: 'M13 10V3L4 14h7v7l9-11h-7z',
  health: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  learning: 'M12 14l9-5-9-5-9 5 9 5zm0 0v6m-6-9.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5',
  tech: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  discover: 'M12 21a9 9 0 100-18 9 9 0 000 18zm3.5-12.5l-2 5-5 2 2-5 5-2z',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
};

function LineIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[name]} />
    </svg>
  );
}

const SIDE_GROUPS = [
  { title: 'Money', items: [
    { href: '/', label: 'Dashboard', icon: 'home' },
    { href: '/transactions', label: 'Transactions', icon: 'txns' },
    { href: '/wallets', label: 'Wallets', icon: 'wallet' },
    { href: '/budgets', label: 'Budgets', icon: 'budget' },
    { href: '/goals', label: 'Savings Goals', icon: 'goal' },
    { href: '/reports', label: 'Reports', icon: 'report' },
  ]},
  { title: 'Life', items: [
    { href: '/planner', label: 'Planner', icon: 'planner' },
    { href: '/meals', label: 'Food', icon: 'food' },
    { href: '/workout', label: 'Workout', icon: 'workout' },
    { href: '/health', label: 'Health', icon: 'health' },
  ]},
  { title: 'Grow', items: [
    { href: '/learning', label: 'Learning', icon: 'learning' },
    { href: '/tech-hub', label: 'Tech Hub', icon: 'tech' },
    { href: '/discover', label: 'Discover', icon: 'discover' },
  ]},
];

const QUOTES = [
  'Discipline today, results tomorrow.',
  'Small wins, every day.',
  'Pay yourself first.',
  'Build the habit, the money follows.',
  'Focus on progress, not perfection.',
  'Every shilling has a job.',
  'Done is better than perfect.',
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function displayName(session) {
  const meta = session?.user?.user_metadata || {};
  const raw = meta.full_name || meta.name || (session?.user?.email || '').split('@')[0] || '';
  const first = String(raw).split(/[\s._-]+/)[0] || '';
  return first ? first[0].toUpperCase() + first.slice(1) : '';
}

function Sidebar({ pathname }) {
  const router = useRouter();
  const quote = QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length];
  return (
    <aside className="desk-sidebar" aria-label="Main navigation">
      <Link href="/" className="desk-brand">
        <span className="desk-logo">F</span>
        <span>
          <span className="desk-brand-name">Fedha</span>
          <span className="desk-brand-tag">Better money. Bigger goals.</span>
        </span>
      </Link>
      <nav className="desk-nav">
        {SIDE_GROUPS.map((g) => (
          <div key={g.title} className="desk-nav-group">
            <div className="desk-nav-title">{g.title}</div>
            {g.items.map((it) => {
              const active = pathname === it.href || (it.href !== '/' && pathname.startsWith(it.href + '/'));
              return (
                <Link key={it.href} href={it.href} className={`desk-nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
                  <LineIcon name={it.icon} />
                  {it.label}
                </Link>
              );
            })}
          </div>
        ))}
        <button className="desk-nav-item desk-signout" onClick={async () => { await signOut(); router.replace('/login'); }}>
          <LineIcon name="logout" />
          Sign out
        </button>
      </nav>
      <div className="desk-quote">
        <div className="desk-quote-text">“{quote}”</div>
        <div className="desk-quote-mark">🌱</div>
      </div>
    </aside>
  );
}

function TopBar({ name, isOnline, onFab, fab }) {
  return (
    <header className="desk-topbar">
      <div style={{ minWidth: 0 }}>
        <div className="desk-greet">{greeting()}{name ? `, ${name}` : ''} 👋</div>
        <div className="desk-greet-sub">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Plan it, track it, grow it.
        </div>
      </div>
      <div className="desk-topbar-right">
        <span className="desk-status">
          <span className={isOnline ? 'online-dot' : 'offline-dot'} />
          {isOnline ? 'Online' : 'Offline'}
        </span>
        {fab !== false && onFab && (
          <button className="btn-primary desk-add" onClick={onFab}>+ New transaction</button>
        )}
        <div className="desk-avatar" title={name || 'You'}>{(name || 'F')[0]}</div>
      </div>
    </header>
  );
}

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
  const [name, setName] = useState('');

  useEffect(() => {
    getSession().then((s) => setName(displayName(s))).catch(() => {});
  }, []);

  const moreActive = MORE_HREFS.includes(router.pathname);

  return (
    <div className="app-shell" style={{ background:'var(--bg)', minHeight:'100vh' }}>
      <Sidebar pathname={router.pathname} />
      {!isOnline && (
        <div style={{ background:'rgba(239,68,68,0.15)', borderBottom:'1px solid rgba(239,68,68,0.3)', padding:'6px 20px', display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#EF4444', position:'fixed', top:0, left:0, right:0, zIndex:999 }}>
          <span className="offline-dot" />
          Offline — changes saved locally
        </div>
      )}

      <main className="app-main">
        <TopBar name={name} isOnline={isOnline} onFab={onFab} fab={fab} />
        {children}
      </main>

      {fab !== false && (
        <button className={`fab ${onFab ? "fab-has-top" : ""}`} onClick={onFab} aria-label="Add transaction">+</button>
      )}

      <JarvisWidget />

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
            <div style={{ padding: '0 16px 16px' }}>
              <button
                className="btn-ghost"
                style={{ width: '100%', color: 'var(--red)' }}
                onClick={async () => { await signOut(); router.replace('/login'); }}
              >
                🔒 Sign Out
              </button>
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
