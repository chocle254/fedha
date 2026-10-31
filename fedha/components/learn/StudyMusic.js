import { useEffect, useRef, useState } from 'react';
import { useMusic } from '../../context/MusicContext';
import { trending, search } from '../../lib/audius';
import { searchTracks } from '../../lib/popular';

// Music while you study, without leaving Study mode. It drives the same player as the Music Room (so whatever
// is playing keeps going, and the queue carries on after the session), plus focus sounds made on the phone
// itself (brown, pink or white noise, rain), which work offline and can sit under the music.
const STATIONS = [
  ['lofi', '🎧 Lo-fi beats', () => trending('Lo-Fi')],
  ['chill', '🌙 Chill / ambient', () => trending('Ambient')],
  ['piano', '🎹 Study piano', () => search('study piano')],
  ['jazz', '☕ Jazz café', () => search('jazz study')],
  ['classical', '🎻 Classical focus', () => search('classical focus')],
  ['afro', '🌍 Afro chill', () => search('afro chill')],
  ['synth', '🌆 Synthwave', () => search('synthwave')],
];
const NOISES = [['brown', '🟤 Brown'], ['pink', '🌸 Pink'], ['white', '⚪ White'], ['rain', '🌧️ Rain']];

// Fills a 4-second buffer with the chosen noise; it loops seamlessly.
function noiseBuffer(ac, kind) {
  const len = ac.sampleRate * 4, buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.35;
      else if (kind === 'brown' || kind === 'rain') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      else { // pink (Paul Kellet's filter)
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.09; b6 = w * 0.115926;
      }
      if (kind === 'rain' && Math.random() < 0.0009) d[i] += (Math.random() - 0.5) * 0.6; // drops
    }
  }
  return buf;
}

export default function StudyMusic({ pauseOnBreak, onPauseOnBreak }) {
  const m = useMusic();
  const [list, setList] = useState(null);
  const [station, setStation] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [noise, setNoise] = useState(null);
  const [vol, setVol] = useState(0.35);
  const ng = useRef(null);

  const play = (l, i = 0) => { m.stopDj?.(); m.playList?.(l, i); };
  const openStation = async ([k, , get]) => {
    setStation(k); setBusy(true); setErr(''); setList(null);
    try { const l = await get(); setList(l); if (l.length) play(l, Math.floor(Math.random() * Math.min(8, l.length))); else setErr('Nothing in that station right now.'); }
    catch { setErr("Couldn't load music right now."); } finally { setBusy(false); }
  };
  const doSearch = async (e) => {
    e.preventDefault(); if (!q.trim()) return;
    setStation(''); setBusy(true); setErr(''); setList(null);
    const [pop, indie] = await Promise.allSettled([searchTracks(q), search(q)]);
    const l = [...(pop.status === 'fulfilled' ? pop.value.slice(0, 15) : []), ...(indie.status === 'fulfilled' ? indie.value.slice(0, 15) : [])];
    setList(l); if (!l.length) setErr('No songs found.'); setBusy(false);
  };

  // Focus noise.
  const stopNoise = () => { try { ng.current?.src.stop(); ng.current?.ac.close(); } catch { /* already stopped */ } ng.current = null; setNoise(null); };
  const startNoise = (kind) => {
    stopNoise();
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const src = ac.createBufferSource(); src.buffer = noiseBuffer(ac, kind); src.loop = true;
      const gain = ac.createGain(); gain.gain.value = vol;
      let node = src;
      if (kind === 'rain') { const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 400; src.connect(f); node = f; }
      node.connect(gain).connect(ac.destination); src.start();
      ng.current = { ac, src, gain }; setNoise(kind);
    } catch { setErr('This phone could not make focus sounds.'); }
  };
  useEffect(() => { if (ng.current) ng.current.gain.gain.value = vol; }, [vol]);
  useEffect(() => () => stopNoise(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const t = m.track;
  return (
    <div>
      <div className="card-2" style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 46, height: 46, borderRadius: 9, flexShrink: 0, background: t?.art ? `#222 center / cover url("${t.art}")` : 'var(--card)', display: 'grid', placeItems: 'center', fontSize: 20 }}>{t?.art ? '' : '🎵'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t ? t.title : 'Nothing playing'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t ? t.artist : 'Pick a station or search a song'}</div>
        </div>
        {t && <>
          <button className="btn-icon" aria-label={m.playing ? 'Pause' : 'Play'} onClick={m.toggle}>{m.playing ? '❚❚' : '▶'}</button>
          <button className="btn-icon" aria-label="Next song" onClick={m.next}>⏭</button>
          <button className="btn-icon" aria-label="Stop music" onClick={m.stop}>✕</button>
        </>}
      </div>
      {m.note && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{m.note}</div>}

      <div className="tab-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '10px 0 8px' }}>
        {STATIONS.map((s) => <button key={s[0]} className={`chip ${station === s[0] ? 'active' : ''}`} disabled={busy} onClick={() => openStation(s)}>{s[1]}</button>)}
        {m.likes?.length > 0 && <button className={`chip ${station === 'likes' ? 'active' : ''}`} onClick={() => { setStation('likes'); setList(m.likes); play(m.likes, 0); }}>❤️ My likes</button>}
      </div>
      <form onSubmit={doSearch} style={{ display: 'flex', gap: 6 }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any song or artist…" />
        <button className="btn-ghost" disabled={busy || !q.trim()}>Search</button>
      </form>
      {busy && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Loading…</div>}
      {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{err}</div>}
      {list?.length > 0 && (
        <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 8 }}>
          {list.slice(0, 30).map((x, i) => (
            <button key={x.id + ':' + i} onClick={() => play(list, i)} style={{ all: 'unset', boxSizing: 'border-box', width: '100%', display: 'flex', gap: 9, alignItems: 'center', padding: '6px 4px', cursor: 'pointer', borderRadius: 8, background: t?.id === x.id ? 'var(--green-dim)' : 'transparent' }}>
              <div style={{ width: 34, height: 34, borderRadius: 6, flexShrink: 0, background: x.art ? `#222 center / cover url("${x.art}")` : 'var(--card-2)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{x.artist}</div>
              </div>
              {t?.id === x.id && <span style={{ fontSize: 12 }}>{m.playing ? '♪' : '❚❚'}</span>}
            </button>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: 0.8, margin: '14px 0 6px' }}>FOCUS SOUNDS (WORK OFFLINE, MIX WITH MUSIC)</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {NOISES.map(([k, l]) => <button key={k} className={`chip ${noise === k ? 'active' : ''}`} onClick={() => (noise === k ? stopNoise() : startNoise(k))}>{l}</button>)}
      </div>
      {noise && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Volume<input type="range" min="0.05" max="1" step="0.05" value={vol} onChange={(e) => setVol(Number(e.target.value))} style={{ flex: 1 }} /></label>}

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, marginTop: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!pauseOnBreak} onChange={(e) => onPauseOnBreak(e.target.checked)} />
        Pause music on breaks, play again when focus starts
      </label>
    </div>
  );
}
