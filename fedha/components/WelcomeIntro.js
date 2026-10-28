import { useEffect, useState } from 'react';

// "Welcome to Luxe": a short luxury intro shown once per app launch, in time with the start-up ident
// (/sounds/luxe-welcome.mp3). The gold ring draws, the L is traced and filled, the diamond glints, a light
// sweep crosses the mark, LUXE settles in, then the whole thing lifts away to reveal the app.
// Tap to skip. With reduced motion it is a short, calm fade.
// Inside the Android app the ident is played natively at launch (browsers block sound before a tap),
// so the web page only plays it in a normal browser tab, where it may be allowed.
const SHOW_MS = 2900;
const LEAVE_MS = 650;

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function WelcomeIntro() {
  const [phase, setPhase] = useState('off'); // off | on | leaving
  const [hello, setHello] = useState('');

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem('luxe_intro_shown') === '1'; sessionStorage.setItem('luxe_intro_shown', '1'); } catch { /* private mode: show it */ }
    if (seen) return undefined;
    setHello(greeting());
    setPhase('on');
    const inApp = typeof document !== 'undefined' && document.referrer.startsWith('android-app://');
    if (!inApp) {
      try { const a = new Audio('/sounds/luxe-welcome.mp3'); a.volume = 0.9; a.play().catch(() => {}); } catch { /* no audio */ }
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t1 = setTimeout(() => setPhase('leaving'), reduce ? 900 : SHOW_MS);
    const t2 = setTimeout(() => setPhase('off'), (reduce ? 900 : SHOW_MS) + LEAVE_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === 'off') return null;
  const skip = () => { setPhase('leaving'); setTimeout(() => setPhase('off'), LEAVE_MS); };

  return (
    <div className={`lx-intro ${phase === 'leaving' ? 'lx-leave' : ''}`} onClick={skip} role="presentation" aria-hidden="true">
      <style>{CSS}</style>
      <div className="lx-dust">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
      <div className="lx-stage">
        <div className="lx-mark">
          <svg viewBox="0 0 512 512" width="148" height="148">
            <defs>
              <linearGradient id="lxGold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#FFF1C9" /><stop offset="0.35" stopColor="#E9C77B" /><stop offset="0.65" stopColor="#C79A45" /><stop offset="1" stopColor="#8E6A2C" />
              </linearGradient>
              <radialGradient id="lxGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#E9C77B" stopOpacity="0.32" /><stop offset="1" stopColor="#E9C77B" stopOpacity="0" /></radialGradient>
              <clipPath id="lxClip"><circle cx="256" cy="256" r="178" /></clipPath>
            </defs>
            <circle className="lx-glow" cx="256" cy="262" r="190" fill="url(#lxGlow)" />
            <circle className="lx-ring" cx="256" cy="256" r="178" fill="none" stroke="url(#lxGold)" strokeWidth="3" />
            <path className="lx-l" d="M176 140 H262 V152 L246 156 V330 H338 L352 316 H362 L344 372 H176 V360 L196 356 V156 L176 152 Z" fill="url(#lxGold)" stroke="#E9C77B" strokeWidth="3" />
            <path className="lx-hair" d="M212 164 V346 H330" fill="none" stroke="#FFF1C9" strokeOpacity="0.35" strokeWidth="2" />
            <g clipPath="url(#lxClip)"><rect className="lx-sweep" x="-200" y="0" width="120" height="512" fill="url(#lxSweep)" /></g>
            <linearGradient id="lxSweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
            <g className="lx-glint"><path d="M332 150 L338 174 L362 180 L338 186 L332 210 L326 186 L302 180 L326 174 Z" fill="#FFF6DD" /><circle cx="332" cy="180" r="3.5" fill="#fff" /></g>
          </svg>
        </div>
        <div className="lx-word">LUXE</div>
        <div className="lx-line" />
        <div className="lx-hello">{hello}, welcome back</div>
      </div>
    </div>
  );
}

