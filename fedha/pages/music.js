import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import { useMusic, SOUND_LABEL } from '../context/MusicContext';
import { GENRES, trending, search } from '../lib/audius';
import { searchTracks, findArtist, artistTop, related, chart } from '../lib/popular';
import { dailyMixes, releaseRadar, lyricsFor, daylistName } from '../lib/music-mixes';

// Music Room, Spotify-style.
//   Now playing: a cover-art card (swipe ← next, → previous, double-tap ♥), synced lyrics, queue, sleep timer,
//                crossfade. Popular songs play through YouTube in a tiny corner player (data saver).
//   DJ Luxe:     moods, typed requests, "switch it up", a voice between songs (pages/api/music/dj.js).
//   Made for you: daylist, Daily Mixes, Release Radar, On Repeat, Recently played, charts, your artists.
//   Every song: ⋯ → play next, add to queue, start radio, like.   Indie tab: Audius with the bass modes.
const fmt = (s) => { const m = Math.floor((s || 0) / 60); const r = Math.floor((s || 0) % 60); return `${m}:${String(r).padStart(2, '0')}`; };
const MOODS = [['hype', '🔥 Hype'], ['late night', '🌙 Late night'], ['gym', '🏋️ Gym'], ['chill', '🧊 Chill'], ['throwback', '⏪ Throwback'], ['party', '🎉 Party'], ['heartbreak', '💔 Heartbreak'], ['focus', '🎯 Focus']];
const bgi = (u) => (u ? { backgroundImage: `url("${u}")` } : undefined);

