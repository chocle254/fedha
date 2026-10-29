import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import { fetchLibrary, organise, loadArt, getProgress, markPlayed, isPlayed, upNext, watchWindow, playLink, scanLink, epCode, fetchSuggest, setFeedback } from '../lib/chill';

// Chill Room: your downloaded movies and series (Download / Telegram on the phone), laid out like Apple TV.
// Opened from the planner's watch-time block (right after the smoke break). ▶ hands the file to your video player
// through the Android app (PlayActivity); "Scan" refreshes the list (LibraryActivity). Data: lib/chill.js.
const gb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const mins = (ms) => (ms ? `${Math.round(ms / 60000)} min` : '');
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const left = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

function Session({ windows, now }) {
  if (!windows.length) return null;
  const cur = windows.find((w) => now >= w.start && now < w.end);
  const next = windows.find((w) => now < w.start);
  const text = cur ? `Watch time · ${left(cur.end - now)} left` : next ? `🌿 Opens after your smoke break · ${clock(next.start)}` : 'Watch time done for today';
  return <div className={`pill ${cur ? 'live' : ''}`}>{cur && <i />}{text}</div>;
}

function Poster({ img, title, sub, onClick, wide, badge }) {
  return (
    <button type="button" className={`card ${wide ? 'wide' : ''}`} onClick={onClick}>
      <div className="art" style={img ? { backgroundImage: `url(${img})` } : undefined}>{!img && <span>{title}</span>}{badge && <em>{badge}</em>}</div>
      <div className="ct">{title}</div>
      {sub && <div className="cs">{sub}</div>}
    </button>
  );
}

