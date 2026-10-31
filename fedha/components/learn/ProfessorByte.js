import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// Professor Byte: the study tutor's body. A glossy robot professor in a graduation cap who lives behind the
// glass of your screen. Drawn in SVG with depth shading and tilted in 3D toward your finger, so he feels like he
// is in there. He blinks, breathes, follows you with his eyes, talks (mouth moves while he speaks) and acts:
// wave, point (at his board), explain, think, shrug, celebrate, laugh, lean in, knock on the glass, facepalm.
// Moods change his eyes, brows, mouth, cheeks and chest light.
const ARMS = { // [left, right] rotation in degrees from hanging down (SVG: positive = clockwise)
  none: [12, -12], point: [14, -112], explain: [62, -62], think: [14, 128], shrug: [70, -70],
  celebrate: [158, -158], wave: [148, -14], lean: [30, -30], knock: [14, -38], laugh: [28, -28], facepalm: [-156, -14],
};
const CHEST = { happy: '#34D399', cheeky: '#F472B6', excited: '#FBBF24', thinking: '#60A5FA', surprised: '#FDE047', serious: '#94A3B8', proud: '#E9D8A6', facepalm: '#F87171' };

function Eye({ x, mood, blink, side }) {
  const c = '#7DF9FF';
  const glow = { filter: 'drop-shadow(0 0 4px rgba(125,249,255,.9))' };
  const wink = mood === 'cheeky' && side === 'r';
  if (blink || mood === 'facepalm') return <rect x={x - 8} y={-40} width="16" height="3" rx="1.5" fill={c} style={glow} />;
  if (wink || mood === 'happy' || mood === 'proud' || mood === 'laugh') return <path d={`M${x - 8} -36 Q${x} -47 ${x + 8} -36`} stroke={c} strokeWidth="3.2" fill="none" strokeLinecap="round" style={glow} />;
  if (mood === 'surprised' || mood === 'excited') return <circle cx={x} cy={-39} r={mood === 'surprised' ? 10 : 9} fill={c} style={glow} />;
  if (mood === 'serious') return <rect x={x - 8} y={-43} width="16" height="8" rx="3" fill={c} style={glow} />;
  return <ellipse cx={x} cy={-39} rx="7.5" ry="9.5" fill={c} style={glow} />;
}

function Mouth({ mood, open }) {
  const c = '#7DF9FF', glow = { filter: 'drop-shadow(0 0 3px rgba(125,249,255,.8))' };
  if (open > 0.08) return <ellipse cx="0" cy="-19" rx={9 - open * 2} ry={1.5 + open * 6} fill={c} opacity=".95" style={glow} />;
  if (mood === 'surprised') return <circle cx="0" cy="-19" r="4" fill="none" stroke={c} strokeWidth="2.6" style={glow} />;
  if (mood === 'facepalm' || mood === 'serious') return <path d="M-9 -18 Q-4 -21 0 -18 Q4 -15 9 -18" stroke={c} strokeWidth="2.6" fill="none" strokeLinecap="round" style={glow} />;
  if (mood === 'cheeky') return <path d="M-9 -19 Q3 -13 11 -22" stroke={c} strokeWidth="2.8" fill="none" strokeLinecap="round" style={glow} />;
  if (mood === 'thinking') return <path d="M-6 -18 L6 -19" stroke={c} strokeWidth="2.6" strokeLinecap="round" style={glow} />;
  return <path d="M-11 -21 Q0 -11 11 -21" stroke={c} strokeWidth="2.8" fill="none" strokeLinecap="round" style={glow} />;
}

