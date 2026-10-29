// ASMR engine: every trigger is synthesised live in the browser (Web Audio), never a loop, and placed in 3D around
// your head with HRTF panning (the same trick as binaural mics), which is what makes sounds feel like they are
// right at your ear. Best with headphones. The room shuffles triggers on its own (45–90 s each, crossfaded, never
// the same twice in a row); ♥ makes a trigger come up more often, skipping it makes it rarer.
//
// Each trigger is `run(v)`: called every ~100 ms with v = { ctx, now, until, out, pos(), noise(), tone(), rnd, density },
// it schedules its own sounds ahead of time. `out` is the trigger's own gain (for fades).

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const TRIGGERS = [
  { id: 'tapping', name: 'Finger tapping', emoji: '🫰' },
  { id: 'nails', name: 'Nail scratching', emoji: '💅' },
  { id: 'brush', name: 'Soft brushing', emoji: '🖌️' },
  { id: 'whoosh', name: 'Ear to ear', emoji: '🌬️' },
  { id: 'crinkle', name: 'Crinkling', emoji: '🛍️' },
  { id: 'rain', name: 'Rain on glass', emoji: '🌧️' },
  { id: 'drops', name: 'Water drops', emoji: '💧' },
  { id: 'typing', name: 'Keyboard typing', emoji: '⌨️' },
  { id: 'pages', name: 'Page turning', emoji: '📖' },
  { id: 'wood', name: 'Wood tapping', emoji: '🪵' },
  { id: 'fire', name: 'Fire crackle', emoji: '🔥' },
  { id: 'bubbles', name: 'Bubble wrap', emoji: '🫧' },
  { id: 'mist', name: 'Spray mist', emoji: '💨' },
  { id: 'mic', name: 'Fluffy mic', emoji: '🎙️' },
];

export class AsmrEngine {
  constructor({ onEvent, onTrigger } = {}) {
    this.onEvent = onEvent || (() => {});
    this.onTrigger = onTrigger || (() => {});
    this.weights = {};
    this.density = 1;
    this.current = null;
    this.timer = null;
  }

  async start() {
    if (this.ctx) { await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC({ latencyHint: 'playback' });
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 2.5; comp.attack.value = 0.003; comp.release.value = 0.15;
    this.master.connect(comp).connect(ctx.destination);
    // A small, close room: a short reverb, mixed in lightly.
    this.verb = ctx.createConvolver(); this.verb.buffer = this.makeIR(0.7);
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.18;
    this.verb.connect(this.verbGain).connect(this.master);
    this.white = this.makeNoise('white'); this.pink = this.makeNoise('pink'); this.brown = this.makeNoise('brown');
    ctx.listener.positionX ? (ctx.listener.positionX.value = 0) : ctx.listener.setPosition(0, 0, 0);
    this.loop();
    this.shuffle();
  }

  makeNoise(kind) {
    const len = this.ctx.sampleRate * 3;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18; }
      else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return buf;
  }

  makeIR(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    return buf;
  }

