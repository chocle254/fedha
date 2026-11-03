import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// Professor Byte: the study tutor's body. A glossy robot professor in a graduation cap who lives behind the
// glass of your screen. Drawn in SVG with depth shading and tilted in 3D toward your finger, so he feels like he
// is in there. He blinks, breathes, follows you with his eyes, talks (mouth moves while he speaks) and acts:
// wave, point (at his board), explain, think, shrug, celebrate, laugh, lean in, knock on the glass, facepalm.
// Moods change his eyes, brows, mouth, cheeks and chest light.
const ARMS = { // [left, right] rotation in degrees from hanging down (SVG: positive = clockwise)
  none: [12, -12], point: [14, -112], explain: [62, -62], think: [14, 128], shrug: [70, -70],
  celebrate: [158, -158], wave: [148, -14], tap: [48, -14], lean: [30, -30], knock: [14, -38], laugh: [28, -28], facepalm: [-156, -14],
};
// Byte dresses for the class (by the course's folder, lib/course-folders.js) and for the lab.
export const OUTFITS = {
  default: { head: ['#B4F1F4', '#2BB6C2', '#0B4F63'], body: ['#8B9CFF', '#4C51BF', '#1E1B4B'], limb: ['#9EE7EC', '#167A8A'], eye: '#7DF9FF', hat: 'cap', tie: 'bow' },
  ai: { head: ['#E9D5FF', '#A78BFA', '#4C1D95'], body: ['#C4B5FD', '#7C3AED', '#2E1065'], limb: ['#DDD6FE', '#6D28D9'], eye: '#F0ABFC', hat: 'goggles', tie: 'bow' },
  cyber: { head: ['#6B7280', '#1F2937', '#030712'], body: ['#374151', '#111827', '#030712'], limb: ['#6B7280', '#1F2937'], eye: '#22C55E', hat: 'hood', tie: null },
  data: { head: ['#BFDBFE', '#3B82F6', '#1E3A8A'], body: ['#93C5FD', '#2563EB', '#1E3A8A'], limb: ['#BFDBFE', '#1D4ED8'], eye: '#93C5FD', hat: 'glasses', tie: 'bow', badge: 'chart' },
  cloud: { head: ['#CFFAFE', '#22D3EE', '#155E75'], body: ['#A5F3FC', '#0891B2', '#164E63'], limb: ['#CFFAFE', '#0E7490'], eye: '#67E8F9', hat: 'headset', tie: null },
  software: { head: ['#E5E7EB', '#6B7280', '#1F2937'], body: ['#D1D5DB', '#4B5563', '#111827'], limb: ['#E5E7EB', '#374151'], eye: '#38BDF8', hat: 'headphones', tie: null },
  math: { head: ['#FFFFFF', '#E5E7EB', '#9CA3AF'], body: ['#F9FAFB', '#D1D5DB', '#6B7280'], limb: ['#FFFFFF', '#9CA3AF'], eye: '#FBBF24', hat: 'monocle', tie: 'bow' },
  business: { head: ['#C7D2FE', '#4F6BA8', '#1E293B'], body: ['#93A3C4', '#1E3A5F', '#0B1424'], limb: ['#C7D2FE', '#1E3A5F'], eye: '#7DF9FF', hat: 'tophat', tie: 'tie' },
  lab: { head: ['#D1FAE5', '#34D399', '#065F46'], body: ['#FFFFFF', '#E5E7EB', '#9CA3AF'], limb: ['#D1FAE5', '#059669'], eye: '#34D399', hat: 'goggles', tie: null, coat: true },
};
const CHEST = { happy: '#34D399', cheeky: '#F472B6', excited: '#FBBF24', thinking: '#60A5FA', surprised: '#FDE047', serious: '#94A3B8', proud: '#E9D8A6', facepalm: '#F87171', impatient: '#FB923C' };

