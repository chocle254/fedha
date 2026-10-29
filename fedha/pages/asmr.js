import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import { AsmrEngine, TRIGGERS } from '../lib/asmr-engine';
import { useMusic } from '../context/MusicContext';
import { getSetting, setSetting } from '../lib/db';

// ASMR Room: endless, shuffling triggers made live in 3D around your head (lib/asmr-engine.js). One glowing orb
// that breathes with every sound, the trigger's name, and nothing else on screen while it plays. ♥ = more of this
// one, ⏭ = next (and a little less of it), density = how busy, sleep timer fades it out.
const TIMERS = [[0, '∞'], [15, '15m'], [30, '30m'], [60, '1h']];

export default function Asmr() {
  const eng = useRef(null);
  const orb = useRef(null);
  const music = useMusic();
  const [on, setOn] = useState(false);
  const [trig, setTrig] = useState(null);
  const [weights, setWeights] = useState({});
  const [density, setDensity] = useState(1);
  const [timer, setTimer] = useState(0);
  const [ui, setUi] = useState(true);
  const hideT = useRef(null);
  const endT = useRef(null);

  useEffect(() => {
    getSetting('asmr_weights', {}).then((w) => setWeights(w && typeof w === 'object' ? w : {})).catch(() => {});
    return () => { eng.current?.stop(); clearTimeout(endT.current); };
  }, []);
  useEffect(() => { eng.current?.setWeights(weights); }, [weights]);
  useEffect(() => { eng.current?.setDensity(density); }, [density]);

  // Controls fade away while it plays; a tap brings them back.
  const wake = () => { setUi(true); clearTimeout(hideT.current); if (on) hideT.current = setTimeout(() => setUi(false), 4000); };
  useEffect(() => { wake(); }, [on]); // eslint-disable-line react-hooks/exhaustive-deps

  const pulse = (peak, delay) => setTimeout(() => {
    const el = orb.current; if (!el) return;
    el.style.setProperty('--p', String(Math.min(1, 0.25 + peak)));
    el.classList.remove('beat'); void el.offsetWidth; el.classList.add('beat');
  }, Math.max(0, delay * 1000));

  const start = async () => {
    if (music.playing) music.toggle(); // one thing at a time
    if (!eng.current) eng.current = new AsmrEngine({ onEvent: pulse, onTrigger: setTrig });
    eng.current.setWeights(weights); eng.current.setDensity(density);
    if (eng.current.ctx) await eng.current.resume(); else await eng.current.start();
    setOn(true);
    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').catch(() => {});
  };
  const pause = () => { eng.current?.pause(); setOn(false); clearTimeout(endT.current); };
  const skip = async () => {
    if (trig) { const w = { ...weights, [trig.id]: Math.max(0.3, (weights[trig.id] ?? 1) * 0.8) }; setWeights(w); setSetting('asmr_weights', w); }
    eng.current?.shuffle(); wake();
  };
  const love = () => {
    if (!trig) return;
    const w = { ...weights, [trig.id]: Math.min(4, (weights[trig.id] ?? 1) + 0.75) };
    setWeights(w); setSetting('asmr_weights', w); wake();
  };
  const setSleep = (m) => {
    setTimer(m); clearTimeout(endT.current);
    if (m) endT.current = setTimeout(() => { eng.current?.fadeOut(30); setTimeout(() => setOn(false), 30000); }, m * 60000);
  };
  const loved = trig && (weights[trig.id] ?? 1) > 1;

  return (
    <Layout>
      <Head><title>ASMR Room · Luxe</title></Head>
      <div className={`as ${on ? 'on' : ''}`} onClick={wake}>
        <div className="as-glow" />
        <div className="as-center">
          <div ref={orb} className="as-orb" onClick={(e) => { e.stopPropagation(); on ? wake() : start(); }}>
            <span>{on ? trig?.emoji || '✨' : '▶'}</span>
          </div>
          <div className="as-name">{on ? trig?.name || '…' : 'ASMR Room'}</div>
          <div className="as-sub">{on ? 'Headphones on. Eyes closed.' : `${TRIGGERS.length} triggers, made live in 3D around your head. Best with headphones.`}</div>
        </div>

        <div className={`as-ctrls ${ui ? '' : 'gone'}`} onClick={(e) => e.stopPropagation()}>
          {on ? (
            <>
              <div className="as-row">
                <button type="button" onClick={pause} aria-label="Pause">❚❚</button>
                <button type="button" className={loved ? 'on' : ''} onClick={love} aria-label="More of this">{loved ? '♥' : '♡'}</button>
                <button type="button" onClick={skip} aria-label="Next trigger">⏭</button>
              </div>
              <div className="as-row small">
                <span>Calm</span>
                <input type="range" min="0.5" max="2" step="0.1" value={density} onChange={(e) => setDensity(Number(e.target.value))} aria-label="Density" />
                <span>Busy</span>
              </div>
              <div className="as-row small">
                {TIMERS.map(([m, l]) => <button type="button" key={m} className={`as-t ${timer === m ? 'on' : ''}`} onClick={() => setSleep(m)}>{m ? `😴 ${l}` : l}</button>)}
              </div>
            </>
          ) : (
            <button type="button" className="as-start" onClick={start}>Start</button>
          )}
        </div>
      </div>

      <style jsx global>{`
        .as { position: relative; min-height: calc(100vh - 70px - env(safe-area-inset-bottom)); background: radial-gradient(ellipse at 50% 40%, #12091f 0%, #05030a 60%, #000 100%); color: #f5f5f7; overflow: hidden; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: -apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif; user-select: none; }
        .as-glow { position: absolute; width: 140vmin; height: 140vmin; border-radius: 50%; background: radial-gradient(circle, rgba(139,92,246,0.18), transparent 60%); animation: asBreath 9s ease-in-out infinite; pointer-events: none; }
        .as.on .as-glow { background: radial-gradient(circle, rgba(167,139,250,0.24), transparent 60%); }
        @keyframes asBreath { 0%, 100% { transform: scale(0.92); opacity: 0.7; } 50% { transform: scale(1.06); opacity: 1; } }
        .as-center { position: relative; display: flex; flex-direction: column; align-items: center; gap: 14px; margin-top: -40px; }
        .as-orb { --p: 0.4; width: 46vmin; max-width: 230px; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; cursor: pointer; background: radial-gradient(circle at 35% 30%, #c4b5fd, #7c3aed 55%, #2e1065); box-shadow: 0 0 60px rgba(139,92,246,0.45), inset 0 0 40px rgba(255,255,255,0.15); transition: transform 0.6s cubic-bezier(.2,.8,.2,1), box-shadow 0.6s; }
        .as-orb span { font-size: 54px; filter: drop-shadow(0 2px 10px rgba(0,0,0,0.4)); }
        .as-orb.beat { animation: asBeat 0.55s ease-out; }
        @keyframes asBeat { 0% { transform: scale(calc(1 + var(--p) * 0.09)); box-shadow: 0 0 calc(60px + var(--p) * 90px) rgba(167,139,250,0.75), inset 0 0 40px rgba(255,255,255,0.25); } 100% { transform: scale(1); } }
        .as-name { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; text-align: center; }
        .as-sub { font-size: 13px; color: rgba(255,255,255,0.55); text-align: center; max-width: 300px; line-height: 1.45; }
        .as-ctrls { position: absolute; bottom: calc(96px + env(safe-area-inset-bottom)); left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 14px; transition: opacity 0.6s; }
        .as-ctrls.gone { opacity: 0; pointer-events: none; }
        .as-row { display: flex; align-items: center; gap: 22px; }
        .as-row button { all: unset; cursor: pointer; width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; font-size: 20px; background: rgba(255,255,255,0.08); color: #f5f5f7; }
        .as-row button.on { color: #f472b6; background: rgba(244,114,182,0.15); }
        .as-row.small { gap: 10px; font-size: 12px; color: rgba(255,255,255,0.5); }
        .as-row.small input { width: 160px; accent-color: #a78bfa; }
        .as-row .as-t { width: auto; height: auto; padding: 6px 12px; border-radius: 999px; font-size: 12.5px; }
        .as-row .as-t.on { color: #000; background: #c4b5fd; }
        .as-start { all: unset; cursor: pointer; padding: 14px 44px; border-radius: 999px; background: #f5f5f7; color: #000; font-size: 16px; font-weight: 700; }
      `}</style>
    </Layout>
  );
}
