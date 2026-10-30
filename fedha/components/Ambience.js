import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { THEMES, themeKeyFor, applyTheme } from '../lib/themes';

// The moving background behind every screen: slow flowing silk in the section's colours (lib/themes.js), like a
// looping video but drawn live, so it costs no data. Each section adds its own motion: a faint grid for markets and
// code, a projector beam for the Chill Room, a soft beat for music and workouts. Switching sections blends the
// colours over ~1.2 s. Drawn small (about a third of screen size) at up to 30 fps, paused when the app is hidden,
// still when the phone asks for reduced motion. No WebGL → a plain gradient in the same colours.

const FRAG = `
precision mediump float;
uniform vec2 r; uniform float t; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform float mode;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * n(p); p *= 2.03; a *= 0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / r;
  vec2 p = uv * vec2(r.x / r.y, 1.0) * 1.7;
  float tt = t * 0.035;
  vec2 q = vec2(fbm(p + vec2(tt, -tt * 0.6)), fbm(p + vec2(5.2, 1.3) - tt));
  float f = fbm(p + 2.2 * q + vec2(tt * 1.4, -tt));
  float silk = pow(sin(p.x * 1.1 + p.y * 0.7 + f * 6.5 + t * 0.12) * 0.5 + 0.5, 7.0);
  vec3 col = mix(c1, c2, smoothstep(0.25, 0.95, f));
  col = mix(col, c3, silk * 0.42 * smoothstep(0.35, 1.0, f));
  if (mode > 0.5 && mode < 1.5) {           // grid: markets / code
    vec2 g = abs(fract(vec2(p.x * 5.0, p.y * 5.0 + t * 0.05)) - 0.5);
    float line = smoothstep(0.47, 0.5, max(g.x, g.y));
    col += c3 * line * 0.07 * uv.y;
  } else if (mode > 1.5 && mode < 2.5) {    // projector beam: cinema
    float x = uv.x - 0.5 - (1.0 - uv.y) * 0.25 * sin(t * 0.07);
    float beam = exp(-pow(x * 3.2 / max(0.25, 1.15 - uv.y), 2.0)) * smoothstep(0.1, 1.0, uv.y);
    col += c3 * beam * 0.22 * (0.85 + 0.15 * sin(t * 3.1));
  } else if (mode > 2.5) {                  // beat: music / energy
    float d = length(uv - vec2(0.5, 0.95));
    col += c3 * (0.10 + 0.06 * sin(t * 2.0)) * exp(-d * 2.6);
  }
  col += c3 * 0.18 * exp(-length(uv - vec2(0.15, 1.05)) * 2.2);   // light from the top corner
  col *= mix(0.42, 1.0, smoothstep(0.0, 0.85, uv.y));               // darker at the bottom, so text stays easy to read
  col *= 1.0 - 0.35 * pow(length(uv - 0.5) * 1.15, 2.0);            // vignette
  gl_FragColor = vec4(col, 1.0);
}`;

const VERT = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
const rgb = (hex) => { const v = parseInt(hex.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };

export default function Ambience() {
  const router = useRouter();
  const key = themeKeyFor(router.pathname);
  const canvas = useRef(null);
  const target = useRef(THEMES[key]);
  const off = router.pathname === '/reels' || router.pathname.startsWith('/certificate');

  useEffect(() => { target.current = THEMES[key]; applyTheme(key); }, [key]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || off) return undefined;
    const gl = el.getContext('webgl', { antialias: false, depth: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) { el.dataset.fallback = '1'; return undefined; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { el.dataset.fallback = '1'; return undefined; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = Object.fromEntries(['r', 't', 'c1', 'c2', 'c3', 'mode'].map((k) => [k, gl.getUniformLocation(prog, k)]));

    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const SCALE = 0.34;
    const resize = () => {
      const w = Math.max(64, Math.round(window.innerWidth * SCALE));
      const hgt = Math.max(64, Math.round(window.innerHeight * SCALE));
      if (el.width !== w || el.height !== hgt) { el.width = w; el.height = hgt; gl.viewport(0, 0, w, hgt); }
    };
    resize();
    window.addEventListener('resize', resize);

    const cur = { c1: rgb(target.current.c1), c2: rgb(target.current.c2), c3: rgb(target.current.c3), mode: target.current.mode, speed: target.current.speed };
    let raf = 0; let last = 0; let clock = Math.random() * 400; let prev = performance.now();
    const ease = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return; // ~30 fps is plenty for slow silk
      last = now;
      const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
      const tg = target.current;
      const k = Math.min(1, dt * 2.2); // colour blend when the section changes
      cur.c1 = ease(cur.c1, rgb(tg.c1), k); cur.c2 = ease(cur.c2, rgb(tg.c2), k); cur.c3 = ease(cur.c3, rgb(tg.c3), k);
      cur.speed += (tg.speed - cur.speed) * k;
      if (Math.abs(cur.mode - tg.mode) > 0.01) cur.mode = tg.mode;
      clock += dt * cur.speed;
      gl.uniform2f(U.r, el.width, el.height);
      gl.uniform1f(U.t, clock);
      gl.uniform3fv(U.c1, cur.c1); gl.uniform3fv(U.c2, cur.c2); gl.uniform3fv(U.c3, cur.c3);
      gl.uniform1f(U.mode, cur.mode);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (still) { cancelAnimationFrame(raf); raf = 0; }
    };
    const start = () => { if (!raf) { prev = performance.now(); raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const vis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', vis);
    start();
    // Reduced motion: redraw once when the section changes.
    const poke = still ? setInterval(() => start(), 1200) : null;
    return () => { stop(); if (poke) clearInterval(poke); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', vis); };
  }, [off]);

  if (off) return null;
  return (
    <div className="lx-ambience" aria-hidden="true">
      <canvas ref={canvas} />
      <div className="lx-grain" />
    </div>
  );
}
