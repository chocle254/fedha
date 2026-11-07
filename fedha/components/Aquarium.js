import { useEffect, useRef } from 'react';

// Sapphire's living background: a deep-water aquarium in real 3D (three.js, loaded only for this tier).
// Every creature is built in code, no downloads: blue tangs, clownfish, emperor angelfish, groupers, two sardine
// schools, sharks cruising far off, manta rays and glowing jellyfish. Each swims its own path through the
// water (tail and body bend as it swims, mantas flap, jellies pulse) and some head off into the blue until the
// water swallows them, then come back from the distance. Light shafts, caustics on the fish and the sand,
// swaying kelp and drifting marine snow. Pauses on low battery (html.lx-saver) and when the app is hidden.

const FISH_VERT = `
uniform float uTime; uniform float uAmp; uniform float uFreq;
attribute float aPart; attribute float aPhase; attribute float aSpeed;
varying vec3 vPos; varying vec3 vN; varying vec3 vView; varying vec3 vWorld; varying float vPart;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float s = clamp((0.15 - p.x) / 0.65, 0.0, 1.0);
  p.z += sin(uTime * uFreq * aSpeed + aPhase - p.x * 5.0) * uAmp * s * s;
  vPos = position; vPart = aPart;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  vN = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vView = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const COMMON_FRAG = `
uniform float uTime; uniform vec3 uLight;
float ss(float a, float b, float x) { return a < b ? smoothstep(a, b, x) : 1.0 - smoothstep(b, a, x); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float caustic(vec2 p) {
  vec2 q = p; float v = 0.0;
  for (int i = 0; i < 3; i++) { q += vec2(sin(q.y * 1.7 + uTime * 0.6), cos(q.x * 1.3 - uTime * 0.5)); v += 1.0 / (1.0 + 4.0 * abs(sin(q.x) + cos(q.y))); }
  return pow(v / 3.0, 2.0) * 1.6;
}
vec3 shade(vec3 col, vec3 n, vec3 view, vec3 world, float shine) {
  vec3 N = normalize(n); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(view);
  vec3 L = normalize((viewMatrix * vec4(uLight, 0.0)).xyz);
  float wrap = dot(N, L) * 0.5 + 0.5;
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 40.0) * shine;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  float c = caustic(world.xz * 0.35) * max(dot(N, L), 0.0);
  return col * (0.22 + 0.8 * wrap * wrap + 0.4 * c) + spec * vec3(0.85, 0.95, 1.0) + rim * vec3(0.10, 0.28, 0.42);
}`;

const FISH_FRAG = `
uniform vec3 uBack; uniform vec3 uBelly; uniform vec3 uFin; uniform vec3 uAccent;
uniform int uPattern; uniform float uH; uniform float uEye; uniform float uShine;
varying vec3 vPos; varying vec3 vN; varying vec3 vView; varying vec3 vWorld; varying float vPart;
${COMMON_FRAG}
#include <fog_pars_fragment>
float band(float t, float c, float w) { return 1.0 - ss(w, w + 0.012, abs(t - c)); }
void main() {
  float t = vPos.x + 0.5;                                   // 0 tail .. 1 nose
  float up = clamp(vPos.y / uH + 0.5, 0.0, 1.0);            // 0 belly .. 1 back
  vec3 col = mix(uBelly, uBack, ss(0.3, 0.7, up));
  float scales = noise(vec2(t * 70.0, up * 36.0));
  if (uPattern == 1) {                                      // clownfish: white bands edged in black
    float w = band(t, 0.76, 0.05) + band(t, 0.48, 0.06) + band(t, 0.14, 0.03);
    float e = band(t, 0.76, 0.065) + band(t, 0.48, 0.075) + band(t, 0.14, 0.045) - w;
    col = mix(col, vec3(0.97), clamp(w, 0.0, 1.0)); col = mix(col, vec3(0.03), clamp(e, 0.0, 1.0));
  } else if (uPattern == 2) {                               // blue tang: dark palette mark, yellow tail
    float m = ss(0.02, 0.0, abs(up - 0.62 - 0.12 * sin(t * 7.0)) - 0.1) * ss(0.15, 0.3, t) * ss(0.92, 0.75, t);
    col = mix(col, vec3(0.02, 0.03, 0.12), m);
    col = mix(col, uAccent, ss(0.1, 0.04, t));
  } else if (uPattern == 3) {                               // emperor angelfish: slanted yellow stripes
    float s = ss(0.42, 0.5, abs(fract(up * 9.0 + t * 4.0) - 0.5) * 2.0);
    col = mix(uBack, uAccent, s * ss(0.82, 0.7, t));
    col = mix(col, vec3(0.04, 0.05, 0.15), ss(0.8, 0.86, t) * ss(0.95, 0.9, t));
    col = mix(col, uAccent, ss(0.08, 0.02, t));
  } else if (uPattern == 4) {                               // sardine: mirror-silver sides
    col += vec3(0.25, 0.3, 0.35) * pow(scales, 3.0) * (1.0 - up);
  } else if (uPattern == 5) {                               // grouper: mottled blotches
    col *= 0.65 + 0.5 * ss(0.35, 0.65, noise(vec2(t * 9.0, up * 6.0)));
  }
  col *= 0.9 + 0.12 * scales;
  if (vPart > 0.5) col = mix(uFin, uFin * 0.7, 0.5 + 0.5 * sin(vPos.y * 60.0 + vPos.x * 20.0));
  float shine = uShine;
  vec2 e = vec2(vPos.x - 0.36, vPos.y - uH * 0.12);
  float d = length(e);
  if (vPart < 0.5 && d < uEye) {                            // eye with a wet highlight
    col = mix(vec3(0.9, 0.75, 0.3), vec3(0.01), ss(uEye * 0.55, uEye * 0.45, d));
    if (length(e - vec2(0.004, uEye * 0.3)) < uEye * 0.22) col = vec3(1.0);
    shine = 1.2;
  }
  gl_FragColor = vec4(shade(col, vN, vView, vWorld, shine), 1.0);
  #include <fog_fragment>
}`;

const MANTA_VERT = `
uniform float uTime; uniform float uSpan;
attribute float aPhase; attribute float aSpeed;
varying vec3 vPos; varying vec3 vN; varying vec3 vView; varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float k = abs(p.z) / uSpan;
  p.y += sin(uTime * 1.3 * aSpeed + aPhase - abs(p.z) * 0.9) * 0.45 * k * k;
  vPos = position;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  vN = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vView = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const MANTA_FRAG = `
varying vec3 vPos; varying vec3 vN; varying vec3 vView; varying vec3 vWorld;
${COMMON_FRAG}
#include <fog_pars_fragment>
void main() {
  vec3 top = vec3(0.07, 0.09, 0.12) * (0.75 + 0.5 * noise(vPos.xz * 4.0));
  vec3 col = gl_FrontFacing ? top : vec3(0.85, 0.88, 0.9) - 0.4 * ss(0.6, 0.3, noise(vPos.xz * 5.0)) * 0.3;
  gl_FragColor = vec4(shade(col, vN, vView, vWorld, 0.35), 1.0);
  #include <fog_fragment>
}`;