function Row({ title, items, onPlay, sub }) {
  if (!items?.length) return null;
  return (
    <section className="mr-sec">
      <h3>{title}</h3>
      <div className="mr-hscroll">
        {items.map((x, i) => (
          <button type="button" key={`${x.id}${i}`} className="mr-tile" onClick={() => onPlay(i)}>
            <div className="mr-tileArt" style={bgi(x.art)} />
            <b>{x.title}</b><small>{sub ? sub(x) : x.artist}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Music() {
  const m = useMusic();
  const [tab, setTab] = useState('popular');
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null); // { title, list }
  const [err, setErr] = useState('');
  const [home, setHome] = useState({ charts: null, mixes: [], radar: [], artists: [] });
  const [indie, setIndie] = useState({ genre: GENRES[2], list: null });
  const [menu, setMenu] = useState(null); // track for the ⋯ sheet
  const [sheet, setSheet] = useState(null); // 'queue' | 'sleep' | 'fade'
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState(null);
  const [req, setReq] = useState('');
  const swipe = useRef(null);
  const lastTap = useRef(0);
  const lyricBox = useRef(null);
  const t = m.track;
  const liked = t && m.likes?.some((x) => x.id === t.id);
  const top = (m.topArtists?.() || []);
  const modes = Object.keys(SOUND_LABEL);

  // Made for you.
  useEffect(() => {
    (async () => {
      const names = top.length ? top : ['Lil Wayne'];
      chart().then((c) => setHome((h) => ({ ...h, charts: c }))).catch(() => setHome((h) => ({ ...h, charts: [] })));
      dailyMixes(names).then((mixes) => setHome((h) => ({ ...h, mixes }))).catch(() => {});
      releaseRadar(names).then((radar) => setHome((h) => ({ ...h, radar }))).catch(() => {});
      try {
        const mine = (await Promise.all(names.slice(0, 3).map(findArtist))).filter(Boolean);
        const circle = mine[0] ? await related(mine[0].id, 10) : [];
        setHome((h) => ({ ...h, artists: [...mine, ...circle.filter((c) => !mine.some((x) => x.id === c.id))].slice(0, 12) }));
      } catch { /* chips are a bonus */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onRepeat = useMemo(() => Object.values(m.tracksPlayed || {}).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 20).map((x) => x.t), [m.tracksPlayed]);
  const recently = useMemo(() => Object.values(m.tracksPlayed || {}).sort((a, b) => b.last - a.last).slice(0, 20).map((x) => x.t), [m.tracksPlayed]);

  // Lyrics follow the song.
  useEffect(() => { setLyrics(null); if (t && showLyrics) lyricsFor(t).then((l) => setLyrics(l || [])); }, [t?.id, showLyrics]); // eslint-disable-line react-hooks/exhaustive-deps
  const curLine = lyrics && lyrics[0]?.at != null ? lyrics.reduce((k, l, i) => (l.at <= (m.time.cur || 0) ? i : k), -1) : -1;
  useEffect(() => { const el = lyricBox.current?.querySelector('.on'); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [curLine]);

  const doSearch = async (e) => {
    e.preventDefault(); if (!q.trim()) return; setErr('');
    setResults({ title: `“${q.trim()}”`, list: null });
    try { setResults({ title: `“${q.trim()}”`, list: tab === 'popular' ? await searchTracks(q) : await search(q) }); } catch { setErr("Couldn't search right now."); setResults(null); }
  };
  const openArtist = async (a) => { setResults({ title: a.name, list: null }); try { setResults({ title: a.name, list: await artistTop(a.id, 30) }); } catch { setResults(null); } };
  const loadIndie = async (g) => { setIndie({ genre: g, list: null }); try { setIndie({ genre: g, list: g[2] === 'search' ? await search(g[0]) : await trending(g[0]) }); } catch { setIndie({ genre: g, list: [] }); } };
  useEffect(() => { if (tab === 'indie' && !indie.list) loadIndie(GENRES[2]); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // The card: swipe left = next, right = previous; double-tap = like.
  const onStart = (e) => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onEnd = (e) => {
    const s = swipe.current; swipe.current = null; if (!s || !t) return;
    const dx = e.changedTouches[0].clientX - s.x; const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      const card = e.currentTarget; card.classList.add(dx < 0 ? 'out-l' : 'out-r');
      setTimeout(() => card.classList.remove('out-l', 'out-r'), 280);
      if (dx < 0) m.next(); else m.prev();
      return;
    }
    const now = Date.now(); if (now - lastTap.current < 300) { m.like(t); lastTap.current = 0; } else lastTap.current = now;
  };

  const list = results?.list;
  const playing = (l) => (i) => { m.stopDj?.(); m.playList(l, i); };

  return (
    <Layout>
      <Head><title>Music Room · Luxe</title></Head>
      <div className="mr">
        <header className="mr-top">
          <h1>Music</h1>
          <button type="button" className="mr-chip" onClick={() => m.setSound(modes[(modes.indexOf(m.sound) + 1) % modes.length])} title="Bass modes apply to Indie tracks">{SOUND_LABEL[m.sound]}</button>
        </header>

        {t && (
          <section className="mr-now" style={{ '--art': `url("${t.artBig || t.art || ''}")` }}>
            <div className="mr-blur" />
            <div className="mr-nowIn">
              {showLyrics ? (
                <div className="mr-lyrics" ref={lyricBox} onClick={() => setShowLyrics(false)}>
                  {lyrics === null && <p className="dim">Finding lyrics…</p>}
                  {lyrics && lyrics.length === 0 && <p className="dim">No lyrics for this one.</p>}
                  {lyrics && lyrics.map((l, i) => <p key={i} className={i === curLine ? 'on' : i < curLine ? 'past' : ''}>{l.text || '♪'}</p>)}
                </div>
              ) : (
                <div className="mr-card" onTouchStart={onStart} onTouchEnd={onEnd} style={bgi(t.artBig || t.art)}>
                  {t.smart && <span className="mr-badge">✨ Smart Shuffle</span>}
                  {m.dj?.on && <span className="mr-badge dj">DJ LUXE{m.dj.name ? ` · ${m.dj.name}` : ''}</span>}
                </div>
              )}
              <div className="mr-ttl">
                <div><div className="mr-title">{t.title}</div><button type="button" className="mr-artist" onClick={() => t.artistId && openArtist({ id: t.artistId, name: t.artist })}>{t.artist}</button></div>
                <button type="button" className={`mr-heart ${liked ? 'on' : ''}`} onClick={() => m.like(t)} aria-label="Like">{liked ? '♥' : '♡'}</button>
              </div>
              <input className="mr-seek" type="range" min="0" max={m.time.dur || 0} step="1" value={m.time.cur || 0} onChange={(e) => m.seek(Number(e.target.value))} />
              <div className="mr-times"><span>{fmt(m.time.cur)}</span><span>{fmt(m.time.dur)}</span></div>
              <div className="mr-ctrls">
                <button type="button" className={m.shuffle ? 'on' : ''} onClick={() => m.setShuffle(!m.shuffle)} aria-label="Shuffle">🔀</button>
                <button type="button" onClick={m.prev} aria-label="Previous">⏮</button>
                <button type="button" className="mr-play" onClick={m.toggle} aria-label={m.playing ? 'Pause' : 'Play'}>{m.playing ? '❚❚' : '▶'}</button>
                <button type="button" onClick={m.next} aria-label="Next">⏭</button>
                <button type="button" onClick={() => setMenu(t)} aria-label="More">⋯</button>
              </div>
              <div className="mr-mini">
                <button type="button" className={showLyrics ? 'on' : ''} onClick={() => setShowLyrics((v) => !v)}>📜 Lyrics</button>
                <button type="button" onClick={() => setSheet('queue')}>📋 Queue</button>
                <button type="button" className={m.sleepAt ? 'on' : ''} onClick={() => setSheet('sleep')}>😴 {m.sleepAt === 'end' ? 'End of song' : m.sleepAt ? `${Math.max(1, Math.round((m.sleepAt - Date.now()) / 60000))}m` : 'Sleep'}</button>
                <button type="button" onClick={() => setSheet('fade')}>〰️ {m.blendSecs ? `${m.blendSecs}s` : 'No'} blend</button>
              </div>
            </div>
          </section>
        )}

        <div className="mr-tabs">
          {[['popular', '⭐ Popular'], ['indie', '🎛️ Indie']].map(([k, l]) => <button type="button" key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setResults(null); }}>{l}</button>)}
        </div>

        {tab === 'popular' && (
          <section className="mr-dj">
            <div className="mr-djIn">
              <div className="mr-djTag">DJ LUXE {m.dj?.talking && <span className="mr-onair"><i /> on the mic</span>}</div>
              <div className="mr-djLine">{m.dj?.on ? (m.dj.text || 'On air') : `Your own radio host. Pick a vibe or ask for anything: it builds a set from your taste (${top[0] || 'Lil Wayne'} and the artists around them), blends it, and talks you through it.`}</div>
              {m.dj?.on && m.dj.name && !m.dj.loading && <div className="mr-djName">Now: {m.dj.name}</div>}
              <div className="mr-moods">
                {MOODS.map(([k, l]) => <button type="button" key={k} className={m.dj?.mood === k ? 'on' : ''} disabled={m.dj?.loading} onClick={() => m.startDj({ mood: k })}>{l}</button>)}
              </div>
              <form className="mr-req" onSubmit={(e) => { e.preventDefault(); if (req.trim()) { m.startDj({ request: req.trim() }); setReq(''); } }}>
                <input value={req} onChange={(e) => setReq(e.target.value)} placeholder="Ask DJ Luxe: “2008 Weezy”, “songs for a night drive”…" />
                <button type="submit" disabled={!req.trim() || m.dj?.loading}>Go</button>
              </form>
              <div className="mr-djBtns">
                {m.dj?.on
                  ? <><button type="button" className="mr-djGo" disabled={m.dj?.loading} onClick={() => m.startDj({ switchUp: true })}>🔀 Switch it up</button><button type="button" className="mr-djGhost" onClick={m.stopDj}>DJ off</button></>
                  : <button type="button" className="mr-djGo" disabled={m.dj?.loading} onClick={() => m.startDj({})}>▶ Start DJ Luxe</button>}
              </div>
            </div>
          </section>
        )}

        <form className="mr-search" onSubmit={doSearch}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'popular' ? 'Search any song or artist…' : 'Search indie music…'} />
        </form>
        {err && <div className="mr-note">{err}</div>}

        {results ? (
          <section className="mr-sec">
            <div className="mr-head"><h3>{results.title}</h3><button type="button" className="mr-chip" onClick={() => setResults(null)}>✕</button></div>
            {!list && <div className="mr-note">Loading…</div>}
            <div className="mr-list">
              {(list || []).map((x, i) => (
                <div key={x.id} className={`mr-row ${t?.id === x.id ? 'cur' : ''}`}>
                  <button type="button" className="mr-rowMain" onClick={() => playing(list)(i)}>
                    <div className="mr-art" style={bgi(x.art)} />
                    <div className="mr-meta"><b>{x.title}</b><small>{x.artist}</small></div>
                  </button>
                  <button type="button" className="mr-more" onClick={() => setMenu(x)} aria-label="More">⋯</button>
                </div>
              ))}
            </div>
          </section>
        ) : tab === 'popular' ? (
          <>
            <section className="mr-sec">
              <h3>Made for you</h3>
              <div className="mr-hscroll">
                <button type="button" className="mr-mix daylist" onClick={() => m.startDj({ request: daylistName(top[0]) })}>
                  <div className="mr-mixArt"><span>daylist</span></div>
                  <b>{daylistName(top[0])}</b><small>Changes through the day</small>
                </button>
                <button type="button" className="mr-mix smart" onClick={m.smartShuffle}>
                  <div className="mr-mixArt"><span>✨</span></div>
                  <b>Smart Shuffle</b><small>Your likes + new finds</small>
                </button>
                {home.mixes.map((x) => (
                  <button type="button" key={x.name} className="mr-mix" onClick={() => playing(x.tracks)(0)}>
                    <div className="mr-mixArt" style={bgi(x.cover)}><span>{x.name}</span></div>
                    <b>{x.name}</b><small>{x.sub}</small>
                  </button>
                ))}
                {m.likes?.length > 0 && (
                  <button type="button" className="mr-mix liked" onClick={() => playing(m.likes)(0)}>
                    <div className="mr-mixArt"><span>♥</span></div>
                    <b>Liked Songs</b><small>{m.likes.length} songs</small>
                  </button>
                )}
              </div>
            </section>
            <Row title="Release Radar" items={home.radar} onPlay={playing(home.radar)} sub={(x) => `${x.artist}${x.released ? ` · ${x.released.slice(0, 7)}` : ''}`} />
            <Row title="On Repeat" items={onRepeat} onPlay={playing(onRepeat)} />
            <Row title="Recently played" items={recently} onPlay={playing(recently)} />
            {home.artists.length > 0 && (
              <section className="mr-sec">
                <h3>Your artists</h3>
                <div className="mr-hscroll">
                  {home.artists.map((a) => (
                    <button type="button" key={a.id} className="mr-artistTile" onClick={() => openArtist(a)}>
                      <div style={bgi(a.picture_medium)} /><b>{a.name}</b>
                    </button>
                  ))}
                </div>
              </section>
            )}
            <Row title="🔥 Top charts" items={home.charts} onPlay={playing(home.charts || [])} />
          </>
        ) : (
          <>
            <div className="mr-genres">
              {GENRES.map((g) => <button type="button" key={g[1]} className={indie.genre[1] === g[1] ? 'on' : ''} onClick={() => loadIndie(g)}>{g[1]}</button>)}
            </div>
            {!indie.list && <div className="mr-note">Loading…</div>}
            <div className="mr-list">
              {(indie.list || []).map((x, i) => (
                <div key={x.id} className={`mr-row ${t?.id === x.id ? 'cur' : ''}`}>
                  <button type="button" className="mr-rowMain" onClick={() => playing(indie.list)(i)}>
                    <div className="mr-art" style={bgi(x.art)} />
                    <div className="mr-meta"><b>{x.title}</b><small>{x.artist}{x.genre ? ` · ${x.genre}` : ''}</small></div>
                  </button>
                  <button type="button" className="mr-more" onClick={() => setMenu(x)} aria-label="More">⋯</button>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="mr-note">{tab === 'popular' ? 'Catalogue from Deezer; full songs through YouTube (its tiny player sits in the corner, low quality to save data).' : 'Indie music from Audius: full tracks, free and legal, with the bass modes.'}</div>
      </div>

      {(menu || sheet) && (
        <div className="mr-sheet" onClick={(e) => { if (e.target === e.currentTarget) { setMenu(null); setSheet(null); } }}>
          <div className="mr-panel">
            {menu && (
              <>
                <div className="mr-mhead"><div className="mr-art" style={bgi(menu.art)} /><div className="mr-meta"><b>{menu.title}</b><small>{menu.artist}</small></div></div>
                {[['▶', 'Play next', () => m.playNext(menu)], ['＋', 'Add to queue', () => m.addToQueue(menu)], ['📻', 'Start song radio', () => m.startRadio(menu)], [m.likes?.some((x) => x.id === menu.id) ? '♥' : '♡', m.likes?.some((x) => x.id === menu.id) ? 'Remove from Liked' : 'Like', () => m.like(menu)], ...(menu.artistId ? [['🎤', `Go to ${menu.artist}`, () => openArtist({ id: menu.artistId, name: menu.artist })]] : [])].map(([ic, l, f]) => (
                  <button type="button" key={l} className="mr-opt" onClick={() => { f(); setMenu(null); }}><span>{ic}</span>{l}</button>
                ))}
              </>
            )}
            {sheet === 'queue' && (
              <>
                <h3 className="mr-sheetT">Queue</h3>
                <div className="mr-list">
                  {(m.queue || []).map((x, i) => (i < m.idx ? null : (
                    <div key={`${x.id}${i}`} className={`mr-row ${i === m.idx ? 'cur' : ''}`}>
                      <div className="mr-rowMain"><div className="mr-art" style={bgi(x.art)} /><div className="mr-meta"><b>{i === m.idx ? '▶ ' : ''}{x.title}</b><small>{x.artist}</small></div></div>
                      {i !== m.idx && <button type="button" className="mr-more" onClick={() => m.removeFromQueue(i)} aria-label="Remove">✕</button>}
                    </div>
                  )))}
                </div>
              </>
            )}
            {sheet === 'sleep' && (
              <>
                <h3 className="mr-sheetT">Sleep timer</h3>
                {[[15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], ['end', 'End of this song'], [null, 'Off']].map(([v, l]) => (
                  <button type="button" key={l} className="mr-opt" onClick={() => { m.setSleep(v); setSheet(null); }}><span>{v === null ? '✕' : '😴'}</span>{l}</button>
                ))}
              </>
            )}
            {sheet === 'fade' && (
              <>
                <h3 className="mr-sheetT">Blend between songs: {m.blendSecs ? `${m.blendSecs} s` : 'off'}</h3>
                <input type="range" min="0" max="12" step="1" value={m.blendSecs} onChange={(e) => m.setCrossfade(Number(e.target.value))} style={{ width: '100%', accentColor: '#fff' }} />
                <p className="mr-note" style={{ textAlign: 'left', margin: '10px 0 0' }}>The next song fades in over the end of this one, like Spotify's crossfade. 0 = no blend.</p>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        .mr { background: #000; color: #f5f5f7; min-height: 100vh; padding-bottom: calc(130px + env(safe-area-inset-bottom)); font-family: -apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif; }
        .mr-top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: rgba(0,0,0,0.6); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
        .mr-top h1 { flex: 1; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.4px; }
        .mr-chip { border: 0; border-radius: 999px; padding: 7px 12px; font-size: 12.5px; font-weight: 600; background: rgba(255,255,255,0.1); color: #f5f5f7; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .mr-now { position: relative; overflow: hidden; padding: 18px 16px 14px; }
        .mr-blur { position: absolute; inset: -40px; background: var(--art) center / cover; filter: blur(50px) saturate(1.4) brightness(0.5); }
        .mr-nowIn { position: relative; display: flex; flex-direction: column; align-items: center; }
        .mr-card { position: relative; width: min(78vw, 340px); aspect-ratio: 1; border-radius: 16px; background: #2c2c2e center / cover; box-shadow: 0 22px 54px rgba(0,0,0,0.6); transition: transform 0.28s ease, opacity 0.28s; touch-action: pan-y; }
        .mr-card.out-l { transform: translateX(-30%) rotate(-4deg); opacity: 0.2; }
        .mr-card.out-r { transform: translateX(30%) rotate(4deg); opacity: 0.2; }
        .mr-badge { position: absolute; left: 10px; top: 10px; font-size: 11px; font-weight: 800; padding: 4px 9px; border-radius: 999px; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); }
        .mr-badge.dj { left: auto; right: 10px; background: linear-gradient(135deg, #7c3aed, #db2777); letter-spacing: 1px; }
        .mr-lyrics { width: min(86vw, 380px); height: min(78vw, 340px); overflow-y: auto; padding: 8px 4px; scrollbar-width: none; }
        .mr-lyrics::-webkit-scrollbar { display: none; }
        .mr-lyrics p { margin: 0 0 12px; font-size: 21px; font-weight: 800; line-height: 1.3; color: rgba(255,255,255,0.45); transition: color 0.3s; }
        .mr-lyrics p.on { color: #fff; } .mr-lyrics p.past { color: rgba(255,255,255,0.7); } .mr-lyrics p.dim { font-size: 15px; }
        .mr-ttl { width: 100%; max-width: 420px; display: flex; align-items: center; gap: 10px; margin-top: 16px; }
        .mr-ttl > div { flex: 1; min-width: 0; }
        .mr-title { font-size: 20px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mr-artist { all: unset; cursor: pointer; font-size: 14.5px; color: rgba(255,255,255,0.7); }
        .mr-heart { all: unset; cursor: pointer; font-size: 26px; color: rgba(255,255,255,0.85); }
        .mr-heart.on { color: #1ed760; }
        .mr-seek { width: 100%; max-width: 420px; margin-top: 10px; accent-color: #fff; }
        .mr-times { width: 100%; max-width: 420px; display: flex; justify-content: space-between; font-size: 11.5px; color: rgba(255,255,255,0.6); }
        .mr-ctrls { display: flex; align-items: center; gap: 16px; margin-top: 6px; }
        .mr-ctrls button { all: unset; cursor: pointer; font-size: 22px; color: rgba(255,255,255,0.85); width: 40px; height: 40px; display: grid; place-items: center; }
        .mr-ctrls button.on { color: #1ed760; }
        .mr-ctrls .mr-play { width: 64px; height: 64px; border-radius: 50%; background: #f5f5f7; color: #000; font-size: 22px; }
        .mr-mini { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; justify-content: center; }
        .mr-mini button { border: 0; border-radius: 999px; padding: 7px 12px; font-size: 12.5px; font-weight: 600; background: rgba(255,255,255,0.12); color: #f5f5f7; cursor: pointer; font-family: inherit; }
        .mr-mini button.on { background: #f5f5f7; color: #000; }
        .mr-tabs { display: flex; gap: 6px; margin: 14px 16px 0; padding: 4px; border-radius: 12px; background: #1c1c1e; }
        .mr-tabs button { flex: 1; border: 0; border-radius: 9px; padding: 9px; font-size: 14px; font-weight: 600; background: transparent; color: #8e8e93; cursor: pointer; font-family: inherit; }
        .mr-tabs button.on { background: #3a3a3c; color: #fff; }
        .mr-dj { margin: 14px 16px 0; border-radius: 18px; overflow: hidden; background: linear-gradient(135deg, #1e1b4b 0%, #7c3aed 45%, #db2777 85%, #f59e0b 130%); box-shadow: 0 12px 34px rgba(124,58,237,0.35); }
        .mr-djIn { padding: 16px; }
        .mr-djTag { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 900; letter-spacing: 3px; }
        .mr-onair { display: flex; align-items: center; gap: 6px; font-size: 11px; letter-spacing: 1px; }
        .mr-onair i { width: 8px; height: 8px; border-radius: 50%; background: #ff375f; box-shadow: 0 0 10px #ff375f; animation: mrPulse 1s ease-in-out infinite; }
        @keyframes mrPulse { 50% { opacity: 0.3; } }
        .mr-djLine { font-size: 15px; font-weight: 600; line-height: 1.4; margin-top: 8px; }
        .mr-djName { font-size: 12.5px; font-weight: 700; margin-top: 6px; opacity: 0.85; }
        .mr-moods { display: flex; gap: 6px; overflow-x: auto; margin-top: 12px; scrollbar-width: none; }
        .mr-moods::-webkit-scrollbar { display: none; }
        .mr-moods button { border: 0; border-radius: 999px; padding: 7px 12px; font-size: 12.5px; font-weight: 700; background: rgba(255,255,255,0.16); color: #fff; white-space: nowrap; cursor: pointer; font-family: inherit; }
        .mr-moods button.on { background: #fff; color: #000; }
        .mr-req { display: flex; gap: 6px; margin-top: 10px; }
        .mr-req input { flex: 1; min-width: 0; border: 0; border-radius: 12px; padding: 10px 12px; background: rgba(0,0,0,0.3); color: #fff; font-size: 14px; font-family: inherit; outline: none; }
        .mr-req input::placeholder { color: rgba(255,255,255,0.6); }
        .mr-req button { border: 0; border-radius: 12px; padding: 0 16px; background: #fff; color: #000; font-weight: 800; cursor: pointer; font-family: inherit; }
        .mr-djBtns { display: flex; gap: 8px; margin-top: 12px; }
        .mr-djGo { border: 0; border-radius: 999px; padding: 10px 18px; font-size: 14px; font-weight: 800; background: #fff; color: #000; cursor: pointer; font-family: inherit; }
        .mr-djGhost { border: 0; border-radius: 999px; padding: 10px 16px; font-size: 14px; font-weight: 600; background: rgba(255,255,255,0.18); color: #fff; cursor: pointer; font-family: inherit; }
        .mr-search { padding: 14px 16px 4px; }
        .mr-search input { width: 100%; box-sizing: border-box; border: 0; border-radius: 12px; padding: 11px 14px; background: #1c1c1e; color: #f5f5f7; font-size: 15px; font-family: inherit; outline: none; }
        .mr-sec { margin-top: 20px; }
        .mr-sec h3, .mr-head h3 { margin: 0 16px 10px; font-size: 20px; font-weight: 800; letter-spacing: -0.3px; }
        .mr-head { display: flex; align-items: center; justify-content: space-between; padding-right: 16px; }
        .mr-hscroll { display: flex; gap: 12px; overflow-x: auto; padding: 0 16px 4px; scrollbar-width: none; scroll-snap-type: x mandatory; }
        .mr-hscroll::-webkit-scrollbar { display: none; }
        .mr-tile, .mr-mix, .mr-artistTile { all: unset; box-sizing: border-box; cursor: pointer; flex: 0 0 132px; width: 132px; scroll-snap-align: start; }
        .mr-tile b, .mr-mix b, .mr-artistTile b { display: block; margin-top: 7px; font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mr-tile small, .mr-mix small { display: block; font-size: 11.5px; color: #8e8e93; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
        .mr-tileArt { width: 100%; aspect-ratio: 1; border-radius: 8px; background: #2c2c2e center / cover; box-shadow: 0 6px 18px rgba(0,0,0,0.5); }
        .mr-mix { flex-basis: 150px; width: 150px; }
        .mr-mixArt { position: relative; width: 100%; aspect-ratio: 1; border-radius: 8px; background: linear-gradient(135deg, #2c2c2e, #1c1c1e) center / cover; display: flex; align-items: flex-end; padding: 10px; box-sizing: border-box; overflow: hidden; }
        .mr-mixArt span { position: relative; z-index: 1; font-size: 16px; font-weight: 900; text-shadow: 0 2px 10px rgba(0,0,0,0.7); }
        .mr-mix:not(.daylist):not(.smart):not(.liked) .mr-mixArt::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.65), transparent 60%); }
        .mr-mix.daylist .mr-mixArt { background: linear-gradient(135deg, #f97316, #db2777 55%, #7c3aed); align-items: center; justify-content: center; }
        .mr-mix.daylist .mr-mixArt span { font-size: 22px; }
        .mr-mix.smart .mr-mixArt { background: linear-gradient(135deg, #0ea5e9, #22c55e); align-items: center; justify-content: center; }
        .mr-mix.smart .mr-mixArt span, .mr-mix.liked .mr-mixArt span { font-size: 44px; }
        .mr-mix.liked .mr-mixArt { background: linear-gradient(135deg, #4c1d95, #a78bfa); align-items: center; justify-content: center; }
        .mr-artistTile { flex-basis: 104px; width: 104px; text-align: center; }
        .mr-artistTile div { width: 100%; aspect-ratio: 1; border-radius: 50%; background: #2c2c2e center / cover; }
        .mr-genres { display: flex; gap: 8px; overflow-x: auto; padding: 10px 16px; scrollbar-width: none; }
        .mr-genres::-webkit-scrollbar { display: none; }
        .mr-genres button { border: 0; border-radius: 999px; padding: 8px 14px; font-size: 13px; font-weight: 600; background: #1c1c1e; color: #d1d1d6; white-space: nowrap; cursor: pointer; font-family: inherit; }
        .mr-genres button.on { background: #f5f5f7; color: #000; }
        .mr-list { padding: 0 8px; }
        .mr-row { display: flex; align-items: center; gap: 4px; border-radius: 10px; }
        .mr-row.cur { background: rgba(255,255,255,0.06); }
        .mr-rowMain { all: unset; box-sizing: border-box; cursor: pointer; flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 8px; }
        .mr-art { width: 50px; height: 50px; border-radius: 6px; background: #2c2c2e center / cover; flex-shrink: 0; }
        .mr-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .mr-meta b { font-size: 14.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mr-meta small { font-size: 12.5px; color: #8e8e93; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mr-more { all: unset; cursor: pointer; width: 40px; height: 40px; display: grid; place-items: center; font-size: 18px; color: #8e8e93; }
        .mr-note { font-size: 12px; color: #636366; text-align: center; margin: 16px; }
        .mr-sheet { position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); display: flex; align-items: flex-end; justify-content: center; }
        .mr-panel { width: 100%; max-width: 560px; max-height: 80vh; overflow-y: auto; background: #1c1c1e; color: #f5f5f7; border-radius: 16px 16px 0 0; padding: 14px 12px calc(20px + env(safe-area-inset-bottom)); font-family: -apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif; }
        .mr-mhead { display: flex; align-items: center; gap: 12px; padding: 4px 6px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 6px; }
        .mr-opt { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 14px; width: 100%; padding: 13px 8px; font-size: 15px; font-weight: 600; border-radius: 10px; }
        .mr-opt span { width: 26px; text-align: center; font-size: 18px; }
        .mr-sheetT { margin: 4px 8px 12px; font-size: 18px; font-weight: 800; }
      `}</style>
    </Layout>
  );
}
