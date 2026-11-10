import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { VICE, viceRelease } from '../lib/holidays';
import { formatCurrency } from '../lib/utils';

// Game Room: GTA VI without a console of your own yet. Luxe cannot stream the game itself (nobody may on a
// phone at launch, see FACTS), so this page is honest about that and useful instead: the countdown, the real
// ways in from cheapest up, a savings goal for the one you pick (it lives in Savings Goals, so every deposit's
// savings cut can feed it), cloud gaming that does run in a phone browser for other games, and where to watch.
// FACTS were checked on 10 Nov 2026; update CHECKED and the lines below when Rockstar or Xbox change them.
const CHECKED = '10 Nov 2026';
const FACTS = [
  ['Release', '19 November 2026, on PlayStation 5 and Xbox Series X|S. No PC version has been announced.'],
  ['Streaming it to a phone', 'Not possible at launch. Xbox Cloud Gaming will carry GTA VI, but only to Xbox consoles (Series X|S and the old Xbox One); phones, browsers, PCs and TVs are excluded.'],
  ['Remote Play', 'Supported on PlayStation and Xbox: once you own a console, you can play it on this phone from anywhere with good internet.'],
];
const ROUTES = [
  { key: 'xone', name: 'Second-hand Xbox One + cloud', needs: 'An old Xbox One, the game, Game Pass with cloud play, fast steady internet (20 Mbps or more).', note: 'The cheapest box that can run it, because the game streams to it. Only works where Xbox Cloud Gaming is offered: I could not confirm it is offered in Kenya, so check before buying.', check: ['Check Xbox Cloud Gaming countries', 'https://www.xbox.com/regions'] },
  { key: 'series_s', name: 'Xbox Series S', needs: 'The console and the game (digital only: it has no disc drive).', note: 'The cheapest console that runs the game itself, no streaming needed. Then Remote Play puts it on this phone.' },
  { key: 'ps5', name: 'PlayStation 5', needs: 'The console and the game.', note: 'The best-looking version. PS Remote Play then puts it on this phone.' },
];
const PLAY_NOW = [
  ['Xbox Cloud Gaming', 'https://www.xbox.com/play', 'Console games in the phone browser with Game Pass. Add it to your home screen for full screen.'],
  ['GeForce NOW', 'https://play.geforcenow.com', 'Plays PC games you own (Steam, Epic) from the cloud; has a free tier with queues.'],
  ['Amazon Luna', 'https://luna.amazon.com', 'A small library in the browser.'],
];
const GOAL = 'GTA VI setup';
const p2 = (n) => String(n).padStart(2, '0');