const JELLY_VERT = `
uniform float uTime; uniform float uPhase;
varying vec3 vN; varying vec3 vView; varying vec3 vPos; varying float vFog;
void main() {
  vec3 p = position;
  float pulse = sin(uTime * 1.8 + uPhase);
  p.xz *= 1.0 + 0.13 * pulse; p.y *= 1.0 - 0.12 * pulse;
  vPos = position;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal); vView = -mvPosition.xyz; vFog = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}`;

const JELLY_FRAG = `
uniform vec3 uColor; uniform float uDensity;
varying vec3 vN; varying vec3 vView; varying vec3 vPos; varying float vFog;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.0);
  float rib = 0.5 + 0.5 * sin(atan(vPos.z, vPos.x) * 8.0);
  vec3 col = uColor * (0.18 + 1.3 * f + 0.25 * rib * (1.0 - vPos.y));
  float fog = exp(-uDensity * uDensity * vFog * vFog);
  gl_FragColor = vec4(col * fog, 1.0);
}`;

const TENT_VERT = `
uniform float uTime; uniform float uPhase;
attribute float aK;
varying float vK; varying float vFog;
void main() {
  vec3 q = position;
  float pulse = sin(uTime * 1.8 + uPhase);
  q.xz *= 1.0 + 0.13 * pulse * (1.0 - aK);
  q.x += sin(uTime * 1.3 + uPhase + aK * 6.0 + position.z * 3.0) * 0.3 * aK;
  q.z += cos(uTime * 1.1 + uPhase + aK * 5.0 + position.x * 3.0) * 0.3 * aK;
  q.y -= 0.15 * pulse * aK;
  vK = aK;
  vec4 mvPosition = modelViewMatrix * vec4(q, 1.0);
  vFog = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}`;

