import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useApp } from '../context/AppContext';
import { signOut, getSession } from '../lib/supabase';
import JarvisWidget from './JarvisWidget';
import NestLinkCredits from './NestLinkCredits';
import SmsAutoRecorder from './SmsAutoRecorder';
import ServiceWalletWatch from './ServiceWalletWatch';
import SmsCategoryPrompt from './SmsCategoryPrompt';
import ZiidiInterest from './ZiidiInterest';
import LuxeMark from './LuxeMark';
import Icon from './Icon';
import { getVoiceChoices, getVoiceName, setVoiceName, speak } from '../lib/voice';

const NAV = [
  { href:'/', label:'Home', icon:(a) => <Icon name="home" filled={a} /> },
  { href:'/transactions', label:'Activity', icon:(a) => <Icon name="list" filled={a} /> },
  { href:'/budgets', label:'Budget', icon:(a) => <Icon name="budget" filled={a} /> },
  { href:'/meals', label:'Food', icon:(a) => <Icon name="food" filled={a} /> },
];

// Secondary pages surfaced through the "More" menu, grouped. Related pages are merged into one tile;
// inside them a tab bar (HUBS) switches between the merged pages.
const MORE_GROUPS = [
  { title: 'Money', items: [
    { href:'/goals', label:'Savings Goals', icon:'target', desc:'What you are saving for' },
    { href:'/wallets', label:'Wallets', icon:'wallet', desc:'Balances, utilities & payouts' },
    { href:'/reports', label:'Reports', icon:'chart', desc:'Spending insights' },
  ]},
  { title: 'Life', items: [
    { href:'/planner', label:'Planner', icon:'calendar', desc:'Schedule, tasks & activities' },
    { href:'/chill', label:'Chill Room', icon:'film', desc:'Your series & movies' },
    { href:'/music', label:'Music Room', icon:'music', desc:'Stream music with deep bass' },
    { href:'/health', label:'Health & Fitness', icon:'heart', desc:'Wellness & workouts' },
  ]},
  { title: 'Grow & earn', items: [
    { href:'/trading', label:'Trading', icon:'trending', desc:'Charts, paper trades & Binance wallet' },
    { href:'/discover', label:'Business', icon:'briefcase', desc:'Jobs & earning' },
    { href:'/learning', label:'Learning', icon:'learn', desc:'Courses, hackathons & startups' },
  ]},
];
const HUBS = [
  [{ href:'/wallets', label:'Wallets' }, { href:'/utilities', label:'Utilities' }],
  [{ href:'/planner', label:'Planner' }, { href:'/activities', label:'Activities' }],
  [{ href:'/health', label:'Health' }, { href:'/workout', label:'Workout' }],
  [{ href:'/learning', label:'Learning' }, { href:'/tech-hub', label:'Tech Hub' }],
];
const MORE = MORE_GROUPS.flatMap((g) => g.items);
const MORE_HREFS = [...MORE.map((m) => m.href), ...HUBS.flat().map((h) => h.href), '/binance'];
const hubFor = (path) => HUBS.find((h) => h.some((x) => x.href === path));

function HubTabs({ pathname }) {
  const hub = hubFor(pathname);
  if (!hub) return null;
  return (
    <div className="lx-seg">
      {hub.map((h) => <Link key={h.href} href={h.href} className={h.href === pathname ? 'on' : ''}>{h.label}</Link>)}
    </div>
  );
}


// ─── DESKTOP SIDEBAR (≥960px) ─────────────────────────────────────────────
// Every page in one list, grouped, with simple line icons.

const SIDE_ICON = { home: 'home', txns: 'list', wallet: 'wallet', utilities: 'zap', budget: 'budget', goal: 'target', report: 'chart', planner: 'calendar', food: 'food', workout: 'dumbbell', health: 'heart', learning: 'learn', tech: 'code', discover: 'briefcase', logout: 'logout', film: 'film', music: 'music', trending: 'trending', activity: 'activity' };
function LineIcon({ name }) {
  return <Icon name={SIDE_ICON[name] || name} size={19} />;
}

