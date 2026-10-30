import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { connection } from '../lib/chill';
import { getSignals, applySignal, persistSignals, flushSignals, rank, fetchCandidates, withTrailers, takePrefetched } from '../lib/reels';
import { getProgress, setFeedback } from '../lib/chill';
import { useMusic } from '../context/MusicContext';

// Chill Room → Reels: full-screen trailers, swipe up for the next one. lib/reels.js ranks them like TikTok,
// Instagram and Facebook Reels combined; a trailer you've seen never comes back, and the queue re-ranks as you swipe.
// Data: on Wi-Fi the current trailer plays in HD and the next 5 load one after another: each plays muted until
// YouTube has buffered a few seconds, waits at 0:00, then the next one further ahead starts loading. The last 3
// stay loaded too, so scrolling back is instant. The thumbnail shows until the video is actually playing.
// On mobile data nothing loaded before you opened Reels, only the next 3 are prepared, trailers come 4 at a time
// at YouTube's lowest quality. Watching, ♥, ＋ and quick skips teach it.
const AHEAD_WIFI = 5;  // Wi-Fi: trailers kept loaded ahead of the one on screen
const BEHIND_WIFI = 3; // and behind it, so scrolling back doesn't reload
const thumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
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
  const activeRef = useRef(0);
  activeRef.current = active;
  const [upTo, setUpTo] = useState(1); // Wi-Fi: furthest trailer allowed to load (grows one at a time)
  const [live, setLive] = useState(-1); // the reel on screen that's really playing (thumbnail hides then)
  const warm = useRef({}); // index -> 'warming' | 'done'
  const sigRef = useRef({}); // latest signals (saves chain on this, never on a stale copy)
  const feedRef = useRef([]);
  feedRef.current = feed;

  // Save a signal and re-rank what's queued straight away, so taste adapts within the session (TikTok-style).
  const record = useCallback(async (item, patch) => {
    const next = applySignal(sigRef.current, item, patch);
    sigRef.current = next; setSignals(next);
    setRest((r) => rank(r, next));
    persistSignals(next);
    return next;
  }, []);
  // Leaving a reel (swipe, or leaving the page): it counts as shown (never comes back) with the seconds watched.
  const leave = useCallback((i, since) => {
    const item = feedRef.current[i]; if (!item) return;
    const secs = (Date.now() - since) / 1000;
    const s = sigRef.current[item.title] || {};
    record(item, { shown: (s.shown || 0) + 1, watch: Math.max(s.watch || 0, secs), skipped: secs < 3 && !s.liked && !s.saved }).catch(() => {});
  }, [record]);

  // First 4 (prefetched on Wi-Fi from the Chill Room, or fetched now).
  useEffect(() => {
    setNet(connection());
    if (music.playing) music.toggle?.(); // one thing at a time
    getProgress().then((p) => setFb(p.feedback || {})).catch(() => {});
    (async () => {
      const pre = await takePrefetched();
      if (pre?.ready?.length) { sigRef.current = pre.signals; setSignals(pre.signals); setFeed(pre.ready); setRest(pre.rest); setLoading(false); return; }
      const sig = await getSignals(); sigRef.current = sig; setSignals(sig);
      const ranked = rank(await fetchCandidates(sig), sig);
      const first = await withTrailers(ranked, connection().wifi ? 8 : 4);
      setFeed(first.ready); setRest(first.rest); setLoading(false);
    })().catch(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The next 4 when you're 2 from the end (on Wi-Fi: while 6 are still left, so 4 are always buffered ahead).
  // When the queue runs low, fetch fresh candidates (everything shown so far is excluded) so the feed never ends.
  const more = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      let queue = rest;
      if (queue.length < 6) {
        const inFeed = new Set(feedRef.current.map((x) => x.title));
        const fresh = rank(await fetchCandidates(sigRef.current), sigRef.current).filter((x) => !inFeed.has(x.title) && !queue.some((q) => q.title === x.title));
        queue = [...queue, ...fresh];
      }
      if (!queue.length) return;
      const n = await withTrailers(queue, 4);
      setFeed((f) => [...f, ...n.ready.filter((x) => !f.some((y) => y.title === x.title))]); setRest(n.rest);
    } finally { busy.current = false; }
  }, [rest]);
  useEffect(() => { if (feed.length && active >= feed.length - (net.wifi ? AHEAD_WIFI + 2 : 2)) more(); }, [active, feed.length, more, net.wifi]);

  // Wi-Fi loader: the furthest one loads next, one at a time, never more than AHEAD_WIFI ahead.
  useEffect(() => { setUpTo((u) => Math.max(u, active + 1)); setLive(-1); }, [active]);
  const warmed = useCallback((i) => {
    if (warm.current[i] === 'done') return;
    warm.current[i] = 'done';
    setUpTo((u) => (i >= u ? Math.min(i + 1, activeRef.current + AHEAD_WIFI) : u));
  }, []);
  // YouTube tells us each player's state (we ask with 'listening' on load): playing on screen hides the thumbnail;
  // a warming one that has played 3 s is paused at 0:00 and the next one starts loading.
  useEffect(() => {
    const on = (e) => {
      if (!/youtube/.test(e.origin)) return;
      let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      const st = d?.event === 'onStateChange' ? d.info : d?.event === 'infoDelivery' ? d.info?.playerState : undefined;
      if (st === undefined) return;
      const i = Number(Object.keys(frames.current).find((k) => frames.current[k]?.contentWindow === e.source));
      if (!Number.isFinite(i)) return;
      const f = frames.current[i];
      if (st === 1 && i === activeRef.current) setLive(i);
      if (st === 1 && i !== activeRef.current && warm.current[i] === 'warming') {
        warm.current[i] = 'stopping';
        setTimeout(() => { if (activeRef.current !== i) { cmd(f, 'pauseVideo'); cmd(f, 'seekTo', [0, true]); } warmed(i); }, 3000);
      }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [warmed]);

  // Which reel is on screen.
  useEffect(() => {
    const el = box.current; if (!el) return undefined;
    const on = () => { const i = Math.round(el.scrollTop / el.clientHeight); if (i !== active) setActive(i); };
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, [active]);

  // Leaving a reel: record how long you watched (under 3 s = skip). Entering one: play it, pause the rest.
  useEffect(() => {
    const prev = watch.current;
    if (prev.i !== active) leave(prev.i, prev.since);
    const moved = prev.i !== active;
    watch.current = moved ? { i: active, since: Date.now() } : prev;
    if (!moved) return; // more trailers arrived: leave the one playing alone
    setPaused(false);
    Object.entries(frames.current).forEach(([k, f]) => {
      if (Number(k) === active) { cmd(f, 'seekTo', [0, true]); if (!muted) cmd(f, 'unMute'); cmd(f, 'playVideo'); } else cmd(f, 'pauseVideo');
    });
  }, [active, feed.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving Reels (back, app switch, closing): the one on screen counts too.
  useEffect(() => {
    const out = () => { if (document.visibilityState === 'hidden') { const w = watch.current; leave(w.i, w.since); watch.current = { i: w.i, since: Date.now() }; flushSignals(); } };
    document.addEventListener('visibilitychange', out);
    return () => { document.removeEventListener('visibilitychange', out); const w = watch.current; leave(w.i, w.since); flushSignals(); };
  }, [leave]);

  const toggleMute = () => { const m = !muted; setMuted(m); Object.values(frames.current).forEach((f) => cmd(f, m ? 'mute' : 'unMute')); };
  const tapVideo = () => { const f = frames.current[active]; cmd(f, paused ? 'playVideo' : 'pauseVideo'); setPaused(!paused); };
  const like = (item) => record(item, { liked: !sigRef.current[item.title]?.liked }).catch(() => {});
  const save = async (item) => {
    const on = fb[item.title] !== 'want';
    await record(item, { saved: on }).catch(() => {});
    const p = await setFeedback({ ...(await getProgress()), feedback: fb }, item.title, on ? 'want' : null, item).catch(() => null);
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
          const near = net.wifi
            ? i >= active - BEHIND_WIFI && i <= Math.min(upTo, active + AHEAD_WIFI)
            : i >= active - 1 && i <= active + 3; // mobile data: on screen + the next 3, nothing else
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
                  onLoad={(e) => {
                    const f = e.currentTarget;
                    try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: i, channel: 'widget' }), '*'); } catch { /* not ready */ }
                    if (i === activeRef.current) { cmd(f, 'playVideo'); if (!muted) cmd(f, 'unMute'); warmed(i); return; }
                    if (!net.wifi || warm.current[i]) { warmed(i); return; }
                    // Wi-Fi: buffer it now (YouTube only downloads while playing): play muted; once it's playing,
                    // 3 s later it's paused at 0:00 (see the message listener). Fallback after 9 s.
                    warm.current[i] = 'warming'; cmd(f, 'mute'); cmd(f, 'playVideo');
                    setTimeout(() => { if (warm.current[i] === 'warming') { if (activeRef.current !== i) { cmd(f, 'pauseVideo'); cmd(f, 'seekTo', [0, true]); } warmed(i); } }, 9000);
                  }}
                />
              )}
              {x.trailer && <div className={`rl-thumb ${live === i ? 'off' : ''}`} style={{ backgroundImage: `url("${thumb(x.trailer)}")` }} />}
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
        .rl-thumb { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); aspect-ratio: 16 / 9; background: #000 center / cover; transition: opacity 0.35s; pointer-events: none; }
        .rl-thumb.off { opacity: 0; }
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