export default function ProfessorByte({ mood = 'happy', gesture = 'none', talking = false, thinking = false, look = null, size = 150, onKnock }) {
  const wrap = useRef(null);
  const [blink, setBlink] = useState(false);
  const [open, setOpen] = useState(0);
  const [eyes, setEyes] = useState({ x: 0, y: 0 });
  const [tick, setTick] = useState(0);

  // Blinks every 2-5 s.
  useEffect(() => {
    let t;
    const loop = () => { t = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 130); loop(); }, 2000 + Math.random() * 3000); };
    loop(); return () => clearTimeout(t);
  }, []);
  // Mouth moves while talking.
  useEffect(() => {
    if (!talking) { setOpen(0); return undefined; }
    const t = setInterval(() => setOpen(Math.random() < 0.18 ? 0 : 0.25 + Math.random() * 0.75), 95);
    return () => clearInterval(t);
  }, [talking]);
  // Eyes (and the 3D tilt) follow your finger; a given `look` overrides (e.g. at the board).
  useEffect(() => {
    const move = (e) => {
      const r = wrap.current?.getBoundingClientRect(); if (!r) return;
      const p = e.touches?.[0] || e;
      setEyes({ x: Math.max(-1, Math.min(1, (p.clientX - (r.left + r.width / 2)) / 220)), y: Math.max(-1, Math.min(1, (p.clientY - (r.top + r.height / 3)) / 260)) });
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('touchstart', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('touchstart', move); };
  }, []);
  // Gesture loops (waving, knocking, laughing) re-trigger on a beat.
  useEffect(() => {
    if (!['wave', 'knock', 'laugh', 'explain', 'celebrate'].includes(gesture)) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), gesture === 'knock' ? 340 : 420);
    return () => clearInterval(t);
  }, [gesture]);
  useEffect(() => { if (gesture === 'knock' && tick % 2 === 1 && tick < 6) onKnock?.(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const g = thinking ? 'think' : gesture;
  const lk = thinking ? { x: 0.6, y: -0.7 } : (look || eyes);
  const beat = tick % 2;
  let [la, ra] = ARMS[g] || ARMS.none;
  if (g === 'wave') la += beat ? -22 : 10;
  if (g === 'explain') { la += beat ? 10 : -6; ra -= beat ? 10 : -6; }
  if (g === 'celebrate') { la += beat ? 8 : -8; ra -= beat ? 8 : -8; }
  if (g === 'knock') ra += beat ? -8 : 10;
  if (talking && g === 'none') { la += open * 6; ra -= open * 6; }
  const lean = g === 'lean' || g === 'knock';
  const bounce = g === 'laugh' || g === 'celebrate' ? (beat ? -6 : 0) : 0;
  const headTilt = g === 'think' ? -10 : g === 'shrug' ? 9 : g === 'laugh' ? (beat ? -8 : 4) : mood === 'cheeky' ? 7 : lk.x * 6;
  const m = thinking ? 'thinking' : mood;
  const chest = CHEST[m] || CHEST.happy;
  const spring = { type: 'spring', stiffness: 170, damping: 13 };

  return (
    <div ref={wrap} style={{ width: size, height: size * 1.3, perspective: 700, position: 'relative' }}>
      <motion.div
        animate={{ rotateY: lk.x * 18, rotateX: -lk.y * 10, scale: lean ? 1.18 : 1, y: (lean ? 10 : 0) + bounce }}
        transition={{ type: 'spring', stiffness: 90, damping: 14 }}
        style={{ width: '100%', height: '100%', transformStyle: 'preserve-3d' }}
      >
        <svg viewBox="-100 -130 200 260" style={{ width: '100%', height: '100%', overflow: 'visible' }} aria-label="Professor Byte, your study tutor">
          <defs>
            <radialGradient id="pbHead" cx="35%" cy="28%" r="80%"><stop offset="0" stopColor="#B4F1F4" /><stop offset=".45" stopColor="#2BB6C2" /><stop offset="1" stopColor="#0B4F63" /></radialGradient>
            <radialGradient id="pbBody" cx="35%" cy="25%" r="85%"><stop offset="0" stopColor="#8B9CFF" /><stop offset=".5" stopColor="#4C51BF" /><stop offset="1" stopColor="#1E1B4B" /></radialGradient>
            <linearGradient id="pbVisor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0F172A" /><stop offset="1" stopColor="#020617" /></linearGradient>
            <radialGradient id="pbLimb" cx="30%" cy="30%" r="90%"><stop offset="0" stopColor="#9EE7EC" /><stop offset="1" stopColor="#167A8A" /></radialGradient>
          </defs>
          <motion.ellipse cx="0" cy="122" ry="7" fill="rgba(0,0,0,.45)" animate={{ rx: lean ? 64 : 52 - bounce }} />

          {/* body, breathing */}
          <motion.g animate={{ scaleY: [1, 1.025, 1] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }} style={{ originX: 0.5, originY: 1 }}>
            <rect x="-42" y="28" width="84" height="86" rx="32" fill="url(#pbBody)" />
            <ellipse cx="-16" cy="44" rx="16" ry="7" fill="rgba(255,255,255,.18)" />
            <path d="M-12 30 L0 38 L12 30 L12 44 L0 38 L-12 44 Z" fill="#F43F5E" />
            <circle cx="0" cy="38" r="3.4" fill="#BE123C" />
            <motion.circle cx="0" cy="72" r="9" animate={{ fill: chest, opacity: thinking ? [0.4, 1, 0.4] : 0.95 }} transition={thinking ? { duration: 0.8, repeat: Infinity } : { duration: 0.3 }} style={{ filter: `drop-shadow(0 0 7px ${chest})` }} />
            <circle cx="-3" cy="69" r="2.5" fill="rgba(255,255,255,.7)" />
          </motion.g>

          {/* left arm (his right) */}
          <motion.g animate={{ rotate: la }} transition={spring} style={{ originX: 0.5, originY: 0 }}>
            <rect x="-48" y="40" width="15" height="48" rx="7.5" fill="url(#pbLimb)" />
            <circle cx="-40.5" cy="94" r="11" fill="url(#pbLimb)" />
          </motion.g>
          {/* right arm: the pointing, knocking one */}
          <motion.g animate={{ rotate: ra }} transition={spring} style={{ originX: 0.5, originY: 0 }}>
            <rect x="33" y="40" width="15" height="48" rx="7.5" fill="url(#pbLimb)" />
            <motion.circle cx="40.5" cy="94" fill="url(#pbLimb)" animate={{ r: g === 'knock' ? (beat ? 16 : 13) : 11 }} />
            {g === 'point' && <circle cx="40.5" cy="107" r="4.5" fill="#9EE7EC" />}
          </motion.g>

          {/* head */}
          <motion.g animate={{ rotate: headTilt, y: bounce * 0.4 }} transition={spring} style={{ originX: 0.5, originY: 1 }}>
            <rect x="-7" y="10" width="14" height="22" rx="5" fill="#167A8A" />
            <circle cx="0" cy="-32" r="50" fill="url(#pbHead)" />
            <ellipse cx="-20" cy="-62" rx="16" ry="9" fill="rgba(255,255,255,.35)" transform="rotate(-22 -20 -62)" />
            <rect x="-38" y="-60" width="76" height="54" rx="22" fill="url(#pbVisor)" stroke="rgba(125,249,255,.25)" strokeWidth="1.5" />
            <path d="M-30 -55 Q-10 -60 14 -55" stroke="rgba(255,255,255,.12)" strokeWidth="3" fill="none" strokeLinecap="round" />
            {/* brows */}
            <motion.rect x="-24" y="-56" width="16" height="2.6" rx="1.3" fill="#7DF9FF" animate={{ rotate: m === 'serious' || m === 'facepalm' ? 12 : m === 'surprised' || m === 'excited' ? -8 : m === 'cheeky' ? -14 : 0, y: m === 'surprised' ? -4 : 0 }} style={{ originX: 0.5, originY: 0.5 }} />
            <motion.rect x="8" y="-56" width="16" height="2.6" rx="1.3" fill="#7DF9FF" animate={{ rotate: m === 'serious' || m === 'facepalm' ? -12 : m === 'surprised' || m === 'excited' ? 8 : m === 'cheeky' ? 4 : 0, y: m === 'surprised' ? -4 : m === 'cheeky' ? 2 : 0 }} style={{ originX: 0.5, originY: 0.5 }} />
            {/* eyes look where you are */}
            <motion.g animate={{ x: lk.x * 5, y: lk.y * 3 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
              <Eye x={-15} mood={m} blink={blink} side="l" />
              <Eye x={15} mood={m} blink={blink} side="r" />
            </motion.g>
            <Mouth mood={m} open={open} />
            <motion.ellipse cx="-36" cy="-14" rx="7" ry="4" fill="#F472B6" animate={{ opacity: ['cheeky', 'proud', 'happy', 'laugh'].includes(m) ? 0.55 : 0 }} />
            <motion.ellipse cx="36" cy="-14" rx="7" ry="4" fill="#F472B6" animate={{ opacity: ['cheeky', 'proud', 'happy', 'laugh'].includes(m) ? 0.55 : 0 }} />
            {/* graduation cap with a swinging tassel */}
            <path d="M-46 -78 L0 -98 L46 -78 L0 -60 Z" fill="#111827" />
            <path d="M-26 -72 L-26 -62 Q0 -52 26 -62 L26 -72 L0 -64 Z" fill="#1F2937" />
            <circle cx="0" cy="-79" r="3" fill="#FBBF24" />
            <motion.g animate={{ rotate: talking ? [8, -8, 8] : [4, -4, 4] }} transition={{ duration: talking ? 0.6 : 2.4, repeat: Infinity, ease: 'easeInOut' }} style={{ originX: 0, originY: 0 }}>
              <path d="M0 -79 Q22 -80 30 -70 L30 -54" stroke="#FBBF24" strokeWidth="2" fill="none" />
              <rect x="27" y="-56" width="6" height="11" rx="2" fill="#FBBF24" />
            </motion.g>
            {/* thinking bubbles */}
            {thinking && [0, 1, 2].map((i) => <motion.circle key={i} cx={52 + i * 9} cy={-86 - i * 10} r={3 + i * 2} fill="rgba(255,255,255,.8)" animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.25 }} />)}
          </motion.g>
          {/* facepalm hand over the visor */}
          {g === 'think' && <motion.circle cx="12" cy="16" r="11" fill="url(#pbLimb)" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} />}
          {g === 'facepalm' && <motion.circle cx="-6" cy="-36" r="15" fill="url(#pbLimb)" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 0.96, scale: 1 }} />}
        </svg>
      </motion.div>
    </div>
  );
}