function Eye({ x, mood, blink, side, c = '#7DF9FF' }) {
  const glow = { filter: 'drop-shadow(0 0 4px rgba(125,249,255,.9))' };
  const wink = mood === 'cheeky' && side === 'r';
  if (blink || mood === 'facepalm') return <rect x={x - 8} y={-40} width="16" height="3" rx="1.5" fill={c} style={glow} />;
  if (wink || mood === 'happy' || mood === 'proud' || mood === 'laugh') return <path d={`M${x - 8} -36 Q${x} -47 ${x + 8} -36`} stroke={c} strokeWidth="3.2" fill="none" strokeLinecap="round" style={glow} />;
  if (mood === 'surprised' || mood === 'excited') return <circle cx={x} cy={-39} r={mood === 'surprised' ? 10 : 9} fill={c} style={glow} />;
  if (mood === 'serious' || mood === 'impatient') return <rect x={x - 8} y={-43} width="16" height="8" rx="3" fill={c} style={glow} />;
  return <ellipse cx={x} cy={-39} rx="7.5" ry="9.5" fill={c} style={glow} />;
}

function Mouth({ mood, open, c = '#7DF9FF' }) {
  const glow = { filter: `drop-shadow(0 0 3px ${c})` };
  if (open > 0.08) return <ellipse cx="0" cy="-19" rx={9 - open * 2} ry={1.5 + open * 6} fill={c} opacity=".95" style={glow} />;
  if (mood === 'surprised') return <circle cx="0" cy="-19" r="4" fill="none" stroke={c} strokeWidth="2.6" style={glow} />;
  if (mood === 'facepalm' || mood === 'serious' || mood === 'impatient') return <path d="M-9 -18 Q-4 -21 0 -18 Q4 -15 9 -18" stroke={c} strokeWidth="2.6" fill="none" strokeLinecap="round" style={glow} />;
  if (mood === 'cheeky') return <path d="M-9 -19 Q3 -13 11 -22" stroke={c} strokeWidth="2.8" fill="none" strokeLinecap="round" style={glow} />;
  if (mood === 'thinking') return <path d="M-6 -18 L6 -19" stroke={c} strokeWidth="2.6" strokeLinecap="round" style={glow} />;
  return <path d="M-11 -21 Q0 -11 11 -21" stroke={c} strokeWidth="2.8" fill="none" strokeLinecap="round" style={glow} />;
}