const SIDE_GROUPS = [
  { title: 'Money', items: [
    { href: '/', label: 'Dashboard', icon: 'home' },
    { href: '/transactions', label: 'Transactions', icon: 'txns' },
    { href: '/wallets', label: 'Wallets', icon: 'wallet' },
    { href: '/utilities', label: 'Utilities', icon: 'utilities' },
    { href: '/budgets', label: 'Budgets', icon: 'budget' },
    { href: '/goals', label: 'Savings Goals', icon: 'goal' },
    { href: '/reports', label: 'Reports', icon: 'report' },
  ]},
  { title: 'Life', items: [
    { href: '/planner', label: 'Planner', icon: 'planner' },
    { href: '/activities', label: 'Activities', icon: 'activity' },
    { href: '/chill', label: 'Chill Room', icon: 'film' },
    { href: '/music', label: 'Music Room', icon: 'music' },
    { href: '/meals', label: 'Food', icon: 'food' },
    { href: '/workout', label: 'Workout', icon: 'workout' },
    { href: '/health', label: 'Health', icon: 'health' },
  ]},
  { title: 'Grow', items: [
    { href: '/learning', label: 'Learning', icon: 'learning' },
    { href: '/tech-hub', label: 'Tech Hub', icon: 'tech' },
    { href: '/discover', label: 'Business', icon: 'discover' },
    { href: '/trading', label: 'Trading', icon: 'trending' },
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
        <LuxeMark size={40} animated />
        <span>
          <span className="desk-brand-name">Luxe</span>
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
        <div className="desk-quote-mark"><LuxeMark size={22} glow={false} /></div>
      </div>
    </aside>
  );
}

function TopBar({ name, isOnline, onFab, fab }) {
  return (
    <header className="desk-topbar">
      <div style={{ minWidth: 0 }}>
        <div className="desk-greet">{greeting()}{name ? `, ${name}` : ''}</div>
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

// More → Luxe voice: pick which of the phone's voices Luxe speaks with (best natural ones first) and hear it.
function VoicePicker() {
  const [list, setList] = useState([]);
  const [name, setName] = useState('');
  useEffect(() => {
    const load = () => { setList(getVoiceChoices()); setName(getVoiceName()); };
    load();
    const t = setTimeout(load, 700); // voices arrive a moment after the page opens
    return () => clearTimeout(t);
  }, []);
  if (!list.length) return null;
  const hear = () => speak('Good evening. Your accounts are in order, and this month is looking good.');
  return (
    <div className="card-2" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span className="lx-tile-ic"><Icon name="mic" size={20} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Luxe voice</div>
        <select className="input" style={{ marginTop: 6, padding: '8px 10px', fontSize: 13 }} value={name} onChange={(e) => { setVoiceName(e.target.value); setName(e.target.value); setTimeout(hear, 50); }}>
          <option value="">Best available (automatic)</option>
          {list.map((v) => <option key={v.name} value={v.name}>{v.natural ? '★ ' : ''}{v.name} · {v.lang}</option>)}
        </select>
      </div>
      <button className="btn-icon" onClick={hear} aria-label="Hear the voice">▶</button>
    </div>
  );
}


// A light haptic tick when a main control is pressed (Android): buttons, tabs, filters. Installed once.
let hapticsOn = false;
function useHaptics() {
  useEffect(() => {
    if (hapticsOn || typeof navigator === 'undefined' || !navigator.vibrate) return;
    hapticsOn = true;
    document.addEventListener('pointerdown', (e) => {
      const el = e.target.closest?.('.btn-primary, .nav-item, .chip, .lx-segbar button, .lx-seg a, .fab');
      if (el && !el.disabled) { try { navigator.vibrate(7); } catch { /* not allowed */ } }
    }, { passive: true });
  }, []);
}

// The tab bar's highlight slides from the last tab to the new one (Layout remounts on every page).
let lastNavIdx = -1;
function NavPill({ idx }) {
  const [at, setAt] = useState(lastNavIdx >= 0 ? lastNavIdx : idx);
  useEffect(() => { const t = requestAnimationFrame(() => setAt(idx)); lastNavIdx = idx; return () => cancelAnimationFrame(t); }, [idx]);
  if (idx < 0) return null;
  const n = NAV.length + 1;
  // transform, not left: slides on the compositor without re-laying out the bar
  return <span className="lx-nav-pill" style={{ left: 6, width: `calc(${100 / n}% - 12px)`, transform: `translateX(calc(${at} * (100% + 12px)))` }} />;
}

export default function Layout({ children, fab, onFab }) {
  const router = useRouter();
  const { isOnline } = useApp();
  useHaptics();
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
        <HubTabs pathname={router.pathname} />
        {children}
      </main>

      {fab !== false && (
        <button className={`fab ${onFab ? "fab-has-top" : ""}`} onClick={onFab} aria-label="Add transaction">+</button>
      )}

      <JarvisWidget />
      <NestLinkCredits />
      <SmsAutoRecorder />
      <ServiceWalletWatch />
      <SmsCategoryPrompt />
      <ZiidiInterest />

      {/* More menu sheet */}
      {moreOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setMoreOpen(false)}>
          <div className="modal-sheet">
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
            <div className="modal-header">
              <span style={{ fontSize: 16, fontWeight: 700 }}>More</span>
              <button className="btn-icon" onClick={() => setMoreOpen(false)} aria-label="Close">✕</button>
            </div>
            <div style={{ padding: '4px 16px 8px' }}>
              {MORE_GROUPS.map((g) => (
                <div key={g.title} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 2px 8px' }}>{g.title}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                    {g.items.map((m) => {
                      const hub = hubFor(m.href);
                      const active = router.pathname === m.href || (hub && hub.some((h) => h.href === router.pathname)) || (m.href === '/trading' && router.pathname === '/binance');
                      return (
                        <Link key={m.href} href={m.href} onClick={() => setMoreOpen(false)} style={{ textDecoration: 'none' }}>
                          <div className="card-2" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, borderColor: active ? 'var(--accent)' : 'var(--border)', height: '100%' }}>
                            <span className="lx-tile-ic"><Icon name={m.icon} size={20} /></span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)' }}>{m.label}</div>
                              <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.3 }}>{m.desc}</div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '0 16px 16px' }}>
              <VoicePicker />
              <button
                className="btn-ghost"
                style={{ width: '100%', color: 'var(--red)' }}
                onClick={async () => { await signOut(); router.replace('/login'); }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="bottom-nav">
        <NavPill idx={moreActive ? NAV.length : NAV.findIndex((x) => x.href === router.pathname)} />
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
          <Icon name="more" />
          More
        </button>
      </nav>
    </div>
  );
}
