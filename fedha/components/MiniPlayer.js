import { useRouter } from 'next/router';
import { useMusic } from '../context/MusicContext';

// The music that's playing, as one small pill in the bottom-right corner above the nav bar (not a full-width bar):
// artwork (or YouTube's tiny player, which MusicContext places in the same spot), play/pause, and ✕ to stop.
// Tap the artwork to open the Music Room. Hidden in the Music Room itself.
export default function MiniPlayer() {
  const { track, playing, toggle, stop, time } = useMusic();
  const router = useRouter();
  if (!track || router.pathname === '/music') return null;
  const yt = track.source === 'yt';
  const pct = time.dur ? (time.cur / time.dur) * 100 : 0;
  const btn = { all: 'unset', cursor: 'pointer', width: 36, height: 36, display: 'grid', placeItems: 'center', fontSize: 16, color: '#fff', borderRadius: '50%' };
  return (
    <div style={{ position: 'fixed', right: 10, bottom: 'calc(78px + env(safe-area-inset-bottom))', zIndex: 45, height: 62, display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px 0 4px', borderRadius: 14, background: 'rgba(28,28,30,0.94)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
      <button type="button" onClick={stop} aria-label="Stop music" style={btn}>✕</button>
      <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} style={{ ...btn, fontSize: 18 }}>{playing ? '❚❚' : '▶'}</button>
      {/* artwork slot: the YouTube player sits exactly here when a popular song plays */}
      <button type="button" onClick={() => router.push('/music')} aria-label={`Open ${track.title}`} style={{ all: 'unset', cursor: 'pointer', width: 88, height: 50, borderRadius: 10, background: yt ? 'transparent' : `#2c2c2e center / cover url("${track.art || ''}")`, position: 'relative', zIndex: 47 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'rgba(255,255,255,0.12)' }}><div style={{ width: `${pct}%`, height: '100%', background: '#fff' }} /></div>
    </div>
  );
}
