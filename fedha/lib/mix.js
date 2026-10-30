// Mix: how one song turns into the next (like Spotify's Mix editor). A transition = a style + a length in bars.
// The length follows the outgoing song's tempo (Deezer's BPM; 120 if unknown), so 8 bars is ~15 s at 126 bpm.
// YouTube only lets us move each player's volume, so every style is a pair of volume curves (out, in) over the
// transition, k going 0 → 1. Settings: localStorage 'luxe_mix' = { preset, bars }, plus saved pairs
// ('luxe_mix_pairs', "fromId>toId" → { preset, bars }, max 200) for transitions you edited by hand.

const smooth = (k) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k)));

export const PRESETS = {
  fade: { label: 'Fade', about: 'Smooth crossfade: one fades out as the other fades in.', curve: (k) => [1 - smooth(k), smooth(k)] },
  rise: { label: 'Rise', about: 'The next song rises in under this one, then takes over on the last beat.', curve: (k) => [k < 0.97 ? 1 : 0, Math.min(1, k * 2)] },
  blend: { label: 'Blend', about: 'Both play together and slowly trade places.', curve: (k) => [1 - 0.75 * smooth(k) - (k > 0.97 ? 0.25 : 0), 0.25 + 0.75 * smooth(k)] },
  wave: { label: 'Wave', about: 'The next song comes in over the first half, this one leaves over the second.', curve: (k) => [k < 0.5 ? 1 : 1 - (k - 0.5) * 2, Math.min(1, k * 2)] },
  melt: { label: 'Melt', about: 'A long, soft overlap that melts one song into the other.', curve: (k) => [1 - k * k, 1 - (1 - k) * (1 - k)] },
  slam: { label: 'Slam', about: 'No fade: a clean cut straight into the next song.', curve: (k) => (k < 0.98 ? [1, 0] : [0, 1]) },
};
export const PRESET_KEYS = ['auto', ...Object.keys(PRESETS), 'off'];
export const PRESET_LABEL = { auto: '✨ Auto', off: 'Off', ...Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.label])) };
export const BARS = [2, 4, 8, 16];

const DEFAULT = { preset: 'auto', bars: 8 };
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

export const getMix = () => ({ ...DEFAULT, ...read('luxe_mix', {}) });
export const setMix = (v) => write('luxe_mix', { ...getMix(), ...v });
const pairKey = (a, b) => `${a?.id}>${b?.id}`;
export const getPair = (a, b) => read('luxe_mix_pairs', {})[pairKey(a, b)] || null;
export function setPair(a, b, v) {
  const all = read('luxe_mix_pairs', {});
  if (v) all[pairKey(a, b)] = { ...v, at: Date.now() }; else delete all[pairKey(a, b)];
  const kept = Object.fromEntries(Object.entries(all).sort((x, y) => (y[1].at || 0) - (x[1].at || 0)).slice(0, 200));
  write('luxe_mix_pairs', kept);
}

export const barsToSecs = (bars, bpm) => (bars * 4 * 60) / (bpm > 40 ? bpm : 120);

// Auto picks like a DJ would: close tempos overlap (Blend / Wave), a gap fades, very different tempos cut.
function autoPick(a, b, bars) {
  const x = a?.bpm; const y = b?.bpm;
  if (!(x > 40) || !(y > 40)) return { preset: 'fade', bars };
  const gap = Math.abs(x - y) / Math.max(x, y);
  if (gap <= 0.03) return { preset: (Math.round(x + y) % 2) ? 'wave' : 'blend', bars };
  if (gap <= 0.08) return { preset: 'fade', bars: Math.min(bars, 8) };
  if (gap <= 0.15) return { preset: 'melt', bars: Math.min(bars, 4) };
  return { preset: 'slam', bars: 2 };
}

// The transition from song a into song b: { preset, bars, secs, curve, auto }. secs 0 = no blend.
export function planMix(a, b, mix = getMix()) {
  const saved = b ? getPair(a, b) : null;
  let p = saved || { preset: mix.preset, bars: mix.bars };
  const auto = p.preset === 'auto';
  if (p.preset === 'off') return { preset: 'off', bars: p.bars, secs: 0, curve: null, auto: false, saved: !!saved };
  if (auto) p = autoPick(a, b, p.bars);
  const preset = PRESETS[p.preset] ? p.preset : 'fade';
  let secs = barsToSecs(p.bars, a?.bpm);
  const dur = Number(a?.duration) || 0;
  secs = Math.max(1.5, Math.min(secs, 32, dur ? dur * 0.3 : 32));
  return { preset, bars: p.bars, secs: Math.round(secs * 10) / 10, curve: PRESETS[preset].curve, auto, saved: !!saved };
}

// SVG path points for the preview (out on top half, in on bottom half), like the Mix editor's lines.
export function curvePoints(preset, w = 300, h = 120, steps = 60) {
  const c = PRESETS[preset]?.curve; if (!c) return { out: '', in: '' };
  const half = h / 2 - 6; const out = []; const inn = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps; const [o, n] = c(k); const x = (k * w).toFixed(1);
    out.push(`${x},${(6 + (1 - o) * (half - 6)).toFixed(1)}`);
    inn.push(`${x},${(h / 2 + 6 + (1 - n) * (half - 6)).toFixed(1)}`);
  }
  return { out: out.join(' '), in: inn.join(' ') };
}
