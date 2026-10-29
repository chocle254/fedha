import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import Link from 'next/link';
import { prefetchReels } from '../lib/reels';
import { fetchLibrary, organise, loadArt, getProgress, markPlayed, isPlayed, upNext, watchWindow, watchLink, progressKey, scanLink, epCode, fetchSuggest, setFeedback, connection, trailerFor, trailerSrc } from '../lib/chill';

// Chill Room: your downloaded movies and series (Download / Telegram on the phone), laid out like Apple TV.
//   hero      the series you're in the middle of (backdrop, ▶ next episode)
//   Up Next   the next episode of each series you've started, as its own episode still
//   For You   AI picks from your taste (posters; why + reactions in the sheet)
//   Series    folders: poster + tab + episode count; opens to seasons and episodes with stills
//   Movies    posters
// ▶ hands the file to your video player through the Android app (PlayActivity); ⟳ rescans (LibraryActivity).
// Styles are global but all prefixed "cr-" (component-scoped styles don't reach the small card components).
const gb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const mins = (ms) => (ms ? `${Math.round(ms / 60000)} min` : '');
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const left = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const bg = (url) => (url ? { backgroundImage: `url("${url}")` } : undefined);
// Sound mode for Luxe's player (remembered on this phone).
const SOUNDS = [['theater', '🔊 Theater'], ['max', '💥 Max bass'], ['off', '🔈 Plain']];
const getSound = () => { try { return localStorage.getItem('luxe_sound') || 'theater'; } catch { return 'theater'; } };

function Session({ windows, now }) {
  if (!windows.length) return null;
  const cur = windows.find((w) => now >= w.start && now < w.end);
  const next = windows.find((w) => now < w.start);
  const text = cur ? `${left(cur.end - now)} left` : next ? `🌿 ${clock(next.start)}` : 'Done today';
  return <div className={`cr-pill ${cur ? 'live' : ''}`}>{cur && <i />}{text}</div>;
}

// Minimal poster: image only, one line of title under it.
function Poster({ img, title, onClick, badge }) {
  return (
    <button type="button" className="cr-poster" onClick={onClick} aria-label={title}>
      <div className="cr-img" style={bg(img)}>{!img && <span>{title}</span>}{badge && <em>{badge}</em>}</div>
      <div className="cr-t">{title}</div>
    </button>
  );
}

// Up Next: the episode's own still, code on it, play button.
function EpisodeCard({ still, fallback, show, code, name, onClick }) {
  return (
    <button type="button" className="cr-ep" onClick={onClick} aria-label={`Play ${show} ${code}`}>
      <div className="cr-img wide" style={bg(still || fallback)}>
        <div className="cr-fade" />
        <b className="cr-code">{code}</b>
        <span className="cr-play">▶</span>
      </div>
      <div className="cr-t">{show}</div>
      {name && <div className="cr-s">{name}</div>}
    </button>
  );
}

// Continue Watching: where you stopped, with how far in you are.
function ResumeCard({ img, title, sub, pct, left, onClick }) {
  return (
    <button type="button" className="cr-ep" onClick={onClick} aria-label={`Resume ${title}`}>
      <div className="cr-img wide" style={bg(img)}>
        <div className="cr-fade" />
        <b className="cr-code">{left}</b>
        <span className="cr-play">▶</span>
        <div className="cr-bar"><i style={{ width: `${Math.round(pct * 100)}%` }} /></div>
      </div>
      <div className="cr-t">{title}</div>
      {sub && <div className="cr-s">{sub}</div>}
    </button>
  );
}

// Series as a folder: tab on top, poster inside, episode count on it.
function Folder({ img, title, count, seasons, onClick, note }) {
  return (
    <button type="button" className="cr-folder" onClick={onClick} aria-label={`${title} folder`}>
      <div className="cr-tab" />
      <div className="cr-fbody">
        <div className="cr-img" style={bg(img)}>{!img && <span>{title}</span>}</div>
        <div className="cr-fcount">📁 {count} · {seasons}</div>
      </div>
      <div className="cr-t">{title}</div>
      {note && <div className="cr-s warn">{note}</div>}
    </button>
  );
}

