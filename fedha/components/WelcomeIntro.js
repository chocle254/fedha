import { useEffect, useState } from 'react';

// "Welcome to Luxe": a short luxury intro shown once per app launch, in time with the start-up ident
// (/sounds/luxe-welcome.mp3). The gem's facets fall into place one by one, its prism edge draws, a light
// sweep crosses the stone, the sparkle glints, LUXE settles in, then the whole thing lifts away to reveal the app.
// Tap to skip. With reduced motion it is a short, calm fade.
// Inside the Android app the ident is played natively at launch (browsers block sound before a tap),
// so the web page only plays it in a normal browser tab, where it may be allowed.
const GEM = [
  ['M16 42 L33 27 L31 42 Z', '#F4F6FA'], ['M33 27 L50 42 L31 42 Z', '#C9D1DE'], ['M33 27 L67 27 L50 42 Z', '#E6EAF1'],
  ['M67 27 L69 42 L50 42 Z', '#C9D1DE'], ['M67 27 L84 42 L69 42 Z', '#8E99AD'], ['M16 42 L31 42 L50 86 Z', '#B9C3D3'],
  ['M31 42 L50 42 L50 86 Z', '#EEF1F6'], ['M50 42 L69 42 L50 86 Z', '#7D889C'], ['M69 42 L84 42 L50 86 Z', '#5D687D'],
];
const SHOW_MS = 2900;
const LEAVE_MS = 650;

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function WelcomeIntro({ enabled = true }) {
  const [phase, setPhase] = useState('off'); // off | on | leaving
  const [hello, setHello] = useState('');

  // The static midnight backdrop from _document covers the screen until the app (or this intro) is up.
  const dropBoot = (delay) => setTimeout(() => {
    const el = document.getElementById('lx-boot');
    if (!el) return;
    el.classList.add('lx-gone');
    setTimeout(() => el.remove(), 500);
  }, delay);

  useEffect(() => {
    let seen = false;
    if (enabled) try { seen = sessionStorage.getItem('luxe_intro_shown') === '1'; sessionStorage.setItem('luxe_intro_shown', '1'); } catch { /* private mode: show it */ }
    if (seen || !enabled) { const b = dropBoot(0); return () => clearTimeout(b); }
    setHello(greeting());
    setPhase('on');
    const boot = dropBoot(80); // the intro is painted on top by now; hand over seamlessly
    const inApp = typeof document !== 'undefined' && document.referrer.startsWith('android-app://');
    if (!inApp) {
      try { const a = new Audio('/sounds/luxe-welcome.mp3'); a.volume = 0.9; a.play().catch(() => {}); } catch { /* no audio */ }
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t1 = setTimeout(() => setPhase('leaving'), reduce ? 900 : SHOW_MS);
    const t2 = setTimeout(() => setPhase('off'), (reduce ? 900 : SHOW_MS) + LEAVE_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(boot); };
  }, []);

  if (phase === 'off') return null;
  const skip = () => { setPhase('leaving'); setTimeout(() => setPhase('off'), LEAVE_MS); };

  return (
    <div className={`wi-intro ${phase === 'leaving' ? 'wi-leave' : ''}`} onClick={skip} role="presentation" aria-hidden="true">
      <style>{CSS}</style>
      <div className="wi-dust">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
      <div className="wi-stage">
        <div className="wi-mark">
          <svg viewBox="0 0 100 100" width="150" height="150">
            <defs>
              <linearGradient id="wiPrism" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F1F5FA" /><stop offset="0.5" stopColor="#9FD8E8" /><stop offset="1" stopColor="#B8C2D2" /></linearGradient>
              <radialGradient id="wiGlow" cx="50%" cy="55%" r="50%"><stop offset="0" stopColor="#9FD8E8" stopOpacity="0.4" /><stop offset="1" stopColor="#9FD8E8" stopOpacity="0" /></radialGradient>
              <linearGradient id="wiSweepG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.8" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
              <clipPath id="wiClip"><path d="M16 42 L33 27 L67 27 L84 42 L50 86 Z" /></clipPath>
            </defs>
            <circle className="wi-glow" cx="50" cy="54" r="48" fill="url(#wiGlow)" />
            {GEM.map(([d, c], i) => <path key={i} className="wi-facet" style={{ '--i': i }} d={d} fill={c} />)}
            <path className="wi-edge" d="M16 42 L33 27 L67 27 L84 42 L50 86 Z" fill="none" stroke="url(#wiPrism)" strokeWidth="1.6" strokeLinejoin="round" />
            <path className="wi-hair" d="M16 42 H84" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.9" />
            <g clipPath="url(#wiClip)"><rect className="wi-sweep" x="-50" y="0" width="30" height="100" fill="url(#wiSweepG)" /></g>
            <path className="wi-glint" d="M80 12 L82 19 L89 21 L82 23 L80 30 L78 23 L71 21 L78 19 Z" fill="#fff" />
          </svg>
        </div>
        <div className="wi-word">LUXE</div>
        <div className="wi-line" />
        <div className="wi-hello">{hello}, welcome back</div>
      </div>
    </div>
  );
}

const CSS = `
.wi-intro{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(120% 90% at 50% 38%,#171B22 0%,#090B0F 45%,#040507 100%);
  transition:opacity ${LEAVE_MS}ms cubic-bezier(.4,0,.2,1),transform ${LEAVE_MS}ms cubic-bezier(.4,0,.2,1),filter ${LEAVE_MS}ms;cursor:pointer;
  font-family:'Onest',system-ui,sans-serif;-webkit-tap-highlight-color:transparent}
.wi-leave{opacity:0;transform:scale(1.06);filter:blur(6px)}
.wi-stage{display:flex;flex-direction:column;align-items:center;gap:14px;transform:translateY(-4vh)}
.wi-mark{filter:drop-shadow(0 18px 40px rgba(159,216,232,.18))}
.wi-glow{opacity:0;animation:wiFade 1.4s .2s ease-out forwards}
.wi-facet{opacity:0;transform-box:fill-box;transform-origin:center;transform:translateY(-6px) scale(.6);animation:wiFacet .55s calc(.2s + var(--i) * .07s) cubic-bezier(.16,1,.3,1) forwards}
.wi-edge{stroke-dasharray:240;stroke-dashoffset:240;animation:wiDraw 1s .55s cubic-bezier(.65,0,.35,1) forwards}
.wi-hair{opacity:0;animation:wiFade .6s 1.1s ease-out forwards}
.wi-sweep{transform:skewX(-20deg);animation:wiSweep .9s 1.35s cubic-bezier(.4,0,.2,1) forwards}
.wi-glint{transform-box:fill-box;transform-origin:center;transform:scale(0) rotate(-90deg);animation:wiGlint .7s 1.3s cubic-bezier(.16,1,.3,1) forwards}
.wi-word{color:#EDEFF5;font-weight:300;font-size:30px;letter-spacing:.95em;padding-left:.95em;opacity:0;filter:blur(8px);
  color:#EEF2F7;
  animation:wiWord 1.1s 1.45s cubic-bezier(.2,.8,.2,1) forwards}
.wi-line{height:1px;width:0;background:linear-gradient(90deg,transparent,#9FD8E8,transparent);animation:wiLine .9s 1.8s ease-out forwards}
.wi-hello{color:rgba(235,235,245,.62);font-size:13px;letter-spacing:.18em;text-transform:uppercase;opacity:0;transform:translateY(8px);animation:wiUp .8s 2.0s ease-out forwards}
.wi-dust i{position:absolute;left:calc(8% + var(--i) * 6.3%);bottom:-10px;width:3px;height:3px;border-radius:50%;background:#DCEFF5;opacity:0;
  box-shadow:0 0 8px #9FD8E8;animation:wiDust 3.2s calc(var(--i) * .13s) ease-out forwards}
@keyframes wiDraw{to{stroke-dashoffset:0}}
@keyframes wiFade{to{opacity:1}}
@keyframes wiSweep{from{transform:translateX(0) skewX(-20deg)}to{transform:translateX(170px) skewX(-20deg)}}
@keyframes wiFacet{to{opacity:1;transform:none}}
@keyframes wiGlint{60%{transform:scale(1.35) rotate(15deg)}to{transform:scale(1) rotate(0)}}
@keyframes wiWord{to{opacity:1;filter:blur(0);letter-spacing:.45em;padding-left:.45em}}
@keyframes wiLine{to{width:150px}}
@keyframes wiUp{to{opacity:1;transform:translateY(0)}}
@keyframes wiDust{15%{opacity:.8}to{opacity:0;transform:translateY(calc(-40vh - var(--i) * 2vh))}}
@media (prefers-reduced-motion:reduce){
  .wi-intro *{animation-duration:.01s!important;animation-delay:0s!important}
  .wi-sweep,.wi-dust{display:none}
}
`;