export default function ProfessorByte({ outfit = 'default', mood = 'happy', gesture = 'none', talking = false, level = null, thinking = false, look = null, size = 150, onKnock }) {
  const O = { ...(OUTFITS[outfit] || OUTFITS.default), k: OUTFITS[outfit] ? outfit : 'default' };
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
    if (!talking || level != null) { setOpen(0); return undefined; }
    const t = setInterval(() => setOpen(Math.random() < 0.18 ? 0 : 0.25 + Math.random() * 0.75), 95);
    return () => clearInterval(t);
  }, [talking, level != null]); // eslint-disable-line react-hooks/exhaustive-deps
  const mouth = level != null ? (talking ? Math.min(1, level * 1.4) : 0) : open;
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
    if (!['wave', 'knock', 'laugh', 'explain', 'celebrate', 'tap'].includes(gesture)) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), gesture === 'knock' ? 340 : gesture === 'tap' ? 260 : 420);
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
  if (g === 'tap') ra += beat ? -14 : 0; // drumming his fingers
  if (talking && g === 'none') { la += mouth * 6; ra -= mouth * 6; }
  const lean = g === 'lean' || g === 'knock';
  const bounce = g === 'laugh' || g === 'celebrate' ? (beat ? -6 : 0) : 0;
  const headTilt = g === 'think' ? -10 : g === 'shrug' ? 9 : g === 'laugh' ? (beat ? -8 : 4) : mood === 'cheeky' ? 7 : mood === 'impatient' ? (beat ? 5 : -2) : lk.x * 6;
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
            <radialGradient id={`pbHead${O.k}`} cx="35%" cy="28%" r="80%"><stop offset="0" stopColor={O.head[0]} /><stop offset=".45" stopColor={O.head[1]} /><stop offset="1" stopColor={O.head[2]} /></radialGradient>
            <radialGradient id={`pbBody${O.k}`} cx="35%" cy="25%" r="85%"><stop offset="0" stopColor={O.body[0]} /><stop offset=".5" stopColor={O.body[1]} /><stop offset="1" stopColor={O.body[2]} /></radialGradient>
            <radialGradient id={`pbGlass${O.k}`} cx="35%" cy="30%" r="70%"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset=".5" stopColor={O.eye} stopOpacity=".35" /><stop offset="1" stopColor="#0F172A" stopOpacity=".6" /></radialGradient>
            <linearGradient id="pbVisor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0F172A" /><stop offset="1" stopColor="#020617" /></linearGradient>
            <radialGradient id={`pbLimb${O.k}`} cx="30%" cy="30%" r="90%"><stop offset="0" stopColor={O.limb[0]} /><stop offset="1" stopColor={O.limb[1]} /></radialGradient>
          </defs>
          <motion.ellipse cx="0" cy="122" ry="7" fill="rgba(0,0,0,.45)" animate={{ rx: lean ? 64 : 52 - bounce }} />

          {/* body, breathing */}
          <motion.g animate={{ scaleY: [1, 1.025, 1] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }} style={{ originX: 0.5, originY: 1 }}>
            <rect x="-42" y="28" width="84" height="86" rx="32" fill={`url(#pbBody${O.k})`} />
            {O.coat && <><path d="M-12 30 L-4 62 L-30 108 M12 30 L4 62 L30 108" stroke="#CBD5E1" strokeWidth="2" fill="none" /><rect x="18" y="74" width="12" height="9" rx="2" fill="none" stroke="#CBD5E1" strokeWidth="1.5" /><path d="M21 74 L21 70 M25 74 L25 68" stroke="#3B82F6" strokeWidth="1.6" /></>}
            {O.badge === 'chart' && <g transform="translate(-30 52)"><rect width="16" height="12" rx="2" fill="#0F172A" /><rect x="3" y="6" width="2" height="4" fill="#60A5FA" /><rect x="7" y="3" width="2" height="7" fill="#34D399" /><rect x="11" y="5" width="2" height="5" fill="#FBBF24" /></g>}
            <ellipse cx="-16" cy="44" rx="16" ry="7" fill="rgba(255,255,255,.18)" />
            {O.tie === 'bow' && <><path d="M-12 30 L0 38 L12 30 L12 44 L0 38 L-12 44 Z" fill="#F43F5E" /><circle cx="0" cy="38" r="3.4" fill="#BE123C" /></>}
            {O.tie === 'tie' && <><path d="M-5 30 L5 30 L3 36 L7 62 L0 70 L-7 62 L-3 36 Z" fill="#B91C1C" /><path d="M-14 28 L0 40 L14 28" stroke="#E5E7EB" strokeWidth="3" fill="none" /></>}
            <motion.circle cx="0" cy="72" r="9" animate={{ fill: chest, opacity: thinking ? [0.4, 1, 0.4] : 0.95 }} transition={thinking ? { duration: 0.8, repeat: Infinity } : { duration: 0.3 }} style={{ filter: `drop-shadow(0 0 7px ${chest})` }} />
            <circle cx="-3" cy="69" r="2.5" fill="rgba(255,255,255,.7)" />
          </motion.g>

          {/* left arm (his right) */}
          <motion.g animate={{ rotate: la }} transition={spring} style={{ originX: 0.5, originY: 0 }}>
            <rect x="-48" y="40" width="15" height="48" rx="7.5" fill={`url(#pbLimb${O.k})`} />
            <circle cx="-40.5" cy="94" r="11" fill={`url(#pbLimb${O.k})`} />
          </motion.g>
          {/* right arm: the pointing, knocking one */}
          <motion.g animate={{ rotate: ra }} transition={spring} style={{ originX: 0.5, originY: 0 }}>
            <rect x="33" y="40" width="15" height="48" rx="7.5" fill={`url(#pbLimb${O.k})`} />
            <motion.circle cx="40.5" cy="94" fill={`url(#pbLimb${O.k})`} animate={{ r: g === 'knock' ? (beat ? 16 : 13) : 11 }} />
            {g === 'point' && <circle cx="40.5" cy="107" r="4.5" fill="#9EE7EC" />}
          </motion.g>

          {/* head */}
          <motion.g animate={{ rotate: headTilt, y: bounce * 0.4 }} transition={spring} style={{ originX: 0.5, originY: 1 }}>
            <rect x="-7" y="10" width="14" height="22" rx="5" fill={O.limb[1]} />
            <circle cx="0" cy="-32" r="50" fill={`url(#pbHead${O.k})`} />
            <ellipse cx="-20" cy="-62" rx="16" ry="9" fill="rgba(255,255,255,.35)" transform="rotate(-22 -20 -62)" />
            <rect x="-38" y="-60" width="76" height="54" rx="22" fill="url(#pbVisor)" stroke={`${O.eye}44`} strokeWidth="1.5" />
            <path d="M-30 -55 Q-10 -60 14 -55" stroke="rgba(255,255,255,.12)" strokeWidth="3" fill="none" strokeLinecap="round" />
            {/* brows */}
            <motion.rect x="-24" y="-56" width="16" height="2.6" rx="1.3" fill={O.eye} animate={{ rotate: m === 'serious' || m === 'facepalm' || m === 'impatient' ? 12 : m === 'surprised' || m === 'excited' ? -8 : m === 'cheeky' ? -14 : 0, y: m === 'surprised' ? -4 : 0 }} style={{ originX: 0.5, originY: 0.5 }} />
            <motion.rect x="8" y="-56" width="16" height="2.6" rx="1.3" fill={O.eye} animate={{ rotate: m === 'serious' || m === 'facepalm' || m === 'impatient' ? -12 : m === 'surprised' || m === 'excited' ? 8 : m === 'cheeky' ? 4 : 0, y: m === 'surprised' ? -4 : m === 'cheeky' ? 2 : 0 }} style={{ originX: 0.5, originY: 0.5 }} />
            {/* eyes look where you are */}
            <motion.g animate={{ x: lk.x * 5, y: lk.y * 3 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
              <Eye x={-15} mood={m} blink={blink} side="l" c={O.eye} />
              <Eye x={15} mood={m} blink={blink} side="r" c={O.eye} />
            </motion.g>
            <Mouth mood={m} open={mouth} c={O.eye} />
            <motion.ellipse cx="-36" cy="-14" rx="7" ry="4" fill="#F472B6" animate={{ opacity: ['cheeky', 'proud', 'happy', 'laugh'].includes(m) ? 0.55 : 0 }} />
            <motion.ellipse cx="36" cy="-14" rx="7" ry="4" fill="#F472B6" animate={{ opacity: ['cheeky', 'proud', 'happy', 'laugh'].includes(m) ? 0.55 : 0 }} />
            {O.hat === 'cap' && <>
            <path d="M-46 -78 L0 -98 L46 -78 L0 -60 Z" fill="#111827" />
            <path d="M-26 -72 L-26 -62 Q0 -52 26 -62 L26 -72 L0 -64 Z" fill="#1F2937" />
            <circle cx="0" cy="-79" r="3" fill="#FBBF24" />
            <motion.g animate={{ rotate: talking ? [8, -8, 8] : [4, -4, 4] }} transition={{ duration: talking ? 0.6 : 2.4, repeat: Infinity, ease: 'easeInOut' }} style={{ originX: 0, originY: 0 }}>
              <path d="M0 -79 Q22 -80 30 -70 L30 -54" stroke="#FBBF24" strokeWidth="2" fill="none" />
              <rect x="27" y="-56" width="6" height="11" rx="2" fill="#FBBF24" />
            </motion.g>
            </>}
            {/* goggles pushed up on the forehead (AI, lab) */}
            {O.hat === 'goggles' && <g>
              <path d="M-49 -68 Q0 -84 49 -68" stroke="#1F2937" strokeWidth="6" fill="none" />
              {[-17, 17].map((x) => <g key={x}><circle cx={x} cy={-74} r="12" fill="#1F2937" /><circle cx={x} cy={-74} r="9" fill={`url(#pbGlass${O.k})`} /><circle cx={x - 3} cy={-77} r="2.4" fill="#fff" opacity=".8" /></g>)}
            </g>}
            {/* hacker hood (cyber) */}
            {O.hat === 'hood' && <path d="M-58 -10 C-66 -104 66 -104 58 -10 L50 6 C52 -40 40 -78 0 -80 C-40 -78 -52 -40 -50 6 Z" fill="#0B0F14" stroke="#22C55E" strokeOpacity=".35" strokeWidth="1.5" />}
            {/* round glasses (data) */}
            {O.hat === 'glasses' && <g fill="none" stroke="#E5E7EB" strokeWidth="2.6"><circle cx="-15" cy="-39" r="13" /><circle cx="15" cy="-39" r="13" /><path d="M-2 -40 Q0 -43 2 -40 M-28 -42 L-40 -46 M28 -42 L40 -46" /></g>}
            {/* headset with a mic (cloud & devops) */}
            {O.hat === 'headset' && <g><path d="M-50 -30 C-54 -96 54 -96 50 -30" stroke="#111827" strokeWidth="6" fill="none" /><rect x="-58" y="-42" width="12" height="22" rx="5" fill="#111827" /><rect x="46" y="-42" width="12" height="22" rx="5" fill="#111827" /><path d="M-52 -22 Q-46 0 -20 -10" stroke="#111827" strokeWidth="3" fill="none" /><circle cx="-18" cy="-11" r="4" fill="#22D3EE" /></g>}
            {/* big headphones (software) */}
            {O.hat === 'headphones' && <g><path d="M-52 -32 C-58 -104 58 -104 52 -32" stroke="#0F172A" strokeWidth="8" fill="none" /><rect x="-64" y="-50" width="18" height="32" rx="8" fill="#0F172A" /><rect x="46" y="-50" width="18" height="32" rx="8" fill="#0F172A" /><rect x="-61" y="-44" width="12" height="20" rx="5" fill="#38BDF8" opacity=".55" /><rect x="49" y="-44" width="12" height="20" rx="5" fill="#38BDF8" opacity=".55" /></g>}
            {/* monocle (maths) */}
            {O.hat === 'monocle' && <g><circle cx="15" cy="-39" r="13" fill="none" stroke="#FBBF24" strokeWidth="2.6" /><path d="M27 -33 Q36 -10 30 12" stroke="#FBBF24" strokeWidth="1.4" fill="none" /></g>}
            {/* top hat (business) */}
            {O.hat === 'tophat' && <g><rect x="-26" y="-118" width="52" height="38" rx="3" fill="#0F172A" /><rect x="-26" y="-92" width="52" height="7" fill="#B91C1C" /><ellipse cx="0" cy="-79" rx="40" ry="6" fill="#0F172A" /></g>}
            {/* thinking bubbles */}
            {thinking && [0, 1, 2].map((i) => <motion.circle key={i} cx={52 + i * 9} cy={-86 - i * 10} r={3 + i * 2} fill="rgba(255,255,255,.8)" animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.25 }} />)}
          </motion.g>
          {/* facepalm hand over the visor */}
          {g === 'think' && <motion.circle cx="12" cy="16" r="11" fill={`url(#pbLimb${O.k})`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} />}
          {g === 'facepalm' && <motion.circle cx="-6" cy="-36" r="15" fill={`url(#pbLimb${O.k})`} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 0.96, scale: 1 }} />}
        </svg>
      </motion.div>
    </div>
  );
}