const TENT_FRAG = `
uniform vec3 uColor; uniform float uDensity;
varying float vK; varying float vFog;
void main() { gl_FragColor = vec4(uColor * (0.55 * (1.0 - vK) + 0.08) * exp(-uDensity * uDensity * vFog * vFog), 1.0); }`;

const KELP_VERT = `
uniform float uTime;
attribute float aPhase;
varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float k = uv.y;
  p.x *= 1.0 - 0.55 * k;
  p.x += sin(uTime * 0.55 + aPhase + p.y * 0.25) * 1.2 * pow(k, 1.5);
  p.z += cos(uTime * 0.45 + aPhase + p.y * 0.2) * 0.8 * pow(k, 1.5);
  vUv = uv;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  vN = normalize(mat3(viewMatrix) * mat3(instanceMatrix) * normal);
  vView = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const KELP_FRAG = `
varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying vec3 vWorld;
${COMMON_FRAG}
#include <fog_pars_fragment>
void main() {
  float vein = ss(0.08, 0.0, abs(vUv.x - 0.5));
  vec3 col = mix(vec3(0.16, 0.22, 0.06), vec3(0.32, 0.36, 0.1), vUv.y) + vein * 0.06;
  gl_FragColor = vec4(shade(col, vN, vView, vWorld, 0.15), 1.0);
  #include <fog_fragment>
}`;

const SAND_FRAG = `
varying vec3 vWorld;
${COMMON_FRAG}
#include <fog_pars_fragment>
void main() {
  vec3 col = vec3(0.55, 0.5, 0.38) * (0.8 + 0.25 * noise(vWorld.xz * 0.6) + 0.1 * noise(vWorld.xz * 6.0));
  col *= 0.55 + 0.75 * caustic(vWorld.xz * 0.22);
  gl_FragColor = vec4(col * 0.6, 1.0);
  #include <fog_fragment>
}`;

const SAND_VERT = `
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SKY_VERT = `varying vec3 vDir; void main() { vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uDeep;
varying vec3 vDir;
void main() {
  float h = normalize(vDir).y;
  vec3 c = mix(uDeep, uMid, smoothstep(-0.55, 0.0, h));
  c = mix(c, uTop, smoothstep(0.0, 0.75, h));
  c += vec3(0.25, 0.45, 0.55) * pow(max(h, 0.0), 10.0);
  gl_FragColor = vec4(c, 1.0);
}`;

const SHAFT_VERT = `varying vec2 vUv; varying float vFog; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vFog = -mv.z; gl_Position = projectionMatrix * mv; }`;
const SHAFT_FRAG = `
uniform float uTime; uniform float uPhase; uniform float uDensity;
varying vec2 vUv; varying float vFog;
void main() {
  float edge = pow(sin(3.14159 * vUv.x), 2.0);
  float fall = pow(vUv.y, 1.6);
  float flicker = 0.75 + 0.25 * sin(uTime * 0.8 + uPhase + vUv.x * 6.0);
  float a = edge * fall * flicker * 0.22 * exp(-uDensity * uDensity * vFog * vFog * 0.4);
  gl_FragColor = vec4(vec3(0.55, 0.85, 1.0) * a, 1.0);
}`;