export default function Chill() {
  const [lib, setLib] = useState(null);
  const [art, setArt] = useState({});
  const [prog, setProg] = useState({ played: {}, last: null });
  const [windows, setWindows] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(null); // { type: 'show' | 'movie', item }
  const [season, setSeason] = useState(null);
  const [sug, setSug] = useState(null); // { items, taste }
  const [sugBusy, setSugBusy] = useState(false);

  const load = async () => {
    const [l, p, w] = await Promise.all([fetchLibrary(), getProgress(), watchWindow()]);
    setLib(l); setProg(p); setWindows(w);
  };
  useEffect(() => { load(); const t = setInterval(() => setNow(Date.now()), 30e3); return () => clearInterval(t); }, []);
  const { shows, movies } = useMemo(() => organise(lib?.files || []), [lib]);
  useEffect(() => { if (lib) fetchSuggest().then(setSug).catch(() => setSug({ items: [] })); }, [lib]);
  useEffect(() => { if (shows.length || movies.length || sug?.items?.length) loadArt({ shows, movies, extra: sug?.items || [] }, setArt); }, [shows, movies, sug]);
  const refreshSug = async () => { setSugBusy(true); try { setSug(await fetchSuggest(true)); } finally { setSugBusy(false); } };
  const react = async (title, value) => { setProg(await setFeedback(prog, title, value)); setOpen(null); };
  const sugArt = (x) => art[`${x.type === 'movie' ? 'movie' : 'show'}:${x.title}`] || {};
  const forYou = (sug?.items || []).filter((x) => !prog.feedback?.[x.title]);
  const wanted = Object.entries(prog.feedback || {}).filter(([, v]) => v === 'want').map(([t]) => (sug?.items || []).find((x) => x.title === t) || { title: t, type: 'series' });

  const play = async (file) => { setProg(await markPlayed(prog, file)); window.location.href = playLink(file); };
  const showArt = (s) => art[`show:${s.title}`] || {};
  const movieArt = (m) => art[`movie:${m.title}`] || {};

  // Hero: the series you are in the middle of, else the newest download.
  const continuing = shows.map((s) => ({ s, u: upNext(s, prog, showArt(s)) })).filter((x) => x.u.started && x.u.next);
  const lastShow = prog.last?.show && continuing.find((x) => x.s.title === prog.last.show);
  const hero = lastShow || continuing[0] || (shows[0] ? { s: shows[0], u: upNext(shows[0], prog, showArt(shows[0])) } : null);
  const heroMovie = !hero && movies[0];
  const ha = hero ? showArt(hero.s) : heroMovie ? movieArt(heroMovie) : {};
  const heroNext = hero ? hero.u.next || hero.s.episodes[0] : null;

  const empty = lib && !shows.length && !movies.length;
  const detail = open?.type === 'show' ? open.item : null;
  const dArt = detail ? showArt(detail) : open?.type === 'movie' ? movieArt(open.item) : open?.type === 'sug' ? sugArt(open.item) : {};
  const dSeason = detail ? (season ?? (upNext(detail, prog, dArt).next?.season || detail.seasons[0])) : null;

  return (
    <Layout>
      <Head><title>Chill Room · Luxe</title></Head>
      <div className="room">
        <header className="top">
          <h1>Chill Room</h1>
          <Session windows={windows} now={now} />
          <a className="scan" href={scanLink} onClick={() => setTimeout(load, 9000)} title="Scan the phone for new downloads">⟳</a>
        </header>

        {!lib && <div className="note">Loading your library…</div>}
        {empty && (
          <div className="emptyBox">
            <div className="big">🍿</div>
            <h2>Your movies, on one screen</h2>
            <p>Luxe looks in Download and Telegram on this phone for series and movies (personal videos are skipped) and lays them out here. Videos stay on the phone.</p>
            <a className="btnW" href={scanLink} onClick={() => setTimeout(load, 9000)}>Scan my downloads</a>
            <p className="tiny">Needs the Luxe Android app, linked in Wallets.</p>
          </div>
        )}

        {(hero || heroMovie) && (
          <section className="hero" style={ha.backdrop || ha.poster ? { backgroundImage: `url(${ha.backdrop || ha.poster})` } : undefined}>
            <div className="shade" />
            <div className="heroIn">
              <div className="kick">{hero ? (hero.u.started ? 'CONTINUE WATCHING' : 'NEW IN YOUR LIBRARY') : 'MOVIE'}</div>
              <h2>{hero ? hero.s.title : heroMovie.title}</h2>
              <div className="meta">{[ha.year || heroMovie?.year, (ha.genres || []).slice(0, 3).join(' · '), ha.rating && (typeof ha.rating === 'number' ? `★ ${ha.rating}` : ha.rating)].filter(Boolean).join('  ·  ')}</div>
              {ha.summary && <p className="sum">{ha.summary}</p>}
              <div className="btns">
                <button type="button" className="btnW" onClick={() => play(heroNext || heroMovie)}>▶ {hero ? `Play ${epCode(heroNext.season, heroNext.episode)}` : 'Play'}</button>
                {hero && <button type="button" className="btnG" onClick={() => { setSeason(null); setOpen({ type: 'show', item: hero.s }); }}>Episodes</button>}
              </div>
              {hero && heroNext && ha.names?.[epCode(heroNext.season, heroNext.episode)] && <div className="epn">{epCode(heroNext.season, heroNext.episode)} · {ha.names[epCode(heroNext.season, heroNext.episode)]}</div>}
            </div>
          </section>
        )}

        {continuing.length > 0 && (
          <section className="row">
            <h3>Up Next</h3>
            <div className="scroller">
              {continuing.map(({ s, u }) => {
                const a = showArt(s); const c = epCode(u.next.season, u.next.episode);
                return <Poster key={s.title} wide img={a.backdrop || a.poster} title={s.title} sub={`${c}${a.names?.[c] ? ` · ${a.names[c]}` : ''}`} onClick={() => play(u.next)} badge="▶" />;
              })}
            </div>
          </section>
        )}

        {(forYou.length > 0 || sug?.taste) && (
          <section className="row">
            <div className="rowHead"><h3>For You</h3><button type="button" className="ref" disabled={sugBusy} onClick={refreshSug}>{sugBusy ? '…' : '↻ New picks'}</button></div>
            {sug?.taste && <p className="taste">{sug.taste}</p>}
            <div className="scroller">
              {forYou.map((x) => <Poster key={x.title} img={sugArt(x).poster} title={x.title} sub={x.because ? `Because you like ${x.because}` : x.type} onClick={() => setOpen({ type: 'sug', item: x })} />)}
            </div>
          </section>
        )}

        {wanted.length > 0 && (
          <section className="row">
            <h3>Want to Watch</h3>
            <div className="scroller">
              {wanted.map((x) => <Poster key={x.title} img={sugArt(x).poster} title={x.title} sub="Download it when you can" onClick={() => setOpen({ type: 'sug', item: x })} />)}
            </div>
          </section>
        )}

        {shows.length > 0 && (
          <section className="row">
            <h3>Series</h3>
            <div className="scroller">
              {shows.map((s) => {
                const u = upNext(s, prog, showArt(s));
                const sub = u.missing && !u.next ? `${u.missing} not downloaded` : `${s.episodes.length} episode${s.episodes.length > 1 ? 's' : ''} · S${s.seasons.join(', S')}`;
                return <Poster key={s.title} img={showArt(s).poster} title={s.title} sub={sub} onClick={() => { setSeason(null); setOpen({ type: 'show', item: s }); }} />;
              })}
            </div>
          </section>
        )}

        {movies.length > 0 && (
          <section className="row">
            <h3>Movies</h3>
            <div className="scroller">
              {movies.map((m) => <Poster key={m.key} img={movieArt(m).poster} title={m.title} sub={[m.year, mins(m.duration)].filter(Boolean).join(' · ')} onClick={() => setOpen({ type: 'movie', item: m })} badge={isPlayed(prog, m) ? '✓' : null} />)}
            </div>
          </section>
        )}

        {lib?.scanned_at && <div className="note">Library from your phone · scanned {new Date(lib.scanned_at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · tap ⟳ after new downloads</div>}
      </div>

      {open && (
        <div className="sheet" onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="panel">
            <div className="pHead" style={dArt.backdrop || dArt.poster ? { backgroundImage: `url(${dArt.backdrop || dArt.poster})` } : undefined}>
              <div className="shade" />
              <button type="button" className="x" onClick={() => setOpen(null)}>✕</button>
              <h2>{detail ? detail.title : open.item.title}</h2>
              <div className="meta">{[dArt.year || open.item.year, (dArt.genres || []).join(' · ')].filter(Boolean).join('  ·  ')}</div>
            </div>
            {dArt.summary && <p className="pSum">{dArt.summary}</p>}
            {detail ? (
              <>
                <div className="tabs">{detail.seasons.map((n) => <button type="button" key={n} className={n === dSeason ? 'on' : ''} onClick={() => setSeason(n)}>Season {n}</button>)}</div>
                {(() => { const u = upNext(detail, prog, dArt); return u.missing && !u.next ? <div className="miss">Up next is {u.missing}, which isn&apos;t on your phone yet.</div> : null; })()}
                <div className="eps">
                  {detail.episodes.filter((e) => e.season === dSeason).map((e) => {
                    const c = epCode(e.season, e.episode); const done = isPlayed(prog, e);
                    return (
                      <button type="button" key={e.key} className="ep" onClick={() => play(e)}>
                        <span className="num">{e.episode}</span>
                        <span className="epT"><b>{dArt.names?.[c] || `Episode ${e.episode}`}</b><small>{[c, mins(e.duration), gb(e.size)].filter(Boolean).join(' · ')}</small></span>
                        <span className={`pl ${done ? 'done' : ''}`}>{done ? '✓' : '▶'}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : open.type === 'sug' ? (
              <div className="pad2">
                {open.item.why && <p className="why">{open.item.because ? <b>Because you like {open.item.because}. </b> : null}{open.item.why}</p>}
                <div className="btns">
                  <button type="button" className="btnW" onClick={() => react(open.item.title, prog.feedback?.[open.item.title] === 'want' ? null : 'want')}>{prog.feedback?.[open.item.title] === 'want' ? '✓ On your list' : '＋ Want to watch'}</button>
                  <button type="button" className="btnG" onClick={() => react(open.item.title, 'seen')}>Seen it</button>
                  <button type="button" className="btnG" onClick={() => react(open.item.title, 'no')}>Not for me</button>
                </div>
              </div>
            ) : (
              <div className="btns pad"><button type="button" className="btnW" onClick={() => play(open.item)}>▶ Play</button><span className="meta">{[mins(open.item.duration), gb(open.item.size)].filter(Boolean).join(' · ')}</span></div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .room { background: #000; color: #f5f5f7; min-height: 100vh; margin: 0 -1px; padding-bottom: 40px; font-family: -apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif; }
        .top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: rgba(0,0,0,0.55); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); }
        h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.4px; margin: 0; flex: 1; }
        .pill { font-size: 12px; font-weight: 600; padding: 6px 11px; border-radius: 999px; background: rgba(255,255,255,0.1); color: #d1d1d6; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
        .pill.live { background: rgba(48,209,88,0.16); color: #30d158; }
        .pill i { width: 7px; height: 7px; border-radius: 50%; background: #30d158; box-shadow: 0 0 8px #30d158; }
        .scan { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,0.1); color: #fff; text-decoration: none; font-size: 17px; }
        .hero { position: relative; min-height: 62vh; background: #111 center / cover no-repeat; display: flex; align-items: flex-end; }
        .shade { position: absolute; inset: 0; background: linear-gradient(to top, #000 4%, rgba(0,0,0,0.75) 35%, rgba(0,0,0,0.15) 70%, rgba(0,0,0,0.35)); }
        .heroIn { position: relative; padding: 0 16px 22px; max-width: 640px; }
        .kick { font-size: 11px; font-weight: 700; letter-spacing: 1.4px; color: rgba(255,255,255,0.7); }
        .hero h2 { font-size: 34px; line-height: 1.05; font-weight: 800; letter-spacing: -0.8px; margin: 6px 0 8px; }
        .meta { font-size: 13px; color: rgba(255,255,255,0.72); }
        .sum { font-size: 13.5px; line-height: 1.45; color: rgba(255,255,255,0.82); margin: 10px 0 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .btns { display: flex; gap: 10px; margin-top: 16px; align-items: center; }
        .btns.pad { padding: 0 16px 20px; }
        .btnW { background: #f5f5f7; color: #000; border: 0; border-radius: 10px; padding: 12px 22px; font-size: 15px; font-weight: 700; text-decoration: none; display: inline-block; cursor: pointer; }
        .btnG { background: rgba(255,255,255,0.16); color: #fff; border: 0; border-radius: 10px; padding: 12px 18px; font-size: 15px; font-weight: 600; backdrop-filter: blur(20px); cursor: pointer; }
        .epn { margin-top: 10px; font-size: 12.5px; color: rgba(255,255,255,0.65); }
        .row { margin-top: 26px; }
        .row h3 { font-size: 19px; font-weight: 700; letter-spacing: -0.3px; margin: 0 16px 10px; }
        .scroller { display: flex; gap: 12px; overflow-x: auto; padding: 0 16px 6px; scroll-snap-type: x mandatory; scrollbar-width: none; }
        .scroller::-webkit-scrollbar { display: none; }
        .card { all: unset; cursor: pointer; flex: 0 0 128px; scroll-snap-align: start; }
        .card.wide { flex-basis: 250px; }
        .art { position: relative; aspect-ratio: 2 / 3; border-radius: 12px; background: #1c1c1e center / cover no-repeat; box-shadow: 0 8px 24px rgba(0,0,0,0.5); display: grid; place-items: center; overflow: hidden; transition: transform 0.2s; }
        .card.wide .art { aspect-ratio: 16 / 9; }
        .card:active .art { transform: scale(0.96); }
        .art span { padding: 10px; text-align: center; font-weight: 700; font-size: 14px; color: #aeaeb2; }
        .art em { position: absolute; right: 8px; bottom: 8px; font-style: normal; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: rgba(0,0,0,0.6); backdrop-filter: blur(10px); font-size: 12px; }
        .ct { margin-top: 8px; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cs { font-size: 11.5px; color: #8e8e93; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rowHead { display: flex; align-items: center; justify-content: space-between; margin-right: 16px; }
        .rowHead h3 { margin-bottom: 10px; }
        .ref { border: 0; background: rgba(255,255,255,0.1); color: #d1d1d6; border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; }
        .taste { margin: -4px 16px 12px; font-size: 13px; color: #aeaeb2; line-height: 1.45; font-style: italic; }
        .pad2 { padding: 12px 16px 22px; }
        .why { font-size: 14px; line-height: 1.5; color: #d1d1d6; margin: 0; }
        .why b { color: #fff; }
        .note { font-size: 11.5px; color: #636366; text-align: center; margin: 28px 16px 0; }
        .emptyBox { text-align: center; padding: 70px 24px; }
        .emptyBox .big { font-size: 54px; }
        .emptyBox h2 { font-size: 24px; margin: 10px 0 8px; letter-spacing: -0.5px; }
        .emptyBox p { color: #8e8e93; font-size: 14px; line-height: 1.5; max-width: 380px; margin: 0 auto 20px; }
        .emptyBox .tiny { font-size: 12px; margin-top: 14px; }
        .sheet { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); display: flex; align-items: flex-end; justify-content: center; }
        .panel { width: 100%; max-width: 720px; max-height: 92vh; overflow-y: auto; background: #1c1c1e; color: #f5f5f7; border-radius: 18px 18px 0 0; font-family: -apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif; }
        .pHead { position: relative; height: 230px; background: #2c2c2e center / cover; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 16px 14px; border-radius: 18px 18px 0 0; overflow: hidden; }
        .pHead h2, .pHead .meta { position: relative; }
        .pHead h2 { font-size: 26px; font-weight: 800; margin: 0 0 4px; letter-spacing: -0.5px; }
        .x { position: absolute; top: 12px; right: 12px; z-index: 2; width: 32px; height: 32px; border-radius: 50%; border: 0; background: rgba(0,0,0,0.5); color: #fff; font-size: 14px; cursor: pointer; }
        .pSum { font-size: 13.5px; line-height: 1.5; color: #d1d1d6; padding: 12px 16px 0; margin: 0; }
        .tabs { display: flex; gap: 8px; padding: 14px 16px 6px; overflow-x: auto; }
        .tabs button { border: 0; border-radius: 999px; padding: 7px 14px; font-size: 13px; font-weight: 600; background: rgba(255,255,255,0.08); color: #d1d1d6; white-space: nowrap; cursor: pointer; }
        .tabs button.on { background: #f5f5f7; color: #000; }
        .miss { margin: 6px 16px; font-size: 12.5px; color: #ff9f0a; }
        .eps { padding: 4px 8px 24px; }
        .ep { all: unset; cursor: pointer; display: flex; align-items: center; gap: 12px; width: calc(100% - 16px); padding: 12px 8px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .num { width: 24px; text-align: center; color: #8e8e93; font-weight: 700; }
        .epT { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .epT b { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .epT small { font-size: 12px; color: #8e8e93; }
        .pl { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: #f5f5f7; color: #000; font-size: 12px; }
        .pl.done { background: rgba(48,209,88,0.18); color: #30d158; }
        @media (min-width: 900px) { .card { flex-basis: 160px; } .card.wide { flex-basis: 320px; } .hero h2 { font-size: 46px; } }
      `}</style>
    </Layout>
  );
}
