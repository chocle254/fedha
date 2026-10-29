import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { connection } from '../lib/chill';
import { getSignals, saveSignal, rank, fetchCandidates, withTrailers, takePrefetched } from '../lib/reels';
import { getProgress, setFeedback } from '../lib/chill';
import { useMusic } from '../context/MusicContext';

// Chill Room → Reels: full-screen trailers, swipe up for the next one (lib/reels.js ranks them like Instagram Reels).
// Data: on Wi-Fi the current trailer plays in HD and the next 3 are ready; on mobile data nothing loaded before you
// opened Reels, and trailers come 4 at a time at YouTube's lowest quality. Watching, ♥, ＋ and quick skips teach it.
const embed = (id, { wifi, muted }) => `https://www.youtube-nocookie.com/embed/${id}?${new URLSearchParams({ enablejsapi: '1', autoplay: '0', mute: muted ? '1' : '0', playsinline: '1', controls: '0', modestbranding: '1', rel: '0', iv_load_policy: '3', loop: '1', playlist: id, vq: wifi ? 'hd720' : 'tiny' })}`;
const cmd = (frame, func, args = []) => { try { frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch { /* not ready */ } };

export default function Reels() {
  const router = useRouter();
  const music = useMusic();
  const [feed, setFeed] = useState([]);
  const [rest, setRest] = useState([]);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState({});
  const [fb, setFb] = useState({});
  const [net, setNet] = useState({ wifi: false });
  const frames = useRef({});
  const box = useRef(null);
  const watch = useRef({ i: 0, since: Date.now() });
  const busy = useRef(false);

  // First 4 (prefetched on Wi-Fi from the Chill Room, or fetched now).
  useEffect(() => {
    setNet(connection());
    if (music.playing) music.toggle?.(); // one thing at a time
    getProgress().then((p) => setFb(p.feedback || {})).catch(() => {});
    (async () => {
      const pre = await takePrefetched();
      if (pre?.ready?.length) { setSignals(pre.signals); setFeed(pre.ready); setRest(pre.rest); setLoading(false); return; }
      const sig = await getSignals(); setSignals(sig);
      const ranked = rank(await fetchCandidates(sig), sig);
      const first = await withTrailers(ranked, 4);
      setFeed(first.ready); setRest(first.rest); setLoading(false);
    })().catch(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The next 4 when you're 2 from the end.
  const more = useCallback(async () => {
    if (busy.current || !rest.length) return;
    busy.current = true;
    try { const n = await withTrailers(rest, 4); setFeed((f) => [...f, ...n.ready]); setRest(n.rest); } finally { busy.current = false; }
  }, [rest]);
  useEffect(() => { if (feed.length && active >= feed.length - 2) more(); }, [active, feed.length, more]);

  // Which reel is on screen.
  useEffect(() => {
    const el = box.current; if (!el) return undefined;
    const on = () => { const i = Math.round(el.scrollTop / el.clientHeight); if (i !== active) setActive(i); };
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, [active]);

  // Leaving a reel: record how long you watched (under 3 s = skip). Entering one: play it, pause the rest.
  useEffect(() => {
    const prev = watch.current; const item = feed[prev.i];
    if (item && prev.i !== active) {
      const secs = (Date.now() - prev.since) / 1000;
      const s = signals[item.title] || {};
      saveSignal(signals, item, { shown: (s.shown || 0) + 1, watch: Math.max(s.watch || 0, secs), skipped: secs < 3 && !s.liked && !s.saved }).then(setSignals).catch(() => {});
    }
    watch.current = { i: active, since: Date.now() };
    setPaused(false);
    Object.entries(frames.current).forEach(([k, f]) => cmd(f, Number(k) === active ? 'playVideo' : 'pauseVideo'));
  }, [active, feed.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = () => { const m = !muted; setMuted(m); Object.values(frames.current).forEach((f) => cmd(f, m ? 'mute' : 'unMute')); };
  const tapVideo = () => { const f = frames.current[active]; cmd(f, paused ? 'playVideo' : 'pauseVideo'); setPaused(!paused); };
  const like = async (item) => setSignals(await saveSignal(signals, item, { liked: !signals[item.title]?.liked }));
  const save = async (item) => {
    const on = fb[item.title] !== 'want';
    setSignals(await saveSignal(signals, item, { saved: on }));
    const p = await setFeedback({ ...(await getProgress()), feedback: fb }, item.title, on ? 'want' : null).catch(() => null);
    if (p) setFb(p.feedback || {});
  };

  return (
    <div className="rl">
      <Head><title>Reels · Luxe</title></Head>
      <button type="button" className="rl-back" onClick={() => router.push('/chill')} aria-label="Back to the Chill Room">‹</button>
      <div className="rl-net">{net.wifi ? 'Wi-Fi · HD' : 'Mobile data · lowest quality'}</div>
      {loading && <div className="rl-msg">Finding trailers for you…</div>}
      {!loading && !feed.length && <div className="rl-msg">No trailers found right now. Try again in a bit.</div>}
      <div className="rl-feed" ref={box}>
        {feed.map((x, i) => {
          const near = i >= active - 1 && i <= active + 3; // the one on screen + the next 3 are loaded, nothing else
          const s = signals[x.title] || {};
          return (
            <section key={`${x.title}${i}`} className="rl-item" style={x.poster ? { '--poster': `url("${x.poster}")` } : undefined}>
              <div className="rl-bg" />
              {near && (
                <iframe
                  ref={(el) => { if (el) frames.current[i] = el; else delete frames.current[i]; }}
                  title={`${x.title} trailer`}
                  src={embed(x.trailer, { wifi: net.wifi, muted })}
                  allow="autoplay; encrypted-media"
                  onLoad={(e) => { if (i === active) { cmd(e.currentTarget, 'playVideo'); if (!muted) cmd(e.currentTarget, 'unMute'); } }}
                />
              )}
              <button type="button" className="rl-tap" onClick={tapVideo} aria-label={paused ? 'Play' : 'Pause'}>{i === active && paused && <span>▶</span>}</button>
              <div className="rl-info">
                <div className="rl-why">{x.why || (x.src === 'trending' ? 'Trending now' : x.src === 'new' ? 'New this week' : 'For you')}</div>
                <h2>{x.title}</h2>
                <div className="rl-meta">{[x.year, x.type === 'movie' ? 'Movie' : 'Series', (x.genres || []).slice(0, 2).join(' · ')].filter(Boolean).join('  ·  ')}</div>
              </div>
              <div className="rl-rail">
                <button type="button" className={s.liked ? 'on' : ''} onClick={() => like(x)} aria-label="Like">{s.liked ? '♥' : '♡'}<small>Like</small></button>
                <button type="button" className={fb[x.title] === 'want' ? 'on' : ''} onClick={() => save(x)} aria-label="Want to watch">{fb[x.title] === 'want' ? '✓' : '＋'}<small>My list</small></button>
                <button type="button" onClick={toggleMute} aria-label={muted ? 'Sound on' : 'Mute'}>{muted ? '🔇' : '🔊'}<small>{muted ? 'Muted' : 'Sound'}</small></button>
              </div>
            </section>
          );
        })}
      </div>
      <style jsx global>{`
        .rl { position: fixed; inset: 0; background: #000; color: #fff; z-index: 500; font-family: -apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif; }
        .rl-feed { height: 100%; overflow-y: scroll; scroll-snap-type: y mandatory; scrollbar-width: none; }
        .rl-feed::-webkit-scrollbar { display: none; }
        .rl-item { position: relative; height: 100%; scroll-snap-align: start; scroll-snap-stop: always; display: flex; align-items: center; overflow: hidden; }
        .rl-bg { position: absolute; inset: -40px; background: var(--poster, #111) center / cover; filter: blur(40px) brightness(0.45); }
        .rl-item iframe { position: relative; width: 100%; aspect-ratio: 16 / 9; border: 0; pointer-events: none; }
        .rl-tap { all: unset; position: absolute; inset: 0; display: grid; place-items: center; cursor: pointer; }
        .rl-tap span { width: 70px; height: 70px; border-radius: 50%; background: rgba(0,0,0,0.5); display: grid; place-items: center; font-size: 26px; }
        .rl-info { position: absolute; left: 16px; right: 84px; bottom: calc(28px + env(safe-area-inset-bottom)); pointer-events: none; text-shadow: 0 2px 12px rgba(0,0,0,0.8); }
        .rl-why { display: inline-block; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,0.18); backdrop-filter: blur(10px); }
        .rl-info h2 { margin: 8px 0 4px; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.1; }
        .rl-meta { font-size: 13px; color: rgba(255,255,255,0.8); }
        .rl-rail { position: absolute; right: 12px; bottom: calc(40px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 18px; }
        .rl-rail button { all: unset; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 28px; text-shadow: 0 2px 10px rgba(0,0,0,0.7); }
        .rl-rail button.on { color: #ff375f; }
        .rl-rail small { font-size: 11px; font-weight: 600; color: #fff; }
        .rl-back { position: fixed; top: calc(12px + env(safe-area-inset-top)); left: 12px; z-index: 2; width: 40px; height: 40px; border-radius: 50%; border: 0; background: rgba(0,0,0,0.45); color: #fff; font-size: 26px; line-height: 1; cursor: pointer; }
        .rl-net { position: fixed; top: calc(20px + env(safe-area-inset-top)); right: 14px; z-index: 2; font-size: 11.5px; font-weight: 700; padding: 5px 10px; border-radius: 999px; background: rgba(0,0,0,0.45); }
        .rl-msg { position: fixed; inset: 0; display: grid; place-items: center; color: #8e8e93; font-size: 14px; }
      `}</style>
    </div>
  );
}