// Species: body proportions (length 1), fins, colours and how they swim.
const SPECIES = [
  { key: 'tang', n: 5, len: [1.1, 1.5], h: 0.62, w: 0.15, blunt: 0.55, tail: [0.2, 0.2, 0.55], dorsal: [0.32, -0.38, 0.12], anal: [0.1, -0.36, 0.1], pattern: 2, back: '#1d4ed8', belly: '#3b82f6', fin: '#1e3a8a', accent: '#facc15', speed: 1.7, amp: 0.07, freq: 7, eye: 0.045, shine: 0.6 },
  { key: 'clown', n: 4, len: [0.7, 0.95], h: 0.44, w: 0.2, blunt: 0.5, tail: [0.18, 0.15, 0.85], dorsal: [0.3, -0.35, 0.1], anal: [0.0, -0.3, 0.07], pattern: 1, back: '#f97316', belly: '#fb923c', fin: '#ea580c', speed: 1.1, amp: 0.09, freq: 9, eye: 0.05, shine: 0.7 },
  { key: 'angel', n: 3, len: [1.3, 1.7], h: 0.72, w: 0.13, blunt: 0.5, tail: [0.16, 0.18, 0.95], dorsal: [0.25, -0.42, 0.1], anal: [0.15, -0.4, 0.09], pattern: 3, back: '#1e3a8a', belly: '#1e40af', fin: '#1e3a8a', accent: '#fde047', speed: 1.1, amp: 0.06, freq: 6, eye: 0.04, shine: 0.6 },
  { key: 'grouper', n: 2, len: [2.6, 3.4], h: 0.36, w: 0.27, blunt: 0.65, tail: [0.18, 0.16, 0.9], dorsal: [0.3, -0.35, 0.07], anal: [0.0, -0.3, 0.05], pattern: 5, back: '#5b4636', belly: '#9a8268', fin: '#4a3a2c', speed: 0.9, amp: 0.05, freq: 4, eye: 0.03, shine: 0.3 },
  { key: 'shark', n: 2, len: [6, 8], h: 0.19, w: 0.17, blunt: 0.9, tail: [0.24, 0.22, 0.45], shark: true, dorsal: [0.12, -0.08, 0.17], anal: null, pattern: 6, back: '#4b5563', belly: '#e5e7eb', fin: '#4b5563', speed: 2.4, amp: 0.05, freq: 2.2, eye: 0.012, shine: 0.25, far: true },
  { key: 'sardine', n: 48, len: [0.42, 0.55], h: 0.2, w: 0.1, blunt: 0.8, tail: [0.16, 0.13, 0.5], dorsal: [0.12, -0.06, 0.05], anal: null, pattern: 4, back: '#1e3a5f', belly: '#d1d5db', fin: '#94a3b8', speed: 3.0, amp: 0.08, freq: 14, eye: 0.04, shine: 1.0, school: 2 },
];

const BOUNDS = { x: 34, yLo: -13, yHi: 9, zNear: 5, zFar: -150 };

export default function Aquarium() {
  const ref = useRef(null);
  useEffect(() => {
    let stop = false; let cleanup = () => {};
    import('three').then((THREE) => {
      if (stop || !ref.current) return;
      try { cleanup = start(THREE, ref.current); } catch { cleanup = () => {}; } // no WebGL: the bubbles stay
    }).catch(() => {});
    return () => { stop = true; cleanup(); };
  }, []);
  return <div ref={ref} className="aq" />;
}