const CSS = `
.lx-intro{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(120% 90% at 50% 38%,#1A1F33 0%,#0B0E19 45%,#05060B 100%);
  transition:opacity ${LEAVE_MS}ms cubic-bezier(.4,0,.2,1),transform ${LEAVE_MS}ms cubic-bezier(.4,0,.2,1),filter ${LEAVE_MS}ms;cursor:pointer;
  font-family:'Outfit',system-ui,sans-serif;-webkit-tap-highlight-color:transparent}
.lx-leave{opacity:0;transform:scale(1.06);filter:blur(6px)}
.lx-stage{display:flex;flex-direction:column;align-items:center;gap:14px;transform:translateY(-4vh)}
.lx-mark{filter:drop-shadow(0 18px 40px rgba(233,199,123,.18))}
.lx-glow{opacity:0;animation:lxFade 1.4s .2s ease-out forwards}
.lx-ring{stroke-dasharray:1120;stroke-dashoffset:1120;animation:lxDraw 1.1s .15s cubic-bezier(.65,0,.35,1) forwards}
.lx-l{fill-opacity:0;stroke-dasharray:1500;stroke-dashoffset:1500;animation:lxDraw 1s .35s cubic-bezier(.65,0,.35,1) forwards,lxFill .55s 1.05s ease-out forwards}
.lx-hair{opacity:0;animation:lxFade .6s 1.3s ease-out forwards}
.lx-sweep{transform:skewX(-18deg);animation:lxSweep .9s 1.4s cubic-bezier(.4,0,.2,1) forwards}
.lx-glint{transform-origin:332px 180px;transform:scale(0) rotate(-90deg);animation:lxGlint .7s 1.25s cubic-bezier(.2,1.4,.4,1) forwards}
.lx-word{color:#F3DDA6;font-weight:300;font-size:30px;letter-spacing:.95em;padding-left:.95em;opacity:0;filter:blur(8px);
  background:linear-gradient(90deg,#C79A45,#FFF1C9 45%,#E9C77B 60%,#C79A45);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  animation:lxWord 1.1s 1.45s cubic-bezier(.2,.8,.2,1) forwards}
.lx-line{height:1px;width:0;background:linear-gradient(90deg,transparent,#E9C77B,transparent);animation:lxLine .9s 1.8s ease-out forwards}
.lx-hello{color:rgba(243,221,166,.72);font-size:13px;letter-spacing:.18em;text-transform:uppercase;opacity:0;transform:translateY(8px);animation:lxUp .8s 2.0s ease-out forwards}
.lx-dust i{position:absolute;left:calc(8% + var(--i) * 6.3%);bottom:-10px;width:3px;height:3px;border-radius:50%;background:#E9C77B;opacity:0;
  box-shadow:0 0 8px #E9C77B;animation:lxDust 3.2s calc(var(--i) * .13s) ease-out forwards}
@keyframes lxDraw{to{stroke-dashoffset:0}}
@keyframes lxFill{to{fill-opacity:1;stroke-opacity:.25}}
@keyframes lxFade{to{opacity:1}}
@keyframes lxSweep{from{transform:translateX(0) skewX(-18deg)}to{transform:translateX(820px) skewX(-18deg)}}
@keyframes lxGlint{60%{transform:scale(1.35) rotate(15deg)}to{transform:scale(1) rotate(0)}}
@keyframes lxWord{to{opacity:1;filter:blur(0);letter-spacing:.45em;padding-left:.45em}}
@keyframes lxLine{to{width:150px}}
@keyframes lxUp{to{opacity:1;transform:translateY(0)}}
@keyframes lxDust{15%{opacity:.8}to{opacity:0;transform:translateY(calc(-40vh - var(--i) * 2vh))}}
@media (prefers-reduced-motion:reduce){
  .lx-intro *{animation-duration:.01s!important;animation-delay:0s!important}
  .lx-sweep,.lx-dust{display:none}
}
`;
