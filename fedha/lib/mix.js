// Mix: how one song turns into the next, picked automatically like a DJ (nothing to set).
// Tempos come from Deezer's BPM. YouTube only lets us move each player's volume, so every style is a pair of
// volume curves (out, in) over the transition, k going 0 → 1. The length is in bars of the outgoing song's tempo.
// flowOrder() also orders a queue so neighbouring songs have close tempos, so the transitions blend well.

const smooth = (k) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k)));

export const PRESETS = {
  fade: { label: 'Fade', curve: (k) => [1 - smooth(k), smooth(k)] },
  blend: { label: 'Blend', curve: (k) => [1 - 0.75 * smooth(k) - (k > 0.97 ? 0.25 : 0), 0.25 + 0.75 * smooth(k)] },
  wave: { label: 'Wave', curve: (k) => [k < 0.5 ? 1 : 1 - (k - 0.5) * 2, Math.min(1, k * 2)] },
  melt: { label: 'Melt', curve: (k) => [1 - k * k, 1 - (1 - k) * (1 - k)] },
};

export const barsToSecs = (bars, bpm) => (bars * 4 * 60) / (bpm > 40 ? bpm : 120);

// How far apart two tempos are (0 = same). Half and double time count as close (70 bpm sits well with 140).
export function tempoGap(x, y) {
  if (!(x > 40) || !(y > 40)) return null;
  const r = Math.max(x, y) / Math.min(x, y);
  return Math.min(r - 1, r > 1.5 ? Math.abs(r / 2 - 1) : Infinity);
}

// Close tempos overlap for longer (Blend / Wave), a small gap fades, a big gap makes a short fade.
function autoPick(a, b) {
  const gap = tempoGap(a?.bpm, b?.bpm);
  if (gap == null) return { preset: 'fade', bars: 6 };
  if (gap <= 0.03) return { preset: (Math.round(a.bpm + b.bpm) % 2) ? 'wave' : 'blend', bars: 8 };
  if (gap <= 0.08) return { preset: 'fade', bars: 8 };
  if (gap <= 0.15) return { preset: 'melt', bars: 4 };
  return { preset: 'fade', bars: 2 };
}

// The transition from song a into song b: { preset, bars, secs, curve }.
export function planMix(a, b) {
  const p = autoPick(a, b);
  let secs = barsToSecs(p.bars, a?.bpm);
  const dur = Number(a?.duration) || 0;
  secs = Math.max(1.5, Math.min(secs, 20, dur ? dur * 0.25 : 20));
  return { ...p, secs: Math.round(secs * 10) / 10, curve: PRESETS[p.preset].curve };
}

// Order songs so each one flows into the next: starting from `fromBpm`, pick the best tempo match among the next
// few songs (so the list keeps roughly its order, best picks still come early) and avoid the same artist twice
// in a row. bpm(t) gives a song's tempo or null. Songs without a tempo count as an OK match.
export function flowOrder(list, fromBpm, fromArtist, bpm, look = 6) {
  const left = [...list]; const out = [];
  let cur = fromBpm; let artist = fromArtist;
  while (left.length) {
    let best = 0; let bestCost = Infinity;
    for (let i = 0; i < Math.min(look, left.length); i++) {
      const t = left[i];
      const g = tempoGap(cur, bpm(t));
      let cost = g == null ? 0.08 : g;
      if (t.artist && t.artist === artist) cost += 0.2;
      cost += i * 0.005; // a small nudge to keep the original order
      if (cost < bestCost) { bestCost = cost; best = i; }
    }
    const [t] = left.splice(best, 1);
    out.push(t);
    const b = bpm(t); if (b) cur = b;
    artist = t.artist;
  }
  return out;
}