function start(THREE, host) {
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  host.appendChild(renderer.domElement);
  // A shader this phone can't compile: drop the aquarium rather than show a broken picture.
  let broken = false;
  renderer.debug.onShaderError = () => { broken = true; };

  const scene = new THREE.Scene();
  const FOG = new THREE.Color('#0b4a6e');
  const density = 0.022;
  scene.fog = new THREE.FogExp2(FOG, density);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 700);
  camera.position.set(0, 0, 14);

  const time = { value: 0 };
  const light = { value: new THREE.Vector3(0.3, 1, 0.25).normalize() };
  const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  // Water: a gradient dome, lighter towards the surface.
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(500, 24, 16)), keep(new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: { value: new THREE.Color('#2a8fc0') }, uMid: { value: FOG.clone() }, uDeep: { value: new THREE.Color('#02101f') } },
  })));
  sky.renderOrder = -1;
  scene.add(sky);

  // Seabed far below, with caustics.
  const sandMat = keep(new THREE.ShaderMaterial({ vertexShader: SAND_VERT, fragmentShader: SAND_FRAG, fog: true, uniforms: { ...fogU(), uTime: time, uLight: light } }));
  const sand = new THREE.Mesh(keep(new THREE.PlaneGeometry(600, 600)), sandMat);
  sand.rotation.x = -Math.PI / 2; sand.position.y = -18;
  scene.add(sand);

  // Kelp along the back and sides.
  const kelpGeo = keep(new THREE.PlaneGeometry(0.9, 22, 1, 24));
  kelpGeo.translate(0, 11, 0);
  const KELP = 26;
  kelpGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(KELP).map(() => Math.random() * 6.3), 1));
  const kelp = new THREE.InstancedMesh(kelpGeo, keep(new THREE.ShaderMaterial({ vertexShader: KELP_VERT, fragmentShader: KELP_FRAG, fog: true, side: THREE.DoubleSide, uniforms: { ...fogU(), uTime: time, uLight: light } })), KELP);
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const v1 = new THREE.Vector3(); const sc = new THREE.Vector3();
  for (let i = 0; i < KELP; i++) {
    const side = i % 2 ? 1 : -1;
    v1.set(side * (16 + Math.random() * 30), -18, -20 - Math.random() * 90);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
    const s = 0.7 + Math.random() * 0.9; sc.set(s, s, s);
    kelp.setMatrixAt(i, m4.compose(v1, q, sc));
  }
  kelp.frustumCulled = false;
  scene.add(kelp);

  // Light shafts from the surface.
  const shafts = [];
  const shaftGeo = keep(new THREE.PlaneGeometry(7, 70));
  for (let i = 0; i < 6; i++) {
    const m = keep(new THREE.ShaderMaterial({ vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: time, uPhase: { value: i * 1.7 }, uDensity: { value: density } } }));
    const sh = new THREE.Mesh(shaftGeo, m);
    sh.position.set(-30 + i * 12 + Math.random() * 4, 12, -25 - Math.random() * 50);
    sh.rotation.z = -0.25 + Math.random() * 0.1;
    sh.userData.base = sh.rotation.z;
    shafts.push(sh); scene.add(sh);
  }

  // Marine snow.
  const SNOW = 420;
  const snowPos = new Float32Array(SNOW * 3);
  for (let i = 0; i < SNOW; i++) { snowPos[i * 3] = (Math.random() - 0.5) * 70; snowPos[i * 3 + 1] = BOUNDS.yLo + Math.random() * 26; snowPos[i * 3 + 2] = 8 - Math.random() * 90; }
  const snowGeo = keep(new THREE.BufferGeometry());
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, keep(new THREE.PointsMaterial({ color: 0xbfe6ff, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false })));
  scene.add(snow);

  // ── Fish ──
  const creatures = [];
  const groups = [];
  for (const sp of SPECIES) {
    const geo = keep(fishGeometry(THREE, sp));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(sp.n).map(() => Math.random() * 6.3), 1));
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(new Float32Array(sp.n).map(() => 0.85 + Math.random() * 0.3), 1));
    const mat = keep(new THREE.ShaderMaterial({
      vertexShader: FISH_VERT, fragmentShader: FISH_FRAG, fog: true, side: THREE.DoubleSide,
      uniforms: {
        ...fogU(), uTime: time, uLight: light, uAmp: { value: sp.amp }, uFreq: { value: sp.freq },
        uBack: { value: new THREE.Color(sp.back) }, uBelly: { value: new THREE.Color(sp.belly) }, uFin: { value: new THREE.Color(sp.fin) },
        uAccent: { value: new THREE.Color(sp.accent || sp.fin) }, uPattern: { value: sp.pattern }, uH: { value: sp.h }, uEye: { value: sp.eye }, uShine: { value: sp.shine },
      },
    }));
    const mesh = new THREE.InstancedMesh(geo, mat, sp.n);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const group = { mesh, sp, list: [] };
    groups.push(group);
    if (sp.school) {
      const per = Math.ceil(sp.n / sp.school);
      for (let s = 0; s < sp.school; s++) {
        const leader = spawn(THREE, sp, true);
        leader.speed = sp.speed;
        const members = [];
        for (let i = s * per; i < Math.min(sp.n, (s + 1) * per); i++) {
          members.push({ i, off: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 3), size: sp.len[0] + Math.random() * (sp.len[1] - sp.len[0]), ph: Math.random() * 6.3 });
        }
        group.list.push({ leader, members });
      }
    } else {
      for (let i = 0; i < sp.n; i++) {
        const c = spawn(THREE, sp, true);
        c.i = i;
        creatures.push({ c, mesh });
      }
    }
  }

  // ── Manta rays ──
  const MANTA = 2;
  const mantaGeo = keep(mantaGeometry(THREE));
  mantaGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(MANTA).map(() => Math.random() * 6.3), 1));
  mantaGeo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(new Float32Array(MANTA).map(() => 0.9 + Math.random() * 0.2), 1));
  const mantaMesh = new THREE.InstancedMesh(mantaGeo, keep(new THREE.ShaderMaterial({ vertexShader: MANTA_VERT, fragmentShader: MANTA_FRAG, fog: true, side: THREE.DoubleSide, uniforms: { ...fogU(), uTime: time, uLight: light, uSpan: { value: 1 } } })), MANTA);
  mantaMesh.frustumCulled = false;
  scene.add(mantaMesh);
  const mantaSp = { len: [5, 7], speed: 1.7, far: true };
  for (let i = 0; i < MANTA; i++) { const c = spawn(THREE, mantaSp, true); c.i = i; creatures.push({ c, mesh: mantaMesh, flat: true }); }

  // ── Jellyfish ──
  const jellies = [];
  const bellGeo = keep(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55));
  const tentGeo = keep(tentacleGeometry(THREE));
  const JCOL = ['#f0abfc', '#93c5fd', '#fda4af', '#a5f3fc', '#c4b5fd'];
  for (let i = 0; i < 6; i++) {
    const color = new THREE.Color(JCOL[i % JCOL.length]);
    const uni = { uTime: time, uPhase: { value: Math.random() * 6.3 }, uColor: { value: color }, uDensity: { value: density } };
    const bell = new THREE.Mesh(bellGeo, keep(new THREE.ShaderMaterial({ vertexShader: JELLY_VERT, fragmentShader: JELLY_FRAG, uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
    const tent = new THREE.LineSegments(tentGeo, keep(new THREE.ShaderMaterial({ vertexShader: TENT_VERT, fragmentShader: TENT_FRAG, uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    const g = new THREE.Group();
    g.add(bell); g.add(tent);
    const s = 0.5 + Math.random() * 0.8;
    g.scale.set(s, s, s);
    g.position.set((Math.random() - 0.5) * 50, BOUNDS.yLo + Math.random() * 20, -10 - Math.random() * 70);
    g.userData = { drift: 0.25 + Math.random() * 0.3, sway: Math.random() * 6.3, tilt: (Math.random() - 0.5) * 0.4 };
    jellies.push(g); scene.add(g);
  }

  // ── Motion ──
  const up = new THREE.Vector3(0, 1, 0);
  const fx = new THREE.Vector3(); const fy = new THREE.Vector3(); const fz = new THREE.Vector3(); const desired = new THREE.Vector3();
  function steer(c, dt) {
    desired.subVectors(c.target, c.pos);
    const dist = desired.length();
    if (dist < 2.5) newTarget(THREE, c);
    desired.normalize();
    desired.y = Math.max(-0.35, Math.min(0.35, desired.y));
    desired.normalize();
    c.dir.lerp(desired, Math.min(1, c.turn * dt)).normalize();
    c.speed += (c.cruise * (0.8 + 0.4 * Math.sin(time.value * 0.3 + c.seed)) - c.speed) * Math.min(1, dt);
    c.pos.addScaledVector(c.dir, c.speed * dt);
    // Gone into the blue: come back from far away, heading this way.
    if (c.pos.z < BOUNDS.zFar - 25 || Math.abs(c.pos.x) > BOUNDS.x + 30) {
      c.pos.set((Math.random() - 0.5) * 2 * BOUNDS.x, BOUNDS.yLo + 3 + Math.random() * (BOUNDS.yHi - BOUNDS.yLo - 4), BOUNDS.zFar - 15);
      c.target.set((Math.random() - 0.5) * BOUNDS.x, BOUNDS.yLo + 3 + Math.random() * 12, -10 - Math.random() * 40);
      c.dir.subVectors(c.target, c.pos).normalize();
    }
  }
  function place(mesh, i, pos, dir, size, roll = 0) {
    fx.copy(dir);
    fz.crossVectors(fx, up).normalize();
    fy.crossVectors(fz, fx).normalize();
    if (roll) { fy.applyAxisAngle(fx, roll); fz.applyAxisAngle(fx, roll); }
    m4.makeBasis(fx, fy, fz);
    m4.scale(sc.set(size, size, size));
    m4.setPosition(pos);
    mesh.setMatrixAt(i, m4);
  }

  const tmp = new THREE.Vector3();
  let last = performance.now(); let raf = 0;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (document.documentElement.classList.contains('lx-saver')) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    time.value += dt;
    const t = time.value;

    for (const { c, mesh, flat } of creatures) {
      steer(c, dt);
      place(mesh, c.i, c.pos, c.dir, c.size, flat ? -c.dir.y * 0.6 : 0);
    }
    for (const g of groups) {
      for (const sch of g.list) {
        steer(sch.leader, dt);
        const L = sch.leader;
        fx.copy(L.dir); fz.crossVectors(fx, up).normalize(); fy.crossVectors(fz, fx).normalize();
        for (const m of sch.members) {
          tmp.copy(L.pos)
            .addScaledVector(fx, m.off.x + Math.sin(t * 0.7 + m.ph) * 0.25)
            .addScaledVector(fy, m.off.y + Math.sin(t * 0.9 + m.ph * 2) * 0.15)
            .addScaledVector(fz, m.off.z + Math.cos(t * 0.6 + m.ph) * 0.25);
          desired.copy(L.dir).addScaledVector(fz, Math.sin(t * 1.3 + m.ph) * 0.12).normalize();
          place(g.mesh, m.i, tmp, desired, m.size);
        }
      }
      g.mesh.instanceMatrix.needsUpdate = true;
    }
    mantaMesh.instanceMatrix.needsUpdate = true;
    for (const j of jellies) {
      const u = j.userData;
      j.position.y += (u.drift * (0.6 + 0.4 * Math.sin(t * 1.8 + u.sway))) * dt * 0.6;
      j.position.x += Math.sin(t * 0.2 + u.sway) * dt * 0.15;
      j.rotation.z = u.tilt + Math.sin(t * 0.4 + u.sway) * 0.08;
      if (j.position.y > BOUNDS.yHi + 6) { j.position.y = BOUNDS.yLo - 6; j.position.x = (Math.random() - 0.5) * 50; j.position.z = -10 - Math.random() * 70; }
    }
    for (const sh of shafts) sh.rotation.z = sh.userData.base + Math.sin(t * 0.15 + sh.position.x) * 0.04;
    const sp = snowGeo.attributes.position.array;
    for (let i = 0; i < SNOW; i++) {
      sp[i * 3 + 1] -= dt * 0.12;
      sp[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.05;
      if (sp[i * 3 + 1] < BOUNDS.yLo) sp[i * 3 + 1] = BOUNDS.yHi + 4;
    }
    snowGeo.attributes.position.needsUpdate = true;
    camera.position.x = Math.sin(t * 0.05) * 2.2;
    camera.position.y = Math.sin(t * 0.07) * 0.8;
    camera.lookAt(0, -1.5, -30);
    renderer.render(scene, camera);
    if (broken) { cancelAnimationFrame(raf); renderer.domElement.remove(); }
  };
  raf = requestAnimationFrame(loop);

  const onResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
  window.addEventListener('resize', onResize);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    disposables.forEach((d) => d.dispose && d.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}

function spawn(THREE, sp, initial) {
  const far = sp.far;
  const c = {
    pos: new THREE.Vector3((Math.random() - 0.5) * 2 * BOUNDS.x, BOUNDS.yLo + 2 + Math.random() * (BOUNDS.yHi - BOUNDS.yLo - 3), far ? -40 - Math.random() * 80 : (initial ? 2 - Math.random() * 70 : BOUNDS.zFar)),
    dir: new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.2, Math.random() - 0.5).normalize(),
    target: new THREE.Vector3(),
    size: sp.len[0] + Math.random() * (sp.len[1] - sp.len[0]),
    cruise: sp.speed * (0.8 + Math.random() * 0.4), speed: sp.speed,
    turn: 0.6 + Math.random() * 0.5, seed: Math.random() * 10, far,
  };
  newTarget(THREE, c);
  return c;
}

// Somewhere new to swim: mostly within view, sometimes far off into the blue (where the water hides it).
function newTarget(THREE, c) {
  const away = Math.random() < 0.15;
  const zNear = c.far ? -35 : BOUNDS.zNear;
  c.target.set(
    (Math.random() - 0.5) * 2 * BOUNDS.x,
    BOUNDS.yLo + 2 + Math.random() * (BOUNDS.yHi - BOUNDS.yLo - 3),
    away ? BOUNDS.zFar - 40 : zNear - Math.random() * (zNear - (c.far ? -110 : -70)),
  );
}

// A fish, length 1 along +x (nose at +0.5): an ellipsoid shaped into a body, with tail, dorsal, anal and
// pectoral fins. aPart marks fins (1) so the shader colours them apart from the body.
function fishGeometry(THREE, sp) {
  const body = new THREE.SphereGeometry(1, 30, 18);
  body.rotateZ(-Math.PI / 2);
  const p = body.attributes.position;
  const prof = (x) => { const t = Math.min(1, Math.max(0, x + 0.5)); return Math.max(0.08, Math.pow(Math.sin(Math.PI * Math.pow(t, 1.4)), sp.blunt)); };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 0.5;
    const f = prof(x);
    p.setXYZ(i, x, p.getY(i) * f * sp.h * 0.5, p.getZ(i) * f * sp.w * 0.5);
  }
  body.computeVertexNormals();
  const parts = [[body, 0]];
  const shape = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); return new THREE.ShapeGeometry(s); };
  const [tl, th, fork] = sp.tail;
  const tail = sp.shark
    ? shape([[0.03, 0.01], [-tl * 0.9, th * 1.4], [-tl * 0.55, 0.0], [-tl * 0.45, -th * 0.7], [0.03, -0.01]])
    : shape([[0.04, 0.02], [-tl, th], [-tl * fork, 0], [-tl, -th], [0.04, -0.02]]);
  tail.translate(-0.47, 0, 0);
  parts.push([tail, 1]);
  const topAt = (x) => prof(x) * sp.h * 0.5 * 0.92;
  if (sp.dorsal) {
    const [x1, x2, dh] = sp.dorsal;
    const yb = topAt((x1 + x2) / 2);
    parts.push([shape([[x1, 0], [x1 - (x1 - x2) * (sp.shark ? 0.45 : 0.25), dh], [x2 - 0.04, dh * 0.35], [x2, 0]]).translate(0, yb - 0.01, 0), 1]);
  }
  if (sp.anal) {
    const [x1, x2, dh] = sp.anal;
    const yb = topAt((x1 + x2) / 2);
    parts.push([shape([[x1, 0], [x2, 0], [x2 - 0.04, -dh * 0.4], [x1 - (x1 - x2) * 0.3, -dh]]).translate(0, -yb + 0.01, 0), 1]);
  }
  for (const side of [1, -1]) {
    const len = sp.shark ? 0.16 : 0.1;
    const pec = shape([[0, 0], [-len, -len * 0.9], [-len * 0.6, -len * 0.2]]);
    pec.rotateX(side * 0.9);
    pec.translate(0.22, -sp.h * 0.12, side * sp.w * 0.42);
    parts.push([pec, 1]);
  }
  return merge(THREE, parts);
}

function merge(THREE, parts) {
  const pos = []; const nor = []; const part = [];
  for (const [g0, flag] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const a = g.attributes.position.array; const n = g.attributes.normal.array;
    for (let i = 0; i < a.length; i++) { pos.push(a[i]); nor.push(n[i]); }
    for (let i = 0; i < a.length / 3; i++) part.push(flag);
    g.dispose(); if (g !== g0) g0.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  return out;
}

// A manta ray, length 1 along +x, wingspan ±1 in z: swept-back wings, a raised body, flapping in the shader.
function mantaGeometry(THREE) {
  const g = new THREE.PlaneGeometry(2, 2, 34, 20);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i); const v = p.getZ(i);
    const span = u > 0 ? 1 - (1 - 0.16) * Math.pow(u, 1.3) : 1 - (1 - 0.05) * Math.pow(-u, 0.8);
    const z = v * span;
    const x = u * 0.42 - Math.pow(Math.abs(v), 2) * 0.22;
    const y = 0.07 * (1 - v * v) * (1 - u * u) * (1 - Math.abs(v));
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

// Jellyfish tentacles: thin trailing lines from the bell's rim plus a few frilly arms in the middle.
function tentacleGeometry(THREE) {
  const pos = []; const ks = [];
  const add = (x0, z0, len, segs, curl) => {
    for (let s = 0; s < segs; s++) {
      for (const k of [s / segs, (s + 1) / segs]) {
        pos.push(x0 * (1 - k * 0.3) + Math.sin(k * 9 + curl) * 0.06 * k, -k * len, z0 * (1 - k * 0.3) + Math.cos(k * 9 + curl) * 0.06 * k);
        ks.push(k);
      }
    }
  };
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; add(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 3 + Math.random() * 2.5, 24, a); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; for (let j = 0; j < 3; j++) add(Math.cos(a) * 0.2 + j * 0.03, Math.sin(a) * 0.2, 1.8, 18, a + j); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aK', new THREE.Float32BufferAttribute(ks, 1));
  return g;
}
