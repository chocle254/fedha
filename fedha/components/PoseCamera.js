import { useEffect, useRef, useState, useCallback } from 'react';

// Load a script tag only once
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// Calculate angle at point B formed by A-B-C
function angle(a, b, c) {
  const r = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let deg = Math.abs(r * 180 / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return deg;
}

// Skeleton connections (MoveNet keypoint indices)
const CONNECTIONS = [
  [5,7],[7,9],[6,8],[8,10], // arms
  [5,6],[5,11],[6,12],[11,12], // torso
  [11,13],[13,15],[12,14],[14,16], // legs
  [0,5],[0,6], // head-shoulders
];

// Per-exercise rep counting logic
function countRep(exId, kps, state) {
  const get = (i) => kps[i]?.score > 0.25 ? kps[i] : null;
  const named = {};
  kps.forEach(k => { named[k.name] = k.score > 0.25 ? k : null; });

  const ls = named.left_shoulder, le = named.left_elbow, lw = named.left_wrist;
  const rs = named.right_shoulder, re = named.right_elbow, rw = named.right_wrist;
  const lh = named.left_hip, lk = named.left_knee, la = named.left_ankle;
  const rh = named.right_hip, rk = named.right_knee, ra = named.right_ankle;

  let a1 = null, phase = state.phase;

  if (['pushups','diamond_pushups','wide_pushups','pike_pushups'].includes(exId)) {
    if (ls && le && lw) a1 = angle(ls, le, lw);
    else if (rs && re && rw) a1 = angle(rs, re, rw);
    if (a1 !== null) {
      if (a1 < 90) phase = 'down';
      else if (a1 > 155 && state.phase === 'down') phase = 'up';
    }
    return { angle: a1, phase, countWhen: 'up' };
  }

  if (['squats','lunges'].includes(exId)) {
    if (lh && lk && la) a1 = angle(lh, lk, la);
    else if (rh && rk && ra) a1 = angle(rh, rk, ra);
    if (a1 !== null) {
      if (a1 < 100) phase = 'down';
      else if (a1 > 160 && state.phase === 'down') phase = 'up';
    }
    return { angle: a1, phase, countWhen: 'up' };
  }

  if (exId === 'situps') {
    if (ls && lh && lk) a1 = angle(ls, lh, lk);
    else if (rs && rh && rk) a1 = angle(rs, rh, rk);
    if (a1 !== null) {
      if (a1 < 75) phase = 'up';
      else if (a1 > 140 && state.phase === 'up') phase = 'down';
    }
    return { angle: a1, phase, countWhen: 'down' };
  }

  if (exId === 'glute_bridges') {
    if (ls && lh && lk) a1 = angle(ls, lh, lk);
    if (a1 !== null) {
      if (a1 > 160) phase = 'up';
      else if (a1 < 120 && state.phase === 'up') phase = 'down';
    }
    return { angle: a1, phase, countWhen: 'down' };
  }

  if (exId === 'calf_raises') {
    if (lk && la && lh) {
      // Track relative heel height using ankle-to-knee y distance vs baseline
      const ratio = (lk.y - la.y) / Math.max(1, lh.y - la.y);
      a1 = Math.round(ratio * 100);
      if (ratio > 0.6) phase = 'up';
      else if (ratio < 0.45 && state.phase === 'up') phase = 'down';
    }
    return { angle: a1, phase, countWhen: 'down' };
  }

  if (exId === 'mountain_climbers') {
    if (lh && lk) {
      const dist = Math.abs(lk.y - lh.y);
      a1 = Math.round(dist);
      if (dist < 60) phase = 'in';
      else if (dist > 120 && state.phase === 'in') phase = 'out';
    }
    return { angle: a1, phase, countWhen: 'out', labels: ['in', 'out'] };
  }

  return { angle: null, phase, countWhen: 'up' };
}

export default function PoseCamera({ exercise, targetReps, set, totalSets, onComplete, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const stateRef = useRef({ phase: 'up', reps: 0, lastPhase: null });
  const runningRef = useRef(true);
  const animRef = useRef(null);

  const [reps, setReps] = useState(0);
  const [phase, setPhase] = useState('up');
  const [liveAngle, setLiveAngle] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | done | error
  const [loadMsg, setLoadMsg] = useState('Starting camera…');

  useEffect(() => {
    let stream = null;

    async function init() {
      try {
        setLoadMsg('Opening camera…');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (!runningRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        setLoadMsg('Loading AI model (~3MB, first time only)…');
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js');

        setLoadMsg('Warming up pose detection…');
        const detector = await window.poseDetection.createDetector(
          window.poseDetection.SupportedModels.MoveNet,
          { modelType: window.poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
        );

        if (!runningRef.current) return;
        setStatus('ready');

        async function loop() {
          if (!runningRef.current || !videoRef.current || !canvasRef.current) return;
          try {
            const poses = await detector.estimatePoses(videoRef.current);
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            const vw = videoRef.current.videoWidth || 640;
            const vh = videoRef.current.videoHeight || 480;
            canvas.width = vw;
            canvas.height = vh;
            ctx.clearRect(0, 0, vw, vh);

            if (poses[0]?.keypoints) {
              const kps = poses[0].keypoints;

              // Draw skeleton lines
              ctx.strokeStyle = '#10B981';
              ctx.lineWidth = 3;
              CONNECTIONS.forEach(([i, j]) => {
                const a = kps[i], b = kps[j];
                if (a?.score > 0.25 && b?.score > 0.25) {
                  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                }
              });

              // Draw keypoint dots
              kps.forEach(k => {
                if (k.score > 0.25) {
                  ctx.beginPath();
                  ctx.arc(k.x, k.y, 6, 0, 2 * Math.PI);
                  ctx.fillStyle = k.score > 0.6 ? '#10B981' : '#F59E0B';
                  ctx.fill();
                }
              });

              // Rep logic
              const result = countRep(exercise.id, kps, stateRef.current);
              if (result.angle !== null) setLiveAngle(result.angle);

              if (result.phase !== stateRef.current.lastPhase) {
                const prev = stateRef.current.lastPhase;
                stateRef.current.lastPhase = result.phase;
                stateRef.current.phase = result.phase;
                setPhase(result.phase);

                if (prev && result.phase === result.countWhen) {
                  stateRef.current.reps += 1;
                  const newReps = stateRef.current.reps;
                  setReps(newReps);
                  if (newReps >= targetReps) {
                    setStatus('done');
                    runningRef.current = false;
                    return;
                  }
                }
              }
            }
          } catch (e) {}
          if (runningRef.current) animRef.current = requestAnimationFrame(loop);
        }
        loop();

      } catch (err) {
        setStatus('error');
        setLoadMsg(err.message.includes('Permission') ? 'Camera permission denied. Allow camera access and try again.' : `Error: ${err.message}`);
      }
    }

    init();

    return () => {
      runningRef.current = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [exercise.id, targetReps]);

  const phaseLabels = {
    up: '⬆ Push up!', down: '⬇ Go down…',
    in: '⬅ Knee in!', out: '➡ Kick out!',
  };

  const phaseColors = {
    up: '#10B981', down: '#EF4444', in: '#3B82F6', out: '#10B981',
  };

  const pct = Math.round((reps / targetReps) * 100);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 400, display: 'flex', flexDirection: 'column', fontFamily: 'Outfit, sans-serif' }}>

      {/* Camera area */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} playsInline muted />
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'scaleX(-1)' }} />

        {/* Loading overlay */}
        {status === 'loading' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', padding: 24 }}>
            <div style={{ fontSize: 48, marginBottom: 16, animation: 'spin 1s linear infinite', display: 'inline-block' }}>🤖</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>{loadMsg}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>First load downloads AI model. Cached after that.</div>
          </div>
        )}

        {/* Error overlay */}
        {status === 'error' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <div style={{ color: '#EF4444', fontSize: 15, fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>{loadMsg}</div>
            <button onClick={onClose} style={{ marginTop: 16, padding: '12px 24px', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10, color: '#fff', fontSize: 14, cursor: 'pointer' }}>Go Back</button>
          </div>
        )}

        {/* Done overlay */}
        {status === 'done' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(16,185,129,0.93)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>💪</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#000', marginBottom: 4 }}>{targetReps} reps done!</div>
            <div style={{ fontSize: 15, color: 'rgba(0,0,0,0.6)', marginBottom: 28 }}>Set {set} of {totalSets} complete</div>
            <button onClick={onComplete} style={{ padding: '16px 40px', background: '#000', color: '#10B981', border: 'none', borderRadius: 14, fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>
              {set < totalSets ? `Next Set →` : 'Finish Exercise ✓'}
            </button>
          </div>
        )}

        {/* Live angle indicator (top left) */}
        {status === 'ready' && liveAngle !== null && (
          <div style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(0,0,0,0.7)', borderRadius: 10, padding: '6px 12px', display: 'flex', flex: 'column', gap: 2 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>ANGLE</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#F59E0B', fontFamily: 'DM Mono, monospace' }}>{liveAngle}°</div>
          </div>
        )}

        {/* Set indicator (top right) */}
        {status === 'ready' && (
          <div style={{ position: 'absolute', top: 16, right: 60, background: 'rgba(0,0,0,0.7)', borderRadius: 10, padding: '6px 12px' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>SET</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{set}/{totalSets}</div>
          </div>
        )}

        {/* Camera angle tip */}
        {status === 'ready' && reps === 0 && (
          <div style={{ position: 'absolute', bottom: 120, left: 16, right: 16, background: 'rgba(0,0,0,0.75)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
            📐 {exercise.cameraHint}
          </div>
        )}

        {/* Close */}
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>

      {/* Bottom HUD */}
      {status === 'ready' && (
        <div style={{ background: '#0A0D17', borderTop: '1px solid #1F2D45', padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{exercise.name}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: phaseColors[phase] || '#10B981' }}>
                {phaseLabels[phase] || '⬆ Ready — start moving!'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#3D5070', marginBottom: 2 }}>REPS</div>
              <div style={{ fontSize: 48, fontWeight: 700, lineHeight: 1, color: '#10B981', fontFamily: 'DM Mono, monospace' }}>{reps}</div>
              <div style={{ fontSize: 11, color: '#3D5070', marginTop: 2 }}>/ {targetReps}</div>
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ background: '#1F2D45', borderRadius: 100, height: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 100, background: '#10B981', width: `${pct}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}
    </div>
  );
}