export default function Games() {
  const { goals = [], addGoal, currency } = useApp();
  const [now, setNow] = useState(() => Date.now());
  const [pick, setPick] = useState('series_s');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const left = viceRelease() - now;
  const out = left <= 0;
  const d = Math.floor(left / 864e5), h = Math.floor((left % 864e5) / 36e5), m = Math.floor((left % 36e5) / 6e4), s = Math.floor((left % 6e4) / 1e3);
  const goal = useMemo(() => goals.find((g) => g.name === GOAL), [goals]);
  const pct = goal && Number(goal.target) > 0 ? Math.min(100, Math.round((Number(goal.current) / Number(goal.target)) * 100)) : 0;
  const route = ROUTES.find((r) => r.key === pick);

  const start = async () => {
    const target = Number(String(price).replace(/[^\d.]/g, ''));
    if (!(target > 0) || busy) return;
    setBusy(true);
    try { await addGoal({ name: GOAL, target, icon: '🎮', color: '#FF2E88', deadline: null, notes: route.name }); } finally { setBusy(false); }
  };

  const card = { padding: 16, marginBottom: 12 };
  const label = { fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: 'var(--text-3)', textTransform: 'uppercase' };
  return (
    <Layout>
      <Head><title>Game Room · Luxe</title></Head>
      <div style={{ padding: '12px 16px 90px', maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: '4px 0 12px' }}>🎮 Game Room</h1>
        <div className="card" style={{ ...card, background: 'linear-gradient(135deg, rgba(255,46,136,.22), rgba(0,229,255,.12) 60%, rgba(20,8,40,.6))', borderColor: 'rgba(255,46,136,.4)' }}>
          <div style={label}>Grand Theft Auto VI</div>
          {out ? <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>It is out.</div> : (
            <div className="font-num" style={{ fontSize: 34, fontWeight: 900, marginTop: 6, letterSpacing: 1 }}>{d}<span style={{ fontSize: 14, fontWeight: 700 }}> d </span>{p2(h)}<span style={{ fontSize: 14, fontWeight: 700 }}> h </span>{p2(m)}<span style={{ fontSize: 14, fontWeight: 700 }}> m </span>{p2(s)}<span style={{ fontSize: 14, fontWeight: 700 }}> s</span></div>
          )}
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>{new Date(`${VICE.release}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>

        <div className="card" style={card}>
          <div style={label}>Can I play it from this phone?</div>
          <div style={{ fontSize: 15, fontWeight: 800, margin: '6px 0 8px' }}>Not on launch day without a console. After you have one, yes.</div>
          {FACTS.map(([k, v]) => <div key={k} style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6 }}><b>{k}:</b> <span style={{ color: 'var(--text-2)' }}>{v}</span></div>)}
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>Checked {CHECKED}. This can change; Rockstar and Xbox decide it.</div>
        </div>

        <div className="card" style={card}>
          <div style={label}>Your ways in, cheapest first</div>
          {ROUTES.map((r) => (
            <button key={r.key} type="button" onClick={() => setPick(r.key)} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'block', width: '100%', padding: 12, marginTop: 8, borderRadius: 12, background: 'var(--card-2)', border: `1px solid ${pick === r.key ? 'var(--accent)' : 'transparent'}` }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{pick === r.key ? '● ' : '○ '}{r.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3, lineHeight: 1.45 }}>{r.needs}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.45 }}>{r.note}</div>
              {r.check && pick === r.key && <a href={r.check[1]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: 'inline-block', marginTop: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}>{r.check[0]} ↗</a>}
            </button>
          ))}

          {goal ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b>🎮 {GOAL}</b><span className="font-num">{formatCurrency(Number(goal.current) || 0, currency)} of {formatCurrency(Number(goal.target) || 0, currency)}</span></div>
              <div style={{ height: 8, borderRadius: 5, background: 'var(--card-2)', overflow: 'hidden', marginTop: 6 }}><div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#FF2E88,#00E5FF)' }} /></div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>{pct}% there. <Link href="/goals" style={{ color: 'var(--accent)', fontWeight: 700 }}>Open Savings Goals</Link> to add to it.</div>
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45 }}>Find the real price of “{route.name}” where you would buy it (console plus the game), type it here, and Luxe starts a savings goal for it.</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input className="input" style={{ flex: 1 }} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={`Total price in ${currency || 'KES'}`} />
                <button className="btn-primary" style={{ width: 'auto', padding: '0 14px' }} disabled={busy || !(Number(String(price).replace(/[^\d.]/g, '')) > 0)} onClick={start}>Start saving</button>
              </div>
            </div>
          )}
        </div>

        <div className="card" style={card}>
          <div style={label}>Play something now on this phone</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '6px 0 4px', lineHeight: 1.45 }}>Cloud gaming that runs in the phone browser (a Bluetooth controller helps a lot). GTA VI is not on any of them for phones. Each service chooses its own countries, so open it to see whether it works here.</div>
          {PLAY_NOW.map(([name, url, why]) => (
            <a key={name} href={url} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '10px 12px', marginTop: 8, borderRadius: 12, background: 'var(--card-2)', color: 'var(--text)', textDecoration: 'none' }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{name} ↗</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>{why}</div>
            </a>
          ))}
        </div>

        <div className="card" style={card}>
          <div style={label}>Watch it meanwhile</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <a className="btn-ghost" style={{ width: 'auto', padding: '8px 12px', textDecoration: 'none' }} href="https://www.youtube.com/results?search_query=GTA+6+gameplay&sp=EgJAAQ%253D%253D" target="_blank" rel="noreferrer">🔴 Live on YouTube</a>
            <a className="btn-ghost" style={{ width: 'auto', padding: '8px 12px', textDecoration: 'none' }} href="https://www.twitch.tv/directory/category/grand-theft-auto-vi" target="_blank" rel="noreferrer">Twitch</a>
            <a className="btn-ghost" style={{ width: 'auto', padding: '8px 12px', textDecoration: 'none' }} href="https://www.rockstargames.com/VI" target="_blank" rel="noreferrer">Rockstar’s page</a>
          </div>
        </div>
      </div>
    </Layout>
  );
}