  // A 3D spot. x: left (-1) to right (+1), z: in front (-) / behind (+); close to the head = ear-tingly.
  panner(x, y = 0, z = -0.3) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 0.4; p.rolloffFactor = 1.2;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    return p;
  }
  movePanner(p, from, to, t0, dur) {
    if (!p.positionX) return;
    p.positionX.setValueAtTime(from[0], t0); p.positionX.linearRampToValueAtTime(to[0], t0 + dur);
    p.positionZ.setValueAtTime(from[2] ?? -0.3, t0); p.positionZ.linearRampToValueAtTime(to[2] ?? -0.3, t0 + dur);
  }

  // One noise burst through a filter, shaped by an envelope, at a spot. Returns its start time.
  burst(out, t, { buf = this.white, type = 'bandpass', f = 2000, q = 3, a = 0.001, d = 0.04, peak = 0.6, pos = [0, 0, -0.3], f2 = null, verb = 0.3, rate = 1 }) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    const p = this.panner(...pos);
    s.connect(fl).connect(g).connect(p).connect(out);
    if (verb) { const vg = c.createGain(); vg.gain.value = verb; p.connect(vg).connect(this.verb); }
    s.start(t, Math.random() * 2, a + d + 0.05);
    this.onEvent(peak, t - this.ctx.currentTime);
    return p;
  }

  tone(out, t, { f = 600, f2 = null, d = 0.08, peak = 0.3, type = 'sine', pos = [0, 0, -0.3], verb = 0.5 }) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const p = this.panner(...pos);
    o.connect(g).connect(p).connect(out);
    if (verb) { const vg = c.createGain(); vg.gain.value = verb; p.connect(vg).connect(this.verb); }
    o.start(t); o.stop(t + d + 0.05);
    this.onEvent(peak, t - this.ctx.currentTime);
  }

  // A long noise bed (rain, fire) that fades in and out with the trigger.
  bed(out, buf, { type = 'lowpass', f = 1200, gain = 0.15, pos = [0, 0, -1] }) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f;
    const g = c.createGain(); g.gain.value = gain;
    s.connect(fl).connect(g).connect(this.panner(...pos)).connect(out);
    s.start();
    return s;
  }

  // ── Triggers ──────────────────────────────────────────────────────────────
  // Each schedules sounds up to `ahead` seconds into the future and remembers how far it got (state.next).
  schedule(trig, st, out, now, ahead) {
    const dens = this.density;
    const side = () => (st.side = -(st.side || 1)) * rnd(0.35, 0.8);
    while ((st.next || now) < now + ahead) {
      const t = Math.max(st.next || now, now);
      switch (trig) {
        case 'tapping': {
          const n = Math.floor(rnd(4, 12) * dens); const gap = rnd(0.08, 0.16); const x = side(); const f = rnd(1600, 3200);
          for (let i = 0; i < n; i++) { const tt = t + i * gap * rnd(0.85, 1.15); this.burst(out, tt, { f: f * rnd(0.9, 1.1), q: 5, d: rnd(0.025, 0.06), peak: rnd(0.35, 0.7), pos: [x, 0, -0.25] }); this.tone(out, tt, { f: rnd(170, 260), d: 0.05, peak: 0.15, pos: [x, 0, -0.25], verb: 0.2 }); }
          st.next = t + n * gap + rnd(0.6, 2.2) / dens; break;
        }
        case 'nails': {
          const len = rnd(0.4, 1.2); const x = side(); const steps = Math.floor(len * rnd(16, 28));
          for (let i = 0; i < steps; i++) this.burst(out, t + (i * len) / steps, { f: rnd(2200, 3600), q: 2.5, d: 0.03, peak: rnd(0.15, 0.35), pos: [x, 0.1, -0.2], verb: 0.1 });
          st.next = t + len + rnd(0.4, 1.6) / dens; break;
        }
        case 'brush': case 'mic': {
          const len = rnd(0.8, 1.7); const x = side(); const mic = trig === 'mic';
          const p = this.burst(out, t, { buf: this.pink, type: mic ? 'lowpass' : 'bandpass', f: mic ? 1100 : rnd(700, 1100), f2: mic ? 600 : rnd(1800, 2800), q: mic ? 0.7 : 1.2, a: len * 0.45, d: len * 0.55, peak: mic ? 0.9 : 0.7, pos: [x, 0, -0.18], verb: 0.15 });
          this.movePanner(p, [x, 0, -0.18], [x * 0.3, 0, -0.35], t, len);
          st.next = t + len * rnd(0.7, 1.1) + rnd(0.1, 0.8) / dens; break;
        }
        case 'whoosh': {
          const len = rnd(1.6, 2.8); const from = side() > 0 ? 1 : -1;
          const p = this.burst(out, t, { buf: this.pink, type: 'lowpass', f: 900, f2: 1400, q: 0.5, a: len * 0.5, d: len * 0.5, peak: 0.9, pos: [from, 0, -0.1], verb: 0.2 });
          this.movePanner(p, [from, 0, -0.1], [-from, 0, -0.1], t, len);
          st.next = t + len + rnd(0.5, 2) / dens; break;
        }
        case 'crinkle': {
          const n = Math.floor(rnd(15, 45) * dens); const x = side(); const span = rnd(0.6, 1.6);
          for (let i = 0; i < n; i++) this.burst(out, t + Math.random() * span, { type: 'highpass', f: rnd(3500, 6000), q: 0.7, d: rnd(0.003, 0.012), peak: rnd(0.2, 0.6), pos: [x + rnd(-0.1, 0.1), 0, -0.25], verb: 0.15 });
          st.next = t + span + rnd(0.5, 1.8) / dens; break;
        }
        case 'rain': case 'fire': {
          if (!st.bed) st.bed = this.bed(out, trig === 'rain' ? this.pink : this.brown, trig === 'rain' ? { f: 1800, gain: 0.22 } : { f: 500, gain: 0.35 });
          const n = Math.floor(rnd(3, 9) * dens);
          for (let i = 0; i < n; i++) {
            const tt = t + Math.random() * 0.5; const pos = [rnd(-0.9, 0.9), rnd(-0.2, 0.4), rnd(-0.6, -0.2)];
            if (trig === 'rain') this.tone(out, tt, { f: rnd(2200, 4200), f2: rnd(1500, 2200), d: rnd(0.015, 0.04), peak: rnd(0.04, 0.12), pos, verb: 0.4 });
            else this.burst(out, tt, { type: 'highpass', f: rnd(1500, 4000), q: 0.8, d: rnd(0.004, 0.02), peak: rnd(0.2, 0.7), pos, verb: 0.3 });
          }
          st.next = t + 0.5; break;
        }
        case 'drops': {
          const pos = [rnd(-0.8, 0.8), rnd(-0.2, 0.3), rnd(-0.5, -0.15)];
          this.tone(out, t, { f: rnd(900, 1600), f2: rnd(300, 500), d: rnd(0.05, 0.1), peak: rnd(0.25, 0.45), pos, verb: 0.9 });
          st.next = t + rnd(0.35, 1.4) / dens; break;
        }
        case 'typing': {
          const word = Math.floor(rnd(3, 8)); const x = rnd(-0.5, 0.5);
          for (let i = 0; i < word; i++) { const tt = t + i * rnd(0.07, 0.15); this.burst(out, tt, { f: rnd(2500, 4000), q: 3, d: 0.015, peak: rnd(0.3, 0.5), pos: [x + rnd(-0.15, 0.15), -0.2, -0.4], verb: 0.15 }); this.burst(out, tt + 0.02, { f: rnd(900, 1400), q: 4, d: 0.02, peak: 0.2, pos: [x, -0.2, -0.4], verb: 0.1 }); }
          st.next = t + word * 0.12 + rnd(0.15, 0.6) / dens; break;
        }
        case 'pages': {
          const len = rnd(0.45, 0.8); const x = side();
          const p = this.burst(out, t, { buf: this.white, f: 1600, f2: 600, q: 1, a: 0.08, d: len, peak: 0.45, pos: [x, 0, -0.35], verb: 0.25 });
          this.movePanner(p, [x, 0, -0.35], [-x * 0.5, 0, -0.35], t, len);
          for (let i = 0; i < 6; i++) this.burst(out, t + Math.random() * len, { type: 'highpass', f: 4000, d: 0.01, peak: 0.15, pos: [x, 0, -0.3], verb: 0.1 });
          st.next = t + len + rnd(1.2, 3.5) / dens; break;
        }
        case 'wood': {
          const n = Math.floor(rnd(2, 6)); const x = side(); const f = rnd(700, 1300);
          for (let i = 0; i < n; i++) this.burst(out, t + i * rnd(0.18, 0.3), { f: f * pick([1, 1, 1.12, 0.9]), q: 18, d: 0.14, peak: 0.6, pos: [x, 0, -0.3], verb: 0.5 });
          st.next = t + n * 0.25 + rnd(0.5, 1.8) / dens; break;
        }
        case 'bubbles': {
          const n = Math.floor(rnd(2, 7)); const x = side();
          for (let i = 0; i < n; i++) { const tt = t + i * rnd(0.12, 0.35); this.burst(out, tt, { type: 'bandpass', f: rnd(1800, 3000), q: 2, d: 0.02, peak: 0.7, pos: [x + rnd(-0.1, 0.1), 0, -0.3], verb: 0.3 }); this.tone(out, tt, { f: rnd(300, 500), f2: 150, d: 0.04, peak: 0.2, pos: [x, 0, -0.3] }); }
          st.next = t + n * 0.3 + rnd(0.4, 1.5) / dens; break;
        }
        case 'mist': {
          const n = Math.floor(rnd(1, 4)); const x = side();
          for (let i = 0; i < n; i++) this.burst(out, t + i * 0.35, { type: 'highpass', f: 5000, q: 0.6, a: 0.02, d: rnd(0.2, 0.35), peak: 0.4, pos: [x, 0.2, -0.2], verb: 0.2 });
          st.next = t + n * 0.35 + rnd(1, 3) / dens; break;
        }
        default: st.next = t + 1;
      }
    }
  }

  loop() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      for (const layer of [this.current, this.leaving]) if (layer) this.schedule(layer.id, layer.st, layer.out, now, 0.35);
    }, 100);
  }

  // Next trigger: weighted random, never the one that just played; crossfade 3 s.
  shuffle(forceId = null) {
    const c = this.ctx;
    const prev = this.current;
    const pool = TRIGGERS.filter((t) => t.id !== prev?.id && (this.weights[t.id] ?? 1) > 0);
    const total = pool.reduce((s, t) => s + (this.weights[t.id] ?? 1), 0);
    let r = Math.random() * total; let next = pool[0];
    for (const t of pool) { r -= this.weights[t.id] ?? 1; if (r <= 0) { next = t; break; } }
    if (forceId) next = TRIGGERS.find((t) => t.id === forceId) || next;
    const out = c.createGain(); out.gain.value = 0.0001; out.connect(this.master);
    out.gain.exponentialRampToValueAtTime(1, c.currentTime + 3);
    if (prev) {
      prev.out.gain.setTargetAtTime(0.0001, c.currentTime, 0.9);
      const old = prev; this.leaving = old;
      setTimeout(() => { try { old.st.bed?.stop(); old.out.disconnect(); } catch { /* gone */ } if (this.leaving === old) this.leaving = null; }, 4500);
    }
    this.current = { id: next.id, st: {}, out, startedAt: Date.now() };
    this.onTrigger(next);
    clearTimeout(this.shuffleTimer);
    this.shuffleTimer = setTimeout(() => this.shuffle(), rnd(45, 90) * 1000);
  }

  setWeights(w) { this.weights = { ...w }; }
  setDensity(d) { this.density = d; }
  setVolume(v) { if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2); }
  fadeOut(seconds = 20) { if (this.master) this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, seconds / 4); setTimeout(() => this.pause(), seconds * 1000); }
  pause() { clearTimeout(this.shuffleTimer); this.ctx?.suspend(); }
  async resume() { await this.ctx?.resume(); this.setVolume(0.9); clearTimeout(this.shuffleTimer); this.shuffleTimer = setTimeout(() => this.shuffle(), rnd(45, 90) * 1000); }
  stop() { clearInterval(this.timer); clearTimeout(this.shuffleTimer); try { this.current?.st.bed?.stop(); this.ctx?.close(); } catch { /* closed */ } this.ctx = null; }
}
