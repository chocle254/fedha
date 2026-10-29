import { useEffect, useState } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import { useMusic, SOUND_LABEL } from '../context/MusicContext';
import { GENRES, trending, search } from '../lib/audius';

// Music Room: stream full tracks from Audius (free, open, no account needed), with the deep-bass sound modes.
// Now playing on top (big art, controls), then genres (bass-heavy first), search, your likes. The player itself
// lives in context/MusicContext.js so music keeps playing on other pages (mini player there).
const fmt = (s) => { const m = Math.floor((s || 0) / 60); const r = Math.floor((s || 0) % 60); return `${m}:${String(r).padStart(2, '0')}`; };

export default function Music() {
  const m = useMusic();
  const [genre, setGenre] = useState(GENRES[2]); // Trap first: the bass
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [view, setView] = useState('browse'); // browse | likes

  const loadGenre = async (g) => {
    setGenre(g); setView('browse'); setList(null); setErr('');
    try { setList(g[2] === 'search' ? await search(g[0]) : await trending(g[0])); } catch { setErr("Couldn't reach Audius. Check the connection and try again."); setList([]); }
  };
  useEffect(() => { loadGenre(GENRES[2]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const doSearch = async (e) => {
    e.preventDefault(); if (!q.trim()) return;
    setView('browse'); setList(null); setErr(''); setGenre(['', `“${q.trim()}”`]);
    try { setList(await search(q)); } catch { setErr("Couldn't search right now."); setList([]); }
  };

  const shown = view === 'likes' ? m.likes : list || [];
  const t = m.track;
  const liked = t && m.likes?.some((x) => x.id === t.id);
  const modes = Object.keys(SOUND_LABEL);

  return (
    <Layout>
      <Head><title>Music Room · Luxe</title></Head>
      <div className="mr">
        <header className="mr-top">
          <h1>Music Room</h1>
          <button type="button" className="mr-chip" onClick={() => m.setSound(modes[(modes.indexOf(m.sound) + 1) % modes.length])}>{SOUND_LABEL[m.sound]}</button>
        </header>

        {t && (
          <section className="mr-now" style={{ '--art': `url("${t.artBig || t.art || ''}")` }}>
            <div className="mr-blur" />
            <div className="mr-nowIn">
              <div className="mr-cover" style={{ backgroundImage: `url("${t.artBig || t.art || ''}")` }} />
              <div className="mr-title">{t.title}</div>
              <div className="mr-artist">{t.artist}</div>
              <input className="mr-seek" type="range" min="0" max={m.time.dur || 0} step="1" value={m.time.cur || 0} onChange={(e) => m.seek(Number(e.target.value))} />
              <div className="mr-times"><span>{fmt(m.time.cur)}</span><span>{fmt(m.time.dur)}</span></div>
              <div className="mr-ctrls">
                <button type="button" className={m.shuffle ? 'on' : ''} onClick={() => m.setShuffle(!m.shuffle)} aria-label="Shuffle">🔀</button>
                <button type="button" onClick={m.prev} aria-label="Previous">⏮</button>
                <button type="button" className="mr-play" onClick={m.toggle} aria-label={m.playing ? 'Pause' : 'Play'}>{m.playing ? '❚❚' : '▶'}</button>
                <button type="button" onClick={m.next} aria-label="Next">⏭</button>
                <button type="button" className={liked ? 'on' : ''} onClick={() => m.like(t)} aria-label="Like">{liked ? '♥' : '♡'}</button>
              </div>
            </div>
          </section>
        )}

        <form className="mr-search" onSubmit={doSearch}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs, artists…" />
        </form>

        <div className="mr-genres">
          <button type="button" className={view === 'likes' ? 'on' : ''} onClick={() => setView('likes')}>♥ Liked {m.likes?.length ? `(${m.likes.length})` : ''}</button>
          {GENRES.map((g) => <button type="button" key={g[1]} className={view === 'browse' && genre[1] === g[1] ? 'on' : ''} onClick={() => loadGenre(g)}>{g[1]}</button>)}
        </div>

        <div className="mr-head">
          <h3>{view === 'likes' ? 'Your likes' : genre[1]}</h3>
          {shown.length > 0 && <button type="button" className="mr-chip" onClick={() => { m.setShuffle(true); m.playList(shown, Math.floor(Math.random() * shown.length)); }}>🔀 Shuffle all</button>}
        </div>
        {view === 'browse' && !list && <div className="mr-note">Loading…</div>}
        {err && <div className="mr-note">{err}</div>}
        {view === 'likes' && !m.likes?.length && <div className="mr-note">Tap ♡ on a song you love and it lands here.</div>}

        <div className="mr-list">
          {shown.map((x, i) => {
            const cur = t && t.id === x.id;
            return (
              <button type="button" key={x.id} className={`mr-row ${cur ? 'cur' : ''}`} onClick={() => m.playList(shown, i)}>
                <div className="mr-art" style={{ backgroundImage: x.art ? `url("${x.art}")` : undefined }}>{cur && m.playing && <i className="mr-eq"><b /><b /><b /></i>}</div>
                <div className="mr-meta"><b>{x.title}</b><small>{x.artist}{x.genre ? ` · ${x.genre}` : ''}</small></div>
                <span className="mr-dur">{fmt(x.duration)}</span>
              </button>
            );
          })}
        </div>
        <div className="mr-note">Music from Audius, an open music network: full tracks, free and legal to stream.</div>
      </div>

      <style jsx global>{`
        .mr { background: #000; color: #f5f5f7; min-height: 100vh; padding-bottom: 60px; font-family: -apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif; }
        .mr-top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: rgba(0,0,0,0.6); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
        .mr-top h1 { flex: 1; margin: 0; font-size: 21px; font-weight: 700; letter-spacing: -0.4px; white-space: nowrap; }
        .mr-chip { border: 0; border-radius: 999px; padding: 7px 12px; font-size: 12.5px; font-weight: 600; background: rgba(255,255,255,0.1); color: #f5f5f7; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .mr-now { position: relative; overflow: hidden; padding: 22px 16px 18px; }
        .mr-blur { position: absolute; inset: -40px; background: var(--art) center / cover; filter: blur(50px) saturate(1.4) brightness(0.55); }
        .mr-nowIn { position: relative; display: flex; flex-direction: column; align-items: center; }
        .mr-cover { width: min(62vw, 280px); aspect-ratio: 1; border-radius: 14px; background: #2c2c2e center / cover; box-shadow: 0 20px 50px rgba(0,0,0,0.6); }
        .mr-title { margin-top: 16px; font-size: 19px; font-weight: 700; text-align: center; max-width: 90%; }
        .mr-artist { font-size: 14px; color: rgba(255,255,255,0.7); margin-top: 2px; }
        .mr-seek { width: 100%; max-width: 420px; margin-top: 14px; accent-color: #fff; }
        .mr-times { width: 100%; max-width: 420px; display: flex; justify-content: space-between; font-size: 11.5px; color: rgba(255,255,255,0.6); }
        .mr-ctrls { display: flex; align-items: center; gap: 18px; margin-top: 8px; }
        .mr-ctrls button { all: unset; cursor: pointer; font-size: 22px; color: rgba(255,255,255,0.85); width: 40px; height: 40px; display: grid; place-items: center; }
        .mr-ctrls button.on { color: #30d158; }
        .mr-ctrls .mr-play { width: 64px; height: 64px; border-radius: 50%; background: #f5f5f7; color: #000; font-size: 22px; }
        .mr-search { padding: 14px 16px 4px; }
        .mr-search input { width: 100%; box-sizing: border-box; border: 0; border-radius: 12px; padding: 11px 14px; background: #1c1c1e; color: #f5f5f7; font-size: 15px; font-family: inherit; outline: none; }
        .mr-genres { display: flex; gap: 8px; overflow-x: auto; padding: 10px 16px; scrollbar-width: none; }
        .mr-genres::-webkit-scrollbar { display: none; }
        .mr-genres button { border: 0; border-radius: 999px; padding: 8px 14px; font-size: 13px; font-weight: 600; background: #1c1c1e; color: #d1d1d6; white-space: nowrap; cursor: pointer; font-family: inherit; }
        .mr-genres button.on { background: #f5f5f7; color: #000; }
        .mr-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; }
        .mr-head h3 { margin: 0; font-size: 19px; font-weight: 700; }
        .mr-list { padding: 0 8px; }
        .mr-row { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px; border-radius: 10px; }
        .mr-row.cur { background: rgba(255,255,255,0.06); }
        .mr-art { position: relative; width: 52px; height: 52px; border-radius: 8px; background: #2c2c2e center / cover; flex-shrink: 0; display: grid; place-items: center; }
        .mr-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .mr-meta b { font-size: 14.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mr-meta small { font-size: 12.5px; color: #8e8e93; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mr-dur { font-size: 12px; color: #8e8e93; }
        .mr-eq { display: flex; gap: 3px; align-items: flex-end; height: 18px; background: rgba(0,0,0,0.5); padding: 4px; border-radius: 6px; }
        .mr-eq b { width: 3px; background: #30d158; animation: mrEq 0.8s ease-in-out infinite; }
        .mr-eq b:nth-child(2) { animation-delay: 0.2s; } .mr-eq b:nth-child(3) { animation-delay: 0.4s; }
        @keyframes mrEq { 0%, 100% { height: 4px; } 50% { height: 16px; } }
        .mr-note { font-size: 12px; color: #636366; text-align: center; margin: 16px; }
      `}</style>
    </Layout>
  );
}
