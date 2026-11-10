import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { VICE, viceRelease } from '../lib/holidays';
import { formatCurrency } from '../lib/utils';
import { useMusic } from '../context/MusicContext';

// Game Room: GTA VI without a console of your own yet. Luxe cannot stream the game itself (nobody may on a
// phone at launch, see FACTS), so this page is honest about that and useful instead: the countdown, the real
// ways in from cheapest up, a savings goal for the one you pick (it lives in Savings Goals, so every deposit's
// savings cut can feed it), cloud gaming that does run in a phone browser for other games, and Live now: people
// streaming the game on YouTube and Twitch this minute, watched inside Luxe.
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
const people = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

// Live now: people streaming the game this minute on YouTube and Twitch (pages/api/games/live.js), played right
// here in Luxe. Tap a stream to watch it; it keeps playing while you scroll the list. Luxe's own music pauses.
function LiveNow() {
  const music = useMusic();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(null); // the stream playing
  const [only, setOnly] = useState('all');
  const [q, setQ] = useState('GTA 6');
  const load = async (query = q) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/games/live?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
      setData(r.ok ? await r.json() : { streams: [], missing: [], errors: { all: 'Could not load the streams.' } });
    } catch { setData({ streams: [], missing: [], errors: { all: 'You look offline.' } }); } finally { setBusy(false); }
  };
  useEffect(() => { load(); const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 5 * 60e3); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const watch = (st) => { if (music?.playing) music.toggle(); setOn(st); setTimeout(() => document.getElementById('gr-player')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };
  const host = typeof window !== 'undefined' ? window.location.hostname : 'fedha.vercel.app';
  const src = on && (on.on === 'youtube'
    ? `https://www.youtube.com/embed/${on.id}?autoplay=1&playsinline=1&rel=0`
    : `https://player.twitch.tv/?channel=${encodeURIComponent(on.id)}&parent=${host}&autoplay=true&muted=false`);
  const list = (data?.streams || []).filter((x) => only === 'all' || x.on === only);
  const missing = data?.missing || [];
  const label = { fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: 'var(--text-3)', textTransform: 'uppercase' };
  const chip = (k, text) => <button key={k} type="button" onClick={() => setOnly(k)} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 16, background: only === k ? 'var(--accent)' : 'var(--card-2)', color: only === k ? '#0b0b0f' : 'var(--text-2)' }}>{text}</button>;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ ...label, flex: 1 }}><span style={{ color: '#EF4444' }}>●</span> Live now</div>
        <button className="btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }} disabled={busy} onClick={() => load()}>{busy ? '…' : '↻ Refresh'}</button>
      </div>

      {on && (
        <div id="gr-player" style={{ marginTop: 10, scrollMarginTop: 70 }}>
          <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
            <iframe key={`${on.on}${on.id}`} src={src} title={on.title} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.35 }}>{on.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{on.who} · {on.on === 'youtube' ? 'YouTube' : 'Twitch'}</div>
            </div>
            <button className="btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }} onClick={() => setOn(null)}>Close</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <input className="input" style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(q)} placeholder="Search live streams, e.g. GTA 6 gameplay" />
        <button className="btn-primary" style={{ width: 'auto', padding: '0 14px' }} disabled={busy} onClick={() => load(q)}>Search</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>{chip('all', 'All')}{chip('youtube', 'YouTube')}{chip('twitch', 'Twitch')}</div>

      {Object.values(data?.errors || {}).map((e, i) => <div key={i} style={{ fontSize: 12.5, color: '#F59E0B', marginTop: 8 }}>⚠ {e}</div>)}
      {data && !list.length && missing.length < 2 && <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 12 }}>Nobody is live for that right now. Try another search or come back in a bit.</div>}
      {!data && <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 12 }}>Looking for streams…</div>}

      {list.map((st) => (
        <button key={`${st.on}${st.id}`} type="button" onClick={() => watch(st)} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'flex', gap: 10, width: '100%', padding: '9px 0', borderTop: '1px solid var(--border)', alignItems: 'center', opacity: on && on.id === st.id ? 0.55 : 1 }}>
          <div style={{ position: 'relative', flexShrink: 0, width: 128, height: 72, borderRadius: 8, overflow: 'hidden', background: `#111 center/cover url("${st.thumb}")` }}>
            <span style={{ position: 'absolute', left: 4, bottom: 4, fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: 'rgba(0,0,0,.75)', color: '#fff' }}><span style={{ color: '#EF4444' }}>●</span> {people(st.viewers)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{st.title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>{st.who} · <b style={{ color: st.on === 'youtube' ? '#FF4E45' : '#A970FF' }}>{st.on === 'youtube' ? 'YouTube' : 'Twitch'}</b></div>
          </div>
        </button>
      ))}

      {missing.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'var(--card-2)', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-2)' }}>
          <b style={{ color: 'var(--text)' }}>{missing.length === 2 ? 'One-time setup needed' : `${missing[0] === 'youtube' ? 'YouTube' : 'Twitch'} is not connected yet`}</b>
          <div>Luxe finds the streams through each platform's own free key. Add them in Vercel → Project → Settings → Environment Variables, then redeploy:</div>
          {missing.includes('youtube') && <div style={{ marginTop: 6 }}>• <b>YOUTUBE_API_KEY</b>: <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>enable YouTube Data API v3</a>, then Credentials → Create API key.</div>}
          {missing.includes('twitch') && <div style={{ marginTop: 6 }}>• <b>TWITCH_CLIENT_ID</b> and <b>TWITCH_CLIENT_SECRET</b>: <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>register an app on Twitch</a> (any name, redirect URL https://fedha.vercel.app, category Website Integration), then New Secret.</div>}
        </div>
      )}
    </div>
  );
}
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

        <LiveNow />

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
          <div style={label}>Or open the platforms themselves</div>
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
