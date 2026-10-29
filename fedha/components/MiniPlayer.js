import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMusic } from '../context/MusicContext';

// The music that's playing, on every page except the Music Room itself: art, title, play/pause, next.
export default function MiniPlayer() {
  const { track, playing, toggle, next, time } = useMusic();
  const { pathname } = useRouter();
  if (!track || pathname === '/music') return null;
  const pct = time.dur ? (time.cur / time.dur) * 100 : 0;
  return (
    <div style={{ position: 'fixed', left: 10, right: 10, bottom: 'calc(72px + env(safe-area-inset-bottom))', zIndex: 40, borderRadius: 14, background: 'rgba(28,28,30,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 10px 30px rgba(0,0,0,0.45)', overflow: 'hidden', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
        <Link href="/music" style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textDecoration: 'none', color: '#f5f5f7' }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: `#2c2c2e center / cover url("${track.art || ''}")`, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
            <div style={{ fontSize: 12, color: '#8e8e93', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artist}</div>
          </div>
        </Link>
        <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} style={{ all: 'unset', cursor: 'pointer', width: 36, height: 36, display: 'grid', placeItems: 'center', fontSize: 20, color: '#fff' }}>{playing ? '❚❚' : '▶'}</button>
        <button type="button" onClick={next} aria-label="Next" style={{ all: 'unset', cursor: 'pointer', width: 32, height: 36, display: 'grid', placeItems: 'center', fontSize: 18, color: '#fff' }}>⏭</button>
      </div>
      <div style={{ height: 2, background: 'rgba(255,255,255,0.12)' }}><div style={{ width: `${pct}%`, height: '100%', background: '#fff' }} /></div>
    </div>
  );
}