export default function Chill() {
  const [lib, setLib] = useState(null);
  const [art, setArt] = useState({});
  const [prog, setProg] = useState({ played: {}, last: null });
  const [windows, setWindows] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(null); // { type: 'show' | 'movie' | 'sug', item }
  const [season, setSeason] = useState(null);
  const [sug, setSug] = useState(null);
  const [sugBusy, setSugBusy] = useState(false);
  const [sound, setSound] = useState('theater');
  const [trailer, setTrailer] = useState(null); // { title, id | null, loading, wifi }
  // ▶ Trailer: looked up once, played only on a tap, lowest quality on mobile data.
  const openTrailer = async (name, extra = '') => {
    const c = connection();
    setTrailer({ title: name, loading: true, wifi: c.wifi });
    const id = await trailerFor(name, extra);
    setTrailer({ title: name, id, loading: false, wifi: c.wifi });
  };
  const net = typeof navigator !== 'undefined' ? connection() : { wifi: false };
  const trailerLabel = net.wifi ? '▶ Trailer' : '▶ Trailer · ~4 MB';
  useEffect(() => { setSound(getSound()); }, []);
  const cycleSound = () => { const i = SOUNDS.findIndex(([k]) => k === sound); const next = SOUNDS[(i + 1) % SOUNDS.length][0]; setSound(next); try { localStorage.setItem('luxe_sound', next); } catch { /* ignore */ } };

  const load = async () => {
    const [l, p, w] = await Promise.all([fetchLibrary(), getProgress(), watchWindow()]);
    setLib(l); setProg(p); setWindows(w);
  };
  useEffect(() => { load(); const t = setInterval(() => setNow(Date.now()), 30e3); return () => clearInterval(t); }, []);
  // On Wi-Fi, get Reels ready in the background (the feed + the first 4 trailers looked up). Never on mobile data.
  useEffect(() => { const t = setTimeout(() => { if (connection().wifi) prefetchReels(); }, 4000); return () => clearTimeout(t); }, []);
  const { shows, movies } = useMemo(() => organise(lib?.files || []), [lib]);
  useEffect(() => { if (lib) fetchSuggest().then(setSug).catch(() => setSug({ items: [] })); }, [lib]);
  useEffect(() => { if (shows.length || movies.length || sug?.items?.length) loadArt({ shows, movies, extra: sug?.items || [] }, setArt); }, [shows, movies, sug]);

  // ▶ opens Luxe's own player with this episode and the rest of the downloaded ones after it queued (auto-next),
  // each with the show's IMDb id so the player can skip intros and spot the credits.
  const play = async (file) => {
    setProg(await markPlayed(prog, file));
    let queue;
    if (file.kind === 'episode') {
      const sh = shows.find((x) => x.title === file.show);
      const a = art[`show:${file.show}`] || {};
      const from = sh ? sh.episodes.indexOf(sh.episodes.find((e) => e.key === file.key)) : -1;
      const eps = sh && from >= 0 ? sh.episodes.slice(from) : [file];
      queue = eps.map((e) => { const c = epCode(e.season, e.episode); return { id: e.id, t: `${e.show} · ${c}${a.names?.[c] ? ` · ${a.names[c]}` : ''}`, k: progressKey(e), imdb: a.imdb || '', s: e.season, e: e.episode }; });
    } else queue = [{ id: file.id, t: file.title, k: progressKey(file) }];
    window.location.href = watchLink(queue, sound);
  };
  const refreshSug = async () => { setSugBusy(true); try { setSug(await fetchSuggest(true)); } finally { setSugBusy(false); } };
  const react = async (title, value) => { setProg(await setFeedback(prog, title, value)); setOpen(null); };
  const showArt = (s) => art[`show:${s.title}`] || {};
  const movieArt = (m) => art[`movie:${m.title}`] || {};
  const sugArt = (x) => art[`${x.type === 'movie' ? 'movie' : 'show'}:${x.title}`] || {};

  // Unfinished episodes / movies that are still on the phone, most recent first.
  const resumable = Object.entries(prog.progress || {}).map(([k, v]) => {
    const file = k.startsWith('movie:') ? movies.find((mv) => `movie:${mv.title}` === k) : shows.flatMap((sh) => sh.episodes).find((e) => `${e.show}|${epCode(e.season, e.episode)}` === k);
    return file ? { k, v, file } : null;
  }).filter(Boolean).sort((a, b) => b.v.at - a.v.at);
  const minsLeft = (v) => `${Math.max(1, Math.round((v.dur - v.pos) / 60))} min left`;
  const continuing = shows.map((s) => ({ s, u: upNext(s, prog, showArt(s)) })).filter((x) => x.u.next);
  const started = continuing.filter((x) => x.u.started);
  const lastShow = prog.last?.show && continuing.find((x) => x.s.title === prog.last.show);
  const resumeTop = resumable[0] || null;
  const heroResume = resumeTop?.file.kind === 'episode' ? { s: shows.find((sh) => sh.title === resumeTop.file.show), u: { next: resumeTop.file, started: true } } : null;
  const hero = heroResume?.s ? heroResume : lastShow || started[0] || continuing[0] || null;
  const heroMovie = !hero && (resumeTop?.file.kind === 'movie' ? resumeTop.file : movies[0]);
  const heroProgress = resumeTop && ((hero && resumeTop.file === hero.u.next) || (heroMovie && resumeTop.file === heroMovie)) ? resumeTop.v : null;
  const ha = hero ? showArt(hero.s) : heroMovie ? movieArt(heroMovie) : {};
  const heroNext = hero?.u.next;
  const forYou = (sug?.items || []).filter((x) => !prog.feedback?.[x.title]);
  const wanted = Object.entries(prog.feedback || {}).filter(([, v]) => v === 'want').map(([t]) => (sug?.items || []).find((x) => x.title === t) || { title: t, type: 'series' });

  // Coming Soon: the next episode of your series and of the AI's picks that are still airing, soonest first.
  const today = new Date().toISOString().slice(0, 10);
  const comingSoon = [
    ...shows.map((sh) => ({ title: sh.title, a: showArt(sh), mine: true })),
    ...forYou.filter((x) => x.type !== 'movie').map((x) => ({ title: x.title, a: sugArt(x), mine: false, sug: x })),
  ].filter((x) => x.a.next?.airdate && x.a.next.airdate >= today).sort((a, b) => a.a.next.airdate.localeCompare(b.a.next.airdate)).slice(0, 15);
  const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

  const empty = lib && !shows.length && !movies.length;
  const detail = open?.type === 'show' ? open.item : null;
  const dArt = detail ? showArt(detail) : open?.type === 'movie' ? movieArt(open.item) : open?.type === 'sug' ? sugArt(open.item) : {};
  const dSeason = detail ? (season ?? (upNext(detail, prog, dArt).next?.season || detail.seasons[0])) : null;

  return (
    <Layout>
      <Head><title>Chill Room · Luxe</title></Head>
      <div className="cr">
        <header className="cr-top">
          <h1>Chill Room</h1>
          <Session windows={windows} now={now} />
          <button type="button" className="cr-pill" onClick={cycleSound} aria-label="Sound mode">{SOUNDS.find(([k]) => k === sound)?.[1]}</button>
          <Link href="/reels" className="cr-pill" style={{ textDecoration: 'none', background: 'linear-gradient(135deg,#e50914,#7c3aed)', color: '#fff' }}>🎬 Reels</Link>
          <a className="cr-scan" href={scanLink} onClick={() => setTimeout(load, 9000)} aria-label="Scan the phone for new downloads">⟳</a>
        </header>

        {!lib && <div className="cr-note">Loading your library…</div>}
        {empty && (
          <div className="cr-empty">
            <div className="big">🍿</div>
            <h2>Your movies, on one screen</h2>
            <p>Luxe looks in Download and Telegram on this phone for series and movies (personal videos are skipped). Videos stay on the phone.</p>
            <a className="cr-btnW" href={scanLink} onClick={() => setTimeout(load, 9000)}>Scan my downloads</a>
          </div>
        )}

        {(hero || heroMovie) && (
          <section className="cr-hero" style={bg(ha.backdrop || ha.poster)}>
            <div className="cr-shade" />
            <div className="cr-heroIn">
              <div className="cr-kick">{heroProgress ? 'CONTINUE WATCHING' : hero ? (hero.u.started ? 'UP NEXT' : 'IN YOUR LIBRARY') : 'MOVIE'}</div>
              <h2>{hero ? hero.s.title : heroMovie.title}</h2>
              <div className="cr-meta">{[ha.year || heroMovie?.year, (ha.genres || []).slice(0, 2).join(' · '), typeof ha.rating === 'number' ? `★ ${ha.rating}` : ha.rating].filter(Boolean).join('  ·  ')}</div>
              <div className="cr-btns">
                <button type="button" className="cr-btnW" onClick={() => play(heroNext || heroMovie)}>▶ {heroProgress ? 'Resume' : 'Play'}{heroNext ? ` ${epCode(heroNext.season, heroNext.episode)}` : ''}</button>
                {hero && <button type="button" className="cr-btnG" onClick={() => { setSeason(null); setOpen({ type: 'show', item: hero.s }); }}>📁 Episodes</button>}
              </div>
              {heroProgress && <div className="cr-heroBar"><div className="cr-bar"><i style={{ width: `${Math.round((heroProgress.pos / heroProgress.dur) * 100)}%` }} /></div><span>{minsLeft(heroProgress)}</span></div>}
            </div>
          </section>
        )}

        {resumable.length > 0 && (
          <section className="cr-row">
            <h3>Continue Watching</h3>
            <div className="cr-scroll">
              {resumable.map(({ k, v, file }) => {
                const isEp = file.kind === 'episode';
                const a = isEp ? showArt({ title: file.show }) : movieArt(file);
                const c = isEp ? epCode(file.season, file.episode) : null;
                return <ResumeCard key={k} img={isEp ? a.stills?.[c] || a.backdrop || a.poster : a.backdrop || a.poster} title={isEp ? file.show : file.title} sub={isEp ? `${c}${a.names?.[c] ? ` · ${a.names[c]}` : ''}` : null} pct={v.dur ? v.pos / v.dur : 0} left={minsLeft(v)} onClick={() => play(file)} />;
              })}
            </div>
          </section>
        )}

        {continuing.length > 0 && (
          <section className="cr-row">
            <h3>Up Next</h3>
            <div className="cr-scroll">
              {continuing.map(({ s, u }) => {
                const a = showArt(s); const c = epCode(u.next.season, u.next.episode);
                return <EpisodeCard key={s.title} still={a.stills?.[c]} fallback={a.backdrop || a.poster} show={s.title} code={c} name={a.names?.[c]} onClick={() => play(u.next)} />;
              })}
            </div>
          </section>
        )}

        {comingSoon.length > 0 && (
          <section className="cr-row">
            <h3>Coming Soon</h3>
            <div className="cr-scroll">
              {comingSoon.map((x) => (
                <button type="button" key={x.title} className="cr-poster" onClick={() => (x.sug ? setOpen({ type: 'sug', item: x.sug }) : openTrailer(x.title, `season ${x.a.next.season}`))}>
                  <div className="cr-img" style={bg(x.a.poster)}><em className="cr-date">{dayLabel(x.a.next.airdate)}</em></div>
                  <div className="cr-t">{x.title}</div>
                  <div className="cr-s">{`S${String(x.a.next.season).padStart(2, '0')}E${String(x.a.next.number).padStart(2, '0')}`}{x.mine ? ' · yours' : ''}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {shows.length > 0 && (
          <section className="cr-row">
            <h3>Series</h3>
            <div className="cr-scroll">
              {shows.map((s) => {
                const u = upNext(s, prog, showArt(s));
                return <Folder key={s.title} img={showArt(s).poster} title={s.title} count={`${s.episodes.length} ep${s.episodes.length > 1 ? 's' : ''}`} seasons={s.seasons.map((n) => `S${n}`).join(' ')} note={u.missing && !u.next ? `${u.missing} not downloaded` : null} onClick={() => { setSeason(null); setOpen({ type: 'show', item: s }); }} />;
              })}
            </div>
          </section>
        )}

        {(forYou.length > 0 || sug?.taste) && (
          <section className="cr-row">
            <div className="cr-rowHead"><h3>For You</h3><button type="button" className="cr-chip" disabled={sugBusy} onClick={refreshSug}>{sugBusy ? '…' : '↻'}</button></div>
            <div className="cr-scroll">
              {forYou.map((x) => <Poster key={x.title} img={sugArt(x).poster} title={x.title} onClick={() => setOpen({ type: 'sug', item: x })} />)}
            </div>
          </section>
        )}

        {wanted.length > 0 && (
          <section className="cr-row">
            <h3>Want to Watch</h3>
            <div className="cr-scroll">{wanted.map((x) => <Poster key={x.title} img={sugArt(x).poster} title={x.title} onClick={() => setOpen({ type: 'sug', item: x })} />)}</div>
          </section>
        )}

        {movies.length > 0 && (
          <section className="cr-row">
            <h3>Movies</h3>
            <div className="cr-scroll">{movies.map((m) => <Poster key={m.key} img={movieArt(m).poster} title={m.title} onClick={() => setOpen({ type: 'movie', item: m })} badge={isPlayed(prog, m) ? '✓' : null} />)}</div>
          </section>
        )}

        {lib?.scanned_at && <div className="cr-note">Scanned {new Date(lib.scanned_at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · ⟳ after new downloads</div>}
      </div>

      {open && (
        <div className="cr-sheet" onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="cr-panel">
            <div className="cr-pHead" style={bg(dArt.backdrop || dArt.poster)}>
              <div className="cr-shade" />
              <button type="button" className="cr-x" onClick={() => setOpen(null)} aria-label="Close">✕</button>
              <h2>{detail ? `📁 ${detail.title}` : open.item.title}</h2>
              <div className="cr-meta">{[dArt.year || open.item.year, (dArt.genres || []).slice(0, 3).join(' · ')].filter(Boolean).join('  ·  ')}</div>
            </div>
            {(detail || open.type === 'movie') && (
              <div className="cr-pad" style={{ paddingBottom: 0 }}>
                <button type="button" className="cr-btnG dark" onClick={() => openTrailer(detail ? detail.title : open.item.title, detail ? '' : String(open.item.year || ''))}>{trailerLabel}</button>
                {dArt.next?.airdate && <span className="cr-meta" style={{ marginLeft: 10 }}>Next: S{String(dArt.next.season).padStart(2, '0')}E{String(dArt.next.number).padStart(2, '0')} · {dayLabel(dArt.next.airdate)}</span>}
              </div>
            )}
            {detail ? (
              <>
                <div className="cr-tabs">{detail.seasons.map((n) => <button type="button" key={n} className={n === dSeason ? 'on' : ''} onClick={() => setSeason(n)}>Season {n}</button>)}</div>
                {(() => { const u = upNext(detail, prog, dArt); return u.missing && !u.next ? <div className="cr-miss">Next up is {u.missing}: not on your phone yet.</div> : null; })()}
                <div className="cr-eps">
                  {detail.episodes.filter((e) => e.season === dSeason).map((e) => {
                    const c = epCode(e.season, e.episode); const done = isPlayed(prog, e);
                    return (
                      <button type="button" key={e.key} className="cr-epRow" onClick={() => play(e)}>
                        <div className="cr-thumb" style={bg(dArt.stills?.[c] || dArt.backdrop)}>{done ? <em>✓</em> : <em>▶</em>}</div>
                        <div className="cr-epT"><b>{e.episode}. {dArt.names?.[c] || `Episode ${e.episode}`}</b><small>{[mins(e.duration), gb(e.size)].filter(Boolean).join(' · ')}</small></div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : open.type === 'sug' ? (
              <div className="cr-pad">
                {(dArt.summary || open.item.why) && <p className="cr-sum">{open.item.because ? <b>Because you like {open.item.because}. </b> : null}{open.item.why || dArt.summary}</p>}
                <div className="cr-btns">
                  <button type="button" className="cr-btnG dark" onClick={() => openTrailer(open.item.title, open.item.year ? String(open.item.year) : '')}>{trailerLabel}</button>
                  <button type="button" className="cr-btnW" onClick={() => react(open.item.title, prog.feedback?.[open.item.title] === 'want' ? null : 'want')}>{prog.feedback?.[open.item.title] === 'want' ? '✓ On your list' : '＋ Want'}</button>
                  <button type="button" className="cr-btnG dark" onClick={() => react(open.item.title, 'seen')}>Seen it</button>
                  <button type="button" className="cr-btnG dark" onClick={() => react(open.item.title, 'no')}>Not for me</button>
                </div>
              </div>
            ) : (
              <div className="cr-pad">
                {dArt.summary && <p className="cr-sum">{dArt.summary}</p>}
                <div className="cr-btns"><button type="button" className="cr-btnW" onClick={() => play(open.item)}>▶ Play</button><span className="cr-meta">{[mins(open.item.duration), gb(open.item.size)].filter(Boolean).join(' · ')}</span></div>
              </div>
            )}
          </div>
        </div>
      )}

      {trailer && (
        <div className="cr-trailer" onClick={() => setTrailer(null)}>
          <div className="cr-tBox" onClick={(e) => e.stopPropagation()}>
            {trailer.loading && <div className="cr-note">Finding the {trailer.title} trailer…</div>}
            {!trailer.loading && !trailer.id && <div className="cr-note">No trailer found for {trailer.title}.</div>}
            {trailer.id && <iframe title={`${trailer.title} trailer`} src={trailerSrc(trailer.id, { wifi: trailer.wifi })} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />}
            <div className="cr-tBar"><span>{trailer.title} · {trailer.wifi ? 'Wi-Fi, HD' : 'Mobile data: lowest quality, about 3-5 MB'}</span><button type="button" onClick={() => setTrailer(null)}>✕</button></div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .cr-trailer { position: fixed; inset: 0; z-index: 400; background: rgba(0,0,0,0.92); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .cr-tBox { width: 100%; max-width: 900px; }
        .cr-tBox iframe { width: 100%; aspect-ratio: 16 / 9; border: 0; border-radius: 12px; background: #000; }
        .cr-tBar { display: flex; align-items: center; gap: 10px; margin-top: 10px; color: #8e8e93; font-size: 12.5px; }
        .cr-tBar span { flex: 1; }
        .cr-tBar button { border: 0; width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.12); color: #fff; font-size: 14px; cursor: pointer; }
        .cr-date { left: 6px !important; right: auto !important; top: 6px; bottom: auto !important; width: auto !important; height: auto !important; padding: 3px 7px; border-radius: 6px !important; background: #e50914 !important; color: #fff !important; font-size: 10.5px !important; font-weight: 800; }
        .cr { background: #000; color: #f5f5f7; min-height: 100vh; padding-bottom: calc(150px + env(safe-area-inset-bottom)); font-family: -apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif; }
        .cr-top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: rgba(0,0,0,0.6); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); }
        .cr-top h1 { font-size: 21px; font-weight: 700; letter-spacing: -0.4px; margin: 0; flex: 1; white-space: nowrap; }
        .cr-pill { border: 0; font-family: inherit; cursor: pointer; font-size: 12px; font-weight: 600; padding: 6px 11px; border-radius: 999px; background: rgba(255,255,255,0.1); color: #d1d1d6; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
        .cr-pill.live { background: rgba(48,209,88,0.16); color: #30d158; }
        .cr-pill i { width: 7px; height: 7px; border-radius: 50%; background: #30d158; box-shadow: 0 0 8px #30d158; }
        .cr-scan { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,0.1); color: #fff; text-decoration: none; font-size: 17px; flex-shrink: 0; }
        .cr-hero { position: relative; height: 56vh; min-height: 320px; background: #111 center top / cover no-repeat; display: flex; align-items: flex-end; }
        .cr-shade { position: absolute; inset: 0; background: linear-gradient(to top, #000 2%, rgba(0,0,0,0.7) 32%, rgba(0,0,0,0.1) 65%, rgba(0,0,0,0.3)); pointer-events: none; }
        .cr-heroIn { position: relative; padding: 0 16px 20px; width: 100%; }
        .cr-kick { font-size: 11px; font-weight: 700; letter-spacing: 1.4px; color: rgba(255,255,255,0.7); }
        .cr-hero h2 { font-size: 34px; line-height: 1.05; font-weight: 800; letter-spacing: -0.8px; margin: 4px 0 6px; }
        .cr-meta { font-size: 12.5px; color: rgba(255,255,255,0.7); }
        .cr-btns { display: flex; gap: 10px; margin-top: 14px; align-items: center; flex-wrap: wrap; }
        .cr-btnW { background: #f5f5f7; color: #000 !important; border: 0; border-radius: 10px; padding: 11px 20px; font-size: 15px; font-weight: 700; text-decoration: none; display: inline-block; cursor: pointer; font-family: inherit; }
        .cr-btnG { background: rgba(255,255,255,0.18); color: #fff; border: 0; border-radius: 10px; padding: 11px 16px; font-size: 15px; font-weight: 600; backdrop-filter: blur(20px); cursor: pointer; font-family: inherit; }
        .cr-btnG.dark { background: rgba(255,255,255,0.1); }
        .cr-row { margin-top: 24px; }
        .cr-row h3 { font-size: 19px; font-weight: 700; letter-spacing: -0.3px; margin: 0 16px 10px; }
        .cr-rowHead { display: flex; align-items: center; justify-content: space-between; padding-right: 16px; }
        .cr-chip { border: 0; background: rgba(255,255,255,0.1); color: #d1d1d6; border-radius: 999px; width: 32px; height: 32px; font-size: 15px; cursor: pointer; margin-bottom: 10px; }
        .cr-scroll { display: flex; gap: 12px; overflow-x: auto; padding: 0 16px 4px; scroll-snap-type: x mandatory; scrollbar-width: none; }
        .cr-scroll::-webkit-scrollbar { display: none; }
        .cr-poster, .cr-ep, .cr-folder, .cr-epRow { all: unset; box-sizing: border-box; cursor: pointer; -webkit-tap-highlight-color: transparent; }
        .cr-poster { flex: 0 0 112px; width: 112px; scroll-snap-align: start; }
        .cr-ep { flex: 0 0 240px; width: 240px; scroll-snap-align: start; }
        .cr-folder { flex: 0 0 132px; width: 132px; scroll-snap-align: start; position: relative; padding-top: 10px; }
        .cr-img { position: relative; width: 100%; aspect-ratio: 2 / 3; border-radius: 10px; background: #1c1c1e center / cover no-repeat; overflow: hidden; display: grid; place-items: center; box-shadow: 0 6px 18px rgba(0,0,0,0.55); transition: transform 0.15s; }
        .cr-img.wide { aspect-ratio: 16 / 9; }
        .cr-img span { padding: 8px; text-align: center; font-weight: 700; font-size: 13px; color: #8e8e93; }
        .cr-img em { position: absolute; right: 6px; bottom: 6px; font-style: normal; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: rgba(0,0,0,0.65); font-size: 11px; color: #30d158; }
        .cr-poster:active .cr-img, .cr-ep:active .cr-img, .cr-folder:active .cr-fbody { transform: scale(0.96); }
        .cr-fade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.75), transparent 55%); }
        .cr-code { position: absolute; left: 10px; bottom: 8px; font-size: 13px; font-weight: 800; letter-spacing: 0.3px; }
        .cr-play { position: absolute; right: 10px; bottom: 8px; width: 30px; height: 30px; border-radius: 50%; background: rgba(255,255,255,0.92); color: #000; display: grid; place-items: center; font-size: 12px; }
        .cr-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(255,255,255,0.25); }
        .cr-bar i { display: block; height: 100%; background: #e50914; border-radius: 0 2px 2px 0; }
        .cr-ep .cr-code { bottom: 12px; }
        .cr-heroBar { display: flex; align-items: center; gap: 10px; margin-top: 12px; max-width: 320px; }
        .cr-heroBar .cr-bar { position: relative; flex: 1; border-radius: 2px; overflow: hidden; }
        .cr-heroBar span { font-size: 12px; color: rgba(255,255,255,0.75); white-space: nowrap; }
        .cr-t { margin-top: 7px; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cr-s { font-size: 11.5px; color: #8e8e93; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cr-s.warn { color: #ff9f0a; }
        .cr-tab { position: absolute; top: 0; left: 8px; width: 46%; height: 16px; border-radius: 8px 8px 0 0; background: #3a3a3c; }
        .cr-fbody { position: relative; border-radius: 12px; padding: 6px; background: linear-gradient(180deg, #3a3a3c, #2c2c2e); box-shadow: 0 8px 22px rgba(0,0,0,0.55); transition: transform 0.15s; }
        .cr-fbody .cr-img { border-radius: 8px; box-shadow: none; }
        .cr-fcount { position: absolute; left: 12px; bottom: 12px; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); }
        .cr-note { font-size: 11.5px; color: #636366; text-align: center; margin: 28px 16px 0; }
        .cr-empty { text-align: center; padding: 70px 24px; }
        .cr-empty .big { font-size: 54px; }
        .cr-empty h2 { font-size: 24px; margin: 10px 0 8px; letter-spacing: -0.5px; }
        .cr-empty p { color: #8e8e93; font-size: 14px; line-height: 1.5; max-width: 380px; margin: 0 auto 20px; }
        .cr-sheet { position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); display: flex; align-items: flex-end; justify-content: center; }
        .cr-panel { width: 100%; max-width: 720px; max-height: 92vh; padding-bottom: env(safe-area-inset-bottom); overflow-y: auto; background: #1c1c1e; color: #f5f5f7; border-radius: 18px 18px 0 0; font-family: -apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif; }
        .cr-pHead { position: relative; height: 220px; background: #2c2c2e center / cover; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 16px 14px; }
        .cr-pHead h2, .cr-pHead .cr-meta { position: relative; }
        .cr-pHead h2 { font-size: 24px; font-weight: 800; margin: 0 0 4px; letter-spacing: -0.5px; }
        .cr-x { position: absolute; top: 12px; right: 12px; z-index: 2; width: 32px; height: 32px; border-radius: 50%; border: 0; background: rgba(0,0,0,0.55); color: #fff; font-size: 14px; cursor: pointer; }
        .cr-tabs { display: flex; gap: 8px; padding: 14px 16px 4px; overflow-x: auto; }
        .cr-tabs button { border: 0; border-radius: 999px; padding: 7px 14px; font-size: 13px; font-weight: 600; background: rgba(255,255,255,0.08); color: #d1d1d6; white-space: nowrap; cursor: pointer; font-family: inherit; }
        .cr-tabs button.on { background: #f5f5f7; color: #000; }
        .cr-miss { margin: 8px 16px 0; font-size: 12.5px; color: #ff9f0a; }
        .cr-eps { padding: 6px 16px 40px; display: grid; gap: 12px; }
        .cr-epRow { display: flex; gap: 12px; align-items: center; width: 100%; }
        .cr-thumb { position: relative; flex: 0 0 132px; aspect-ratio: 16 / 9; border-radius: 8px; background: #2c2c2e center / cover; }
        .cr-thumb em { position: absolute; inset: 0; margin: auto; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: rgba(0,0,0,0.55); font-style: normal; font-size: 12px; }
        .cr-epT { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .cr-epT b { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cr-epT small { font-size: 12px; color: #8e8e93; }
        .cr-pad { padding: 14px 16px 24px; }
        .cr-sum { font-size: 14px; line-height: 1.5; color: #d1d1d6; margin: 0; }
        .cr-sum b { color: #fff; }
        @media (min-width: 900px) { .cr-poster { flex-basis: 150px; width: 150px; } .cr-folder { flex-basis: 170px; width: 170px; } .cr-ep { flex-basis: 320px; width: 320px; } .cr-hero h2 { font-size: 46px; } }
      `}</style>
    </Layout>
  );
}
