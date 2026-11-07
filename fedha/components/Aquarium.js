import { useEffect, useRef } from 'react';

// Sapphire's living background: a deep-water aquarium in real 3D (three.js, loaded only for this tier).
// Every creature is built in code, no downloads: blue tangs, clownfish, emperor angelfish, groupers, sardine and
// tuna schools, sharks, a dolphin pod, humpback whales, octopuses, squid, manta rays and glowing jellyfish.
// Each swims its own path through the water (tails and bodies bend, flukes beat, mantas flap, octopus and squid
// jet, jellies pulse); scales flash as fish turn. Some head off into the blue until the water swallows them,
// then come back from the distance, and the big animals start far off and swim in. Light shafts, caustics on the fish and the sand,
// swaying kelp and drifting marine snow. Pauses on low battery (html.lx-saver) and when the app is hidden.

const FISH_VERT = `
uniform float uTime; uniform float uAmp; uniform float uFreq; uniform float uVert;
attribute float aPart; attribute float aPhase; attribute float aSpeed;
varying vec3 vPos; varying vec3 vN; varying vec3 vView; varying vec3 vWorld; varying float vPart; varying vec3 vObjN;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float s = clamp((0.15 - p.x) / 0.65, 0.0, 1.0);
  float bend = sin(uTime * uFreq * aSpeed + aPhase - p.x * 5.0) * uAmp * s * s;
  if (uVert > 0.5) p.y += bend; else p.z += bend;   // whales and dolphins beat their flukes up and down
  vPos = position; vPart = aPart; vObjN = normal;
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
uniform int uPattern; uniform float uH; uniform float uEye; uniform float uShine; uniform float uGlint;
varying vec3 vPos; varying vec3 vN; varying vec3 vView; varying vec3 vWorld; varying float vPart; varying vec3 vObjN;
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
  } else if (uPattern == 7) {                               // dolphin: dark cape, grey flanks, pale belly
    col = mix(uBelly, uAccent, ss(0.3, 0.38, up));
    col = mix(col, uBack, ss(0.62, 0.68, up + 0.05 * sin(t * 8.0)));
  } else if (uPattern == 8) {                               // humpback: dark back, pale grooved throat, knobbly head
    col = mix(uBelly, uBack, ss(0.25, 0.42, up + 0.06 * sin(t * 5.0)));
    if (up < 0.42 && t > 0.6) col *= 0.8 + 0.2 * sin(vPos.z * 500.0);
    if (t > 0.84 && up > 0.6) col = mix(col, uAccent * 0.6, ss(0.72, 0.8, noise(vec2(t * 60.0, vPos.z * 200.0))));
  } else if (uPattern == 9) {                               // tuna: navy back, silver flanks, gold stripe
    col = mix(col, uAccent * 0.85, 0.45 * band(up, 0.56, 0.025) * ss(0.2, 0.4, t) * ss(0.9, 0.75, t));
    col += 0.07 * step(0.5, fract(t * 18.0)) * (1.0 - up);
  }
  col *= 0.9 + 0.12 * scales;
  if (vPart > 1.5) col = uAccent;
  else if (vPart > 0.5) col = mix(uFin, uFin * 0.7, 0.5 + 0.5 * sin(vPos.y * 60.0 + vPos.x * 20.0));
  float shine = uShine;
  vec2 e = vec2(vPos.x - 0.36, vPos.y - uH * 0.12);
  float d = length(e);
  bool eye = vPart < 0.5 && d < uEye && abs(vObjN.z) > 0.55;  // only on the sides of the head
  if (eye) {                                                // a dark, glossy eye with a thin iris ring
    float r = d / uEye;
    vec3 iris = mix(col * 0.55, vec3(0.55, 0.5, 0.36), 0.45);
    vec3 eyeCol = mix(iris, vec3(0.012, 0.016, 0.024), ss(0.7, 0.58, r));
    col = mix(eyeCol, col * 0.75, ss(0.86, 1.0, r));
    shine = 1.6;
  }
  // Scales: each one tilted a little differently, so they flash one by one as the fish turns, with a rainbow
  // sheen at glancing angles.
  float glint = 0.0;
  if (!eye && vPart < 0.5 && uGlint > 0.0) {
    vec2 sc = vec2(t * 46.0, up * 18.0);
    sc.y += floor(sc.x) * 0.5;
    vec2 cid = floor(sc); vec2 cf = fract(sc) - 0.5;
    col *= 1.0 - 0.22 * uGlint * ss(0.28, 0.5, length(cf));
    vec3 Nn = normalize(vN);
    vec3 jit = vec3(hash(cid), hash(cid + 7.1), hash(cid + 3.7)) - 0.5;
    vec3 Ng = normalize(Nn + jit * 0.8);
    vec3 Lv = normalize((viewMatrix * vec4(uLight, 0.0)).xyz);
    glint = pow(max(dot(reflect(-Lv, Ng), normalize(vView)), 0.0), 60.0) * uGlint * 3.0;
    float fr = 1.0 - abs(dot(Nn, normalize(vView)));
    col += uGlint * 0.22 * fr * (0.5 + 0.5 * sin(fr * 9.0 + vec3(0.0, 2.1, 4.2)));
  }
  gl_FragColor = vec4(shade(col, vN, vView, vWorld, shine) + glint * vec3(1.0, 0.97, 0.88), 1.0);
  #include <fog_fragment>
}`;

// Octopus and squid: body plus arms; aK runs 0 at an arm's base to 1 at its tip, aArm is its angle around the
// body. Arms open, then snap shut (the jet that pushes the animal along), and curl at the tips.
const CEPH_VERT = `
uniform float uTime; uniform float uPulse;
attribute float aK; attribute float aArm; attribute float aPhase; attribute float aSpeed;
varying vec3 vPos; varying vec3 vN; varying vec3 vView; varying vec3 vWorld; varying float vK; varying vec3 vObjN;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float pulse = sin(uTime * uPulse * aSpeed + aPhase);
  float open = pulse * 0.5 + 0.5;
  if (aK > 0.0) {
    vec2 r = vec2(cos(aArm), sin(aArm));
    float spread = (0.08 + 0.4 * open) * aK;
    p.y += r.x * spread; p.z += r.y * spread;
    float w = sin(uTime * 2.2 + aArm * 3.0 - aK * 7.0 + aPhase) * 0.12 * aK * aK;
    p.y -= r.y * w; p.z += r.x * w;
    p.x += (1.0 - open) * 0.08 * aK;
  } else if (p.x > -0.1) {
    p.yz *= 1.0 + 0.07 * pulse;
  }
  vPos = position; vK = aK; vObjN = normal;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  vN = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vView = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const CEPH_FRAG = `
uniform vec3 uBody; uniform vec3 uBelly; uniform float uEyeX; uniform float uEye; uniform float uShine;
varying vec3 vPos; varying vec3 vN; varying vec3 vView; varying vec3 vWorld; varying float vK; varying vec3 vObjN;
${COMMON_FRAG}
#include <fog_pars_fragment>
void main() {
  vec3 col = uBody * (0.7 + 0.45 * noise(vPos.xy * 28.0 + vPos.z * 13.0));
  col = mix(col, uBelly, 0.35 * ss(0.0, -0.1, vPos.y));
  if (vK > 0.02) {
    float s = ss(0.3, 0.12, abs(fract(vK * 26.0) - 0.5));   // rows of suckers
    col = mix(col, uBelly, s * 0.45);
    col *= 1.0 - 0.25 * vK;
  }
  vec2 e = vec2(vPos.x - uEyeX, vPos.y);
  float shine = uShine;
  if (vK < 0.01 && length(e) < uEye && abs(vObjN.z) > 0.5) { // golden eye with a dark slit pupil
    float r = length(e) / uEye;
    vec3 eyeCol = mix(vec3(0.62, 0.5, 0.26), vec3(0.015), ss(0.5, 0.36, length(vec2(e.x, e.y * 2.6)) / uEye));
    col = mix(eyeCol, col * 0.8, ss(0.85, 1.0, r));
    shine = 1.6;
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

// Air bubbles: see-through with a bright rim and a sharp highlight from above. Small ones stay round; bigger ones
// flatten into wobbling caps with a flatter bottom, like real bubbles rising through water.
const BUBBLE_VERT = `
uniform float uTime;
attribute float aFlat; attribute float aPhase;
varying vec3 vN; varying vec3 vView; varying float vFog;
void main() {
  vec3 p = position;
  float w = sin(uTime * (7.0 + 5.0 * aFlat) + aPhase);
  p.y *= 1.0 - aFlat * (0.32 + 0.1 * w);
  if (p.y < 0.0) p.y *= 1.0 - aFlat * 0.55;
  p.x *= 1.0 + aFlat * 0.14 * w;
  p.z *= 1.0 - aFlat * 0.14 * w;
  vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
  vN = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vView = -mvPosition.xyz; vFog = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}`;

const BUBBLE_FRAG = `
uniform vec3 uLight; uniform float uDensity; uniform vec3 uFogColor;
varying vec3 vN; varying vec3 vView; varying float vFog;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(vView);
  float f = pow(1.0 - abs(dot(N, V)), 2.2);
  vec3 L = normalize((viewMatrix * vec4(uLight, 0.0)).xyz);
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 90.0);
  float edge = smoothstep(0.55, 0.8, f) * (1.0 - smoothstep(0.9, 1.0, f));  // the darker refraction ring
  vec3 col = mix(vec3(0.7, 0.88, 1.0) * (0.1 + 0.95 * f), vec3(0.05, 0.15, 0.22), edge * 0.35) + spec * 1.3;
  float fog = exp(-uDensity * uDensity * vFog * vFog);
  gl_FragColor = vec4(mix(uFogColor, col, fog), clamp((0.04 + 0.8 * f + spec) * fog, 0.0, 1.0));
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
// Fish: body proportions (length 1), fins, colours, how they swim and how much their scales flash (glint).
// resident: always about (a few reef fish, one sardine school). visit: arrives now and then from the distance,
// stays a while, then swims off: gap = seconds between visits, stay = seconds it stays, w = how often it's picked.
// big animals come one at a time; predators sometimes hunt the sardines; prey flee from them.
// yaw = how fast it can turn (radians a second): whales swing round over half a minute, reef fish in a few seconds.
const SPECIES = [
  { key: 'tang', yaw: 1.0, n: 3, resident: 3, prey: true, pauses: true, wander: 0.9, len: [1.1, 1.5], h: 0.62, w: 0.15, blunt: 0.55, tail: [0.2, 0.2, 0.55], dorsal: [0.32, -0.38, 0.12], anal: [0.1, -0.36, 0.1], pattern: 2, back: '#1d4ed8', belly: '#3b82f6', fin: '#1e3a8a', accent: '#facc15', speed: 1.5, amp: 0.07, freq: 7, eye: 0.04, shine: 0.6, glint: 0.45 },
  { key: 'clown', yaw: 1.2, n: 2, resident: 2, prey: true, pauses: true, wander: 1.0, len: [0.7, 0.95], h: 0.44, w: 0.2, blunt: 0.5, tail: [0.18, 0.15, 0.85], dorsal: [0.3, -0.35, 0.1], anal: [0.0, -0.3, 0.07], pattern: 1, back: '#f97316', belly: '#fb923c', fin: '#ea580c', speed: 1.0, amp: 0.09, freq: 9, eye: 0.045, shine: 0.7, glint: 0.35, zNear: 0, zIn: -40 },
  { key: 'angel', yaw: 0.9, n: 2, resident: 2, prey: true, pauses: true, wander: 0.8, len: [1.3, 1.7], h: 0.72, w: 0.13, blunt: 0.5, tail: [0.16, 0.18, 0.95], dorsal: [0.25, -0.42, 0.1], anal: [0.15, -0.4, 0.09], pattern: 3, back: '#1e3a8a', belly: '#1e40af', fin: '#1e3a8a', accent: '#fde047', speed: 1.0, amp: 0.06, freq: 6, eye: 0.035, shine: 0.6, glint: 0.45 },
  { key: 'grouper', yaw: 0.5, n: 1, resident: 1, pauses: true, wander: 0.6, len: [2.6, 3.4], h: 0.36, w: 0.27, blunt: 0.65, tail: [0.18, 0.16, 0.9], dorsal: [0.3, -0.35, 0.07], anal: [0.0, -0.3, 0.05], pattern: 5, back: '#5b4636', belly: '#9a8268', fin: '#4a3a2c', speed: 0.8, amp: 0.05, freq: 4, eye: 0.028, shine: 0.3, glint: 0.12, y: [-12, -2] },
  { key: 'sardine', yaw: 1.2, n: 24, school: 1, resident: 1, prey: true, wander: 0.7, seg: [16, 10], len: [0.42, 0.55], h: 0.2, w: 0.1, blunt: 0.8, tail: [0.16, 0.13, 0.5], dorsal: [0.12, -0.06, 0.05], anal: null, pattern: 4, back: '#1e3a5f', belly: '#d1d5db', fin: '#94a3b8', speed: 2.6, amp: 0.08, freq: 14, eye: 0.04, shine: 1.0, glint: 1.0 },
  { key: 'tuna', yaw: 0.7, n: 8, school: 1, spread: 2.5, predator: true, wander: 0.5, visit: { gap: [70, 150], stay: [25, 45], w: 1 }, len: [1.8, 2.4], h: 0.28, w: 0.2, blunt: 0.72, tail: [0.2, 0.32, 0.35], dorsal: [0.12, -0.02, 0.1], anal: [0.0, -0.08, 0.07], finlets: true, pec: 0.13, pattern: 9, back: '#0b1f4a', belly: '#d6dde6', fin: '#1e3a5f', accent: '#facc15', speed: 4.2, amp: 0.05, freq: 9, eye: 0.028, shine: 0.9, glint: 0.9, far: true, zNear: -5, zIn: -85 },
  { key: 'shark', yaw: 0.35, n: 2, big: true, predator: true, wander: 0.45, visit: { gap: [60, 150], stay: [40, 70], w: 1 }, close: 0.3, len: [6, 8], h: 0.19, w: 0.17, blunt: 0.9, tail: [0.24, 0.22, 0.45], shark: true, dorsal: [0.12, -0.08, 0.17], anal: null, pec: 0.16, pattern: 6, back: '#4b5563', belly: '#e5e7eb', fin: '#4b5563', speed: 2.3, amp: 0.05, freq: 2.2, eye: 0.012, shine: 0.25, glint: 0.04, far: true, zNear: -12, zIn: -90 },
  { key: 'dolphin', yaw: 0.6, n: 4, school: 1, spread: 2.2, big: true, predator: true, wander: 0.6, visit: { gap: [120, 240], stay: [30, 50], w: 1.6 }, close: 0.3, len: [2.4, 3.0], h: 0.22, w: 0.2, blunt: 0.75, beak: true, flukes: true, tail: [0.16, 0.2, 0.6], dorsal: [0.08, -0.12, 0.13], curvedDorsal: true, anal: null, pec: 0.12, pattern: 7, back: '#374151', belly: '#e5e7eb', fin: '#374151', accent: '#9ca3af', speed: 4.0, amp: 0.06, freq: 3.5, eye: 0.012, shine: 0.55, glint: 0, far: true, zNear: -8, zIn: -80, y: [-6, 8] },
  { key: 'whale', yaw: 0.12, n: 1, big: true, wander: 0.25, visit: { gap: [180, 420], stay: [60, 90], w: 4, first: true }, close: 0.25, seg: [40, 24], len: [13, 17], h: 0.24, w: 0.23, blunt: 0.7, flukes: true, tail: [0.13, 0.24, 0.55], dorsal: [-0.05, -0.12, 0.03], curvedDorsal: true, anal: null, pec: 0.32, pecAccent: true, pattern: 8, back: '#1f2937', belly: '#e5e7eb', fin: '#1f2937', accent: '#d1d5db', speed: 1.7, amp: 0.04, freq: 1.2, eye: 0.008, shine: 0.3, glint: 0, far: true, zNear: -30, zIn: -95, y: [-7, 6] },
  { key: 'manta', yaw: 0.3, manta: true, n: 2, big: true, wander: 0.4, visit: { gap: [100, 200], stay: [40, 70], w: 0.8 }, close: 0.3, len: [5, 7], speed: 1.6, far: true, y: [-8, 6] },
  { key: 'octopus', yaw: 0.8, ceph: 'octopus', n: 2, prey: true, pauses: true, wander: 0.8, visit: { gap: [60, 130], stay: [50, 90], w: 1 }, len: [1.3, 2.0], body: '#b5472d', belly: '#f1c3a6', eyeX: -0.03, eye: 0.05, shine: 0.7, speed: 0.9, jet: 1.1, y: [-15, -9], zNear: 0, zIn: -50 },
  { key: 'squid', yaw: 0.9, ceph: 'squid', n: 4, school: 1, spread: 1.6, prey: true, wander: 0.8, visit: { gap: [80, 160], stay: [30, 50], w: 1 }, len: [1.1, 1.6], body: '#e9b8b0', belly: '#fbe7e2', eyeX: -0.27, eye: 0.045, shine: 0.9, speed: 2.0, jet: 2.0, y: [-9, 5], zNear: 2, zIn: -60 },
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

  // ── Bubbles ──
  // Streams rise in bursts from vents in the sand, and loose bubbles drift up close past the screen. Small ones
  // rise slowly and straight, medium ones zig-zag and spiral, big ones rise fastest and wobble; all grow a
  // little as they near the surface.
  const BUB = 150;
  const bubGeo = keep(new THREE.SphereGeometry(1, 14, 10));
  const flats = new Float32Array(BUB); const bphase = new Float32Array(BUB).map(() => Math.random() * 6.3);
  bubGeo.setAttribute('aFlat', new THREE.InstancedBufferAttribute(flats, 1));
  bubGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(bphase, 1));
  const bubMesh = new THREE.InstancedMesh(bubGeo, keep(new THREE.ShaderMaterial({
    vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG, transparent: true, depthWrite: false,
    uniforms: { uTime: time, uLight: light, uDensity: { value: density }, uFogColor: { value: FOG.clone() } },
  })), BUB);
  bubMesh.frustumCulled = false;
  scene.add(bubMesh);
  const vents = Array.from({ length: 4 }, () => ({ x: (Math.random() - 0.5) * 44, z: -15 - Math.random() * 55, next: Math.random() * 3 }));
  const bubbles = Array.from({ length: BUB }, () => ({ on: false, pos: new THREE.Vector3(), r: 0, rise: 0, amp: 0, f: 0, ph: 0, x0: 0, z0: 0 }));
  const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < BUB; i++) bubMesh.setMatrixAt(i, zeroM);
  function blow(x, y, z, near) {
    const b = bubbles.find((q) => !q.on);
    if (!b) return;
    const i = bubbles.indexOf(b);
    const big = Math.random();
    b.r = near ? 0.03 + big * big * 0.12 : 0.04 + big * big * big * 0.22;
    b.rise = 0.7 + b.r * 9 + Math.random() * 0.3;
    b.amp = b.r > 0.06 ? b.r * (1.5 + Math.random() * 2.5) : b.r * 0.4; // medium and big ones zig-zag
    b.f = 2 + Math.random() * 3; b.ph = Math.random() * 6.3;
    b.x0 = x; b.z0 = z; b.pos.set(x, y, z); b.on = true;
    flats[i] = Math.min(1, Math.max(0, (b.r - 0.06) / 0.14));
  }
  function bubbleStep(dt, t) {
    for (const v of vents) if (t > v.next) { // a burst from this vent
      const n = 2 + Math.floor(Math.random() * 5);
      for (let k = 0; k < n; k++) blow(v.x + (Math.random() - 0.5) * 0.4, -18 - k * 0.35, v.z + (Math.random() - 0.5) * 0.4, false);
      v.next = t + 1.5 + Math.random() * 4.5;
    }
    if (Math.random() < dt * 0.6) blow((Math.random() - 0.5) * 16, -14, 2 - Math.random() * 12, true); // close to the screen
    for (let i = 0; i < BUB; i++) {
      const b = bubbles[i];
      if (!b.on) continue;
      b.pos.y += b.rise * dt;
      const grow = 1 + Math.max(0, b.pos.y + 18) * 0.012;
      const x = b.x0 + Math.sin(t * b.f + b.ph) * b.amp; const z = b.z0 + Math.cos(t * b.f * 0.9 + b.ph) * b.amp * 0.8;
      b.x0 += Math.sin(t * 0.3 + i) * dt * 0.08; // the current nudges the stream
      if (b.pos.y > BOUNDS.yHi + 10) { b.on = false; bubMesh.setMatrixAt(i, zeroM); continue; }
      const rr = b.r * grow;
      m4.makeScale(rr, rr, rr).setPosition(x, b.pos.y, z);
      bubMesh.setMatrixAt(i, m4);
    }
    bubMesh.instanceMatrix.needsUpdate = true;
    bubGeo.attributes.aFlat.needsUpdate = true;
  }

  // ── Sea life ──
  // Residents are always about; visitors arrive now and then from the distance, stay a while and swim off into
  // the blue. Never more than two visitors at once, one big animal at a time. Sometimes a predator hunts the
  // sardines, which see it coming, bunch into a swirling ball and flee.
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
  const material = (sp) => (sp.ceph ? new THREE.ShaderMaterial({
    vertexShader: CEPH_VERT, fragmentShader: CEPH_FRAG, fog: true, side: THREE.DoubleSide,
    uniforms: { ...fogU(), uTime: time, uLight: light, uPulse: { value: sp.jet }, uBody: { value: new THREE.Color(sp.body) }, uBelly: { value: new THREE.Color(sp.belly) }, uEyeX: { value: sp.eyeX }, uEye: { value: sp.eye }, uShine: { value: sp.shine } },
  }) : sp.manta ? new THREE.ShaderMaterial({
    vertexShader: MANTA_VERT, fragmentShader: MANTA_FRAG, fog: true, side: THREE.DoubleSide, uniforms: { ...fogU(), uTime: time, uLight: light, uSpan: { value: 1 } },
  }) : new THREE.ShaderMaterial({
    vertexShader: FISH_VERT, fragmentShader: FISH_FRAG, fog: true, side: THREE.DoubleSide,
    uniforms: {
      ...fogU(), uTime: time, uLight: light, uAmp: { value: sp.amp }, uFreq: { value: sp.freq }, uVert: { value: sp.flukes ? 1 : 0 },
      uBack: { value: new THREE.Color(sp.back) }, uBelly: { value: new THREE.Color(sp.belly) }, uFin: { value: new THREE.Color(sp.fin) },
      uAccent: { value: new THREE.Color(sp.accent || sp.fin) }, uPattern: { value: sp.pattern }, uH: { value: sp.h }, uEye: { value: sp.eye }, uShine: { value: sp.shine }, uGlint: { value: sp.glint || 0 },
    },
  }));
  const meshes = [];
  const units = [];
  for (const sp of SPECIES) {
    const geo = keep(sp.ceph ? cephGeometry(THREE, sp) : sp.manta ? mantaGeometry(THREE) : fishGeometry(THREE, sp));
    const phases = new Float32Array(sp.n).map(() => Math.random() * 6.3);
    const speeds = new Float32Array(sp.n).map(() => 0.85 + Math.random() * 0.3);
    const mesh = new THREE.InstancedMesh(geo, keep(material(sp)), sp.n);
    mesh.frustumCulled = false;
    scene.add(mesh); meshes.push(mesh);
    const per = sp.school ? Math.ceil(sp.n / sp.school) : 1;
    for (let s = 0; s * per < sp.n; s++) {
      const c = spawn(THREE, sp);
      c.phase = phases[s * per]; c.ps = speeds[s * per];
      const members = [];
      const k = sp.spread || 1;
      for (let i = s * per; i < Math.min(sp.n, (s + 1) * per); i++) {
        if (sp.school) { phases[i] = c.phase + (Math.random() - 0.5) * 0.3; speeds[i] = c.ps; } // a school moves together
        members.push({ i, off: new THREE.Vector3((Math.random() - 0.5) * 3 * k, (Math.random() - 0.5) * 1.6 * k, (Math.random() - 0.5) * 3 * k), size: sp.len[0] + Math.random() * (sp.len[1] - sp.len[0]), ph: Math.random() * 6.3 });
        mesh.setMatrixAt(i, HIDDEN);
      }
      units.push({ sp, mesh, c, members, active: false, resident: s < (sp.resident || 0), fear: 0, flee: new THREE.Vector3(), until: 0, huntUntil: 0 });
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1));
  }

  // When each visitor may next come by. The whale's first visit is a few minutes in.
  const visits = new Map(SPECIES.filter((sp) => sp.visit).map((sp) => {
    const gap = sp.visit.gap[0] + Math.random() * (sp.visit.gap[1] - sp.visit.gap[0]);
    return [sp.key, { at: sp.visit.first ? gap : Math.random() * sp.visit.gap[0] * 0.6 }];
  }));

  const rand = (r) => r[0] + Math.random() * (r[1] - r[0]);
  function activate(u, initial) {
    const c = u.c;
    c.pos.set((Math.random() - 0.5) * 2 * BOUNDS.x, c.yLo + Math.random() * (c.yHi - c.yLo), initial ? c.zNear - Math.random() * (c.zNear - c.zIn) : BOUNDS.zFar - 10 - Math.random() * 15);
    newTarget(THREE, c, true);
    c.dir.subVectors(c.target, c.pos).normalize();
    c.speed = c.cruise; c.leaving = false; c.hunt = null; c.retarget = time.value + 10; c.rate = 0;
    for (const m of u.members) m.pos = null;
    u.active = true; u.fear = 0;
    u.until = u.resident ? Infinity : time.value + rand(u.sp.visit.stay);
  }
  function deactivate(u) {
    u.active = false; u.c.hunt = null;
    for (const m of u.members) { u.mesh.setMatrixAt(m.i, HIDDEN); m.pos = null; }
    for (const o of units) if (o.c.hunt === u.c) { o.c.hunt = null; o.c.leaving = true; o.c.target.set((Math.random() - 0.5) * 2 * BOUNDS.x, o.c.pos.y, BOUNDS.zFar - 40); }
  }
  for (const u of units) if (u.resident) activate(u, true);

  let nextVisit = 15 + Math.random() * 20;
  function director(t) {
    if (t < nextVisit) return;
    nextVisit = t + 10 + Math.random() * 25;
    const out = units.filter((u) => u.active && !u.resident);
    if (out.length >= 2) return;
    const bigOut = out.some((u) => u.sp.big);
    const pool = units.filter((u) => !u.active && !u.resident && u.sp.visit && t >= visits.get(u.sp.key).at && !(bigOut && u.sp.big) && !out.some((o) => o.sp === u.sp));
    if (!pool.length) return;
    let r = Math.random() * pool.reduce((sum, u) => sum + u.sp.visit.w, 0);
    const u = pool.find((x) => (r -= x.sp.visit.w) <= 0) || pool[0];
    activate(u, false);
    visits.get(u.sp.key).at = t + rand(u.sp.visit.gap);
    // A hunt: the predator comes in from the distance after the sardines.
    const prey = units.find((x) => x.active && x.sp.key === 'sardine');
    if (u.sp.predator && prey && Math.random() < 0.55) {
      u.c.hunt = prey.c; u.huntUntil = t + 25 + Math.random() * 20;
      u.c.pos.set(prey.c.pos.x + (Math.random() - 0.5) * 20, prey.c.pos.y, Math.min(prey.c.pos.z - 70, BOUNDS.zFar + 10));
    }
  }

  // ── Jellyfish ──
  const jellies = [];
  const bellGeo = keep(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55));
  const tentGeo = keep(tentacleGeometry(THREE));
  const JCOL = ['#f0abfc', '#93c5fd', '#a5f3fc'];
  for (let i = 0; i < 3; i++) {
    const color = new THREE.Color(JCOL[i % JCOL.length]);
    const uni = { uTime: time, uPhase: { value: Math.random() * 6.3 }, uColor: { value: color }, uDensity: { value: density } };
    const bell = new THREE.Mesh(bellGeo, keep(new THREE.ShaderMaterial({ vertexShader: JELLY_VERT, fragmentShader: JELLY_FRAG, uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
    const tent = new THREE.LineSegments(tentGeo, keep(new THREE.ShaderMaterial({ vertexShader: TENT_VERT, fragmentShader: TENT_FRAG, uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    const g = new THREE.Group();
    g.add(bell); g.add(tent);
    const s = 0.5 + Math.random() * 0.8;
    g.scale.set(s, s, s);
    g.position.set((Math.random() - 0.5) * 50, BOUNDS.yLo + Math.random() * 20, -15 - Math.random() * 70);
    g.userData = { drift: 0.25 + Math.random() * 0.3, sway: Math.random() * 6.3, tilt: (Math.random() - 0.5) * 0.4 };
    jellies.push(g); scene.add(g);
  }

  // ── Motion ──
  const up = new THREE.Vector3(0, 1, 0);
  const fx = new THREE.Vector3(); const fy = new THREE.Vector3(); const fz = new THREE.Vector3();
  const desired = new THREE.Vector3(); const wv = new THREE.Vector3(); const tmp = new THREE.Vector3();
  const axis = new THREE.Vector3(); const prev = new THREE.Vector3(); const vel = new THREE.Vector3();
  function steer(u, dt, t) {
    const c = u.c;
    if (c.hunt) c.target.copy(c.hunt.pos);
    desired.subVectors(c.target, c.pos);
    if (!c.hunt && !c.leaving && (desired.length() < 2.5 || t > c.retarget)) { newTarget(THREE, c); c.retarget = t + 8 + Math.random() * 16; }
    desired.normalize();
    // Wander: a slow, smooth, never-repeating drift on top of where it's heading.
    wv.set(Math.sin(t * c.f1 + c.p1) + 0.5 * Math.sin(t * c.f2 + c.p2), 0.35 * Math.sin(t * c.f3 + c.p3), Math.cos(t * c.f1 * 0.8 + c.p2) + 0.5 * Math.sin(t * c.f3 * 1.3 + c.p1));
    desired.addScaledVector(wv, c.hunt ? 0.15 : c.wander);
    if (u.fear > 0.01) desired.addScaledVector(u.flee, 3 * u.fear);
    desired.normalize();
    desired.y = Math.max(-0.35, Math.min(0.35, desired.y));
    desired.normalize();
    // Turn like a real animal: never faster than its own turn speed, easing into and out of each turn, so a
    // change of mind becomes a wide curve, not a flip. A goal straight behind means swinging round one way.
    const ang = Math.acos(Math.max(-1, Math.min(1, c.dir.dot(desired))));
    axis.crossVectors(c.dir, desired);
    if (axis.lengthSq() < 1e-6) axis.set(0, c.side, 0);
    axis.normalize();
    const want = Math.min(ang * 1.2, c.yaw * (1 + 0.6 * u.fear));
    c.rate += (want - c.rate) * Math.min(1, dt * 1.5);
    c.dir.applyAxisAngle(axis, Math.min(ang, c.rate * dt)).normalize();
    c.yawRate = c.rate * axis.y;
    // Speed ebbs and flows; reef fish hang still now and then; bursts when fleeing or hunting.
    let cruise = c.cruise * (0.7 + 0.3 * Math.sin(t * c.f2 * 0.7 + c.seed));
    if (c.pauses && Math.sin(t * c.f4 + c.p4) > 0.8) cruise *= 0.12;
    // Octopus and squid shoot forward as their arms snap shut, then glide (in step with the shader's pulse).
    if (c.jet) cruise *= 0.3 + 1.3 * Math.max(0, -Math.sin(t * c.jet * c.ps + c.phase));
    cruise *= 1 + 1.8 * u.fear + (c.hunt ? 0.45 : 0);
    c.speed += (cruise - c.speed) * Math.min(1, dt * (c.jet ? 4 : 1.5));
    c.pos.addScaledVector(c.dir, c.speed * dt);
    // Stay in this animal's depth band (fast swimmers overshoot while turning, and the sand is below).
    if ((c.pos.y < c.yLo - 1 && c.dir.y < 0) || (c.pos.y > c.yHi + 1 && c.dir.y > 0)) { c.dir.y *= 0.9; c.dir.normalize(); }
    c.pos.y = Math.max(c.yLo - 2, Math.min(c.yHi + 2, c.pos.y));
    // Gone into the blue: residents come back from the distance, visitors are done.
    if (c.pos.z < BOUNDS.zFar - 25 || Math.abs(c.pos.x) > BOUNDS.x + 30) {
      if (!u.resident) { deactivate(u); return; }
      c.pos.set((Math.random() - 0.5) * 2 * BOUNDS.x, c.yLo + Math.random() * (c.yHi - c.yLo), BOUNDS.zFar - 15);
      newTarget(THREE, c, true);
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

  let last = performance.now(); let raf = 0;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (document.documentElement.classList.contains('lx-saver')) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    time.value += dt;
    const t = time.value;
    director(t);
    bubbleStep(dt, t);

    // Prey keep an eye out: a hunter within 30 m and they bolt the other way (and stay jumpy a while).
    for (const u of units) if (u.active) u.fear = Math.max(0, u.fear - dt * 0.25);
    for (const p of units) {
      if (!p.active || !p.sp.predator) continue;
      for (const u of units) {
        if (!u.active || !u.sp.prey) continue;
        const d = u.c.pos.distanceTo(p.c.pos);
        if (d < 30) {
          const f = Math.min(1, (30 - d) / 18);
          if (f > u.fear) u.fear = f;
          u.flee.subVectors(u.c.pos, p.c.pos).normalize();
          u.flee.x -= (u.c.pos.x / BOUNDS.x) * 0.6; // don't flee off the edge of the world
          u.flee.normalize();
        }
      }
    }
    for (const u of units) {
      if (!u.active) continue;
      const c = u.c;
      if (c.hunt && t > u.huntUntil) { c.hunt = null; c.leaving = true; c.target.set((Math.random() - 0.5) * 2 * BOUNDS.x, c.pos.y, BOUNDS.zFar - 40); }
      if (!u.resident && !c.leaving && !c.hunt && t > u.until) { c.leaving = true; c.target.set((Math.random() - 0.5) * 2 * BOUNDS.x, c.yLo + Math.random() * (c.yHi - c.yLo), BOUNDS.zFar - 40); }
      steer(u, dt, t);
      if (!u.active) continue;
      const bank = Math.max(-0.45, Math.min(0.45, -c.yawRate * 0.6)); // lean into the turn
      if (!u.sp.school) { place(u.mesh, u.members[0].i, c.pos, c.dir, u.members[0].size, bank + (u.sp.manta ? -c.dir.y * 0.6 : 0)); continue; }
      // A school: frightened, it packs tight and swirls into a bait ball.
      fx.copy(c.dir); fz.crossVectors(fx, up).normalize(); fy.crossVectors(fz, fx).normalize();
      const k = 1 - 0.55 * u.fear; const a = u.fear * t * 1.6;
      const ca = Math.cos(a); const sa = Math.sin(a);
      for (const m of u.members) {
        const oy = m.off.y * ca - m.off.z * sa; const oz = m.off.y * sa + m.off.z * ca;
        tmp.copy(c.pos)
          .addScaledVector(fx, k * m.off.x + Math.sin(t * 0.7 + m.ph) * 0.25)
          .addScaledVector(fy, k * oy + Math.sin(t * 0.9 + m.ph * 2) * 0.15)
          .addScaledVector(fz, k * oz + Math.cos(t * 0.6 + m.ph) * 0.25);
        // Each fish follows its spot in the school with a little lag, heading the way it's actually moving.
        if (!m.pos) { m.pos = tmp.clone(); m.dir = c.dir.clone(); }
        prev.copy(m.pos);
        m.pos.lerp(tmp, Math.min(1, dt * (1.6 + 2 * u.fear)));
        // Its heading: mostly the school's, nudged by how it's drifting, and turned no faster than the leader can.
        vel.subVectors(m.pos, prev);
        const drift = vel.length() / Math.max(dt, 1e-3);
        desired.copy(c.dir);
        if (drift > 0.05) desired.addScaledVector(vel.normalize(), Math.min(0.5, drift / (c.cruise * 4)));
        desired.normalize();
        const ma = Math.acos(Math.max(-1, Math.min(1, m.dir.dot(desired))));
        if (ma > 1e-4) { axis.crossVectors(m.dir, desired); if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0); m.dir.applyAxisAngle(axis.normalize(), Math.min(ma, c.yaw * 1.3 * dt)).normalize(); }
        desired.copy(m.dir).addScaledVector(fz, Math.sin(t * 1.3 + m.ph) * (0.08 + 0.2 * u.fear)).normalize();
        place(u.mesh, m.i, m.pos, desired, m.size, bank * 0.6);
      }
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    for (const j of jellies) {
      const u = j.userData;
      j.position.y += (u.drift * (0.6 + 0.4 * Math.sin(t * 1.8 + u.sway))) * dt * 0.6;
      j.position.x += Math.sin(t * 0.2 + u.sway) * dt * 0.15;
      j.rotation.z = u.tilt + Math.sin(t * 0.4 + u.sway) * 0.08;
      if (j.position.y > BOUNDS.yHi + 6) { j.position.y = BOUNDS.yLo - 6; j.position.x = (Math.random() - 0.5) * 50; j.position.z = -15 - Math.random() * 70; }
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

function spawn(THREE, sp) {
  const far = sp.far;
  const yLo = sp.y ? sp.y[0] : BOUNDS.yLo + 2; const yHi = sp.y ? sp.y[1] : BOUNDS.yHi - 1;
  const r = (lo, hi) => lo + Math.random() * (hi - lo);
  const c = {
    pos: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), target: new THREE.Vector3(),
    cruise: sp.speed * r(0.8, 1.2), speed: sp.speed,
    seed: Math.random() * 10, far,
    yLo, yHi, zNear: sp.zNear ?? (far ? -35 : BOUNDS.zNear), zIn: sp.zIn ?? (far ? -110 : -70), close: sp.close || 0,
    jet: sp.jet || 0, phase: 0, ps: 1, pauses: !!sp.pauses, wander: sp.wander ?? 0.6,
    // Each animal's own wander rhythm (slow, overlapping waves, so its path never repeats).
    f1: r(0.05, 0.15), f2: r(0.1, 0.25), f3: r(0.07, 0.2), f4: r(0.04, 0.1),
    p1: r(0, 6.3), p2: r(0, 6.3), p3: r(0, 6.3), p4: r(0, 6.3),
    leaving: false, hunt: null, retarget: 0,
    yaw: (sp.yaw || 0.6) * r(0.8, 1.2), rate: 0, yawRate: 0, side: Math.random() < 0.5 ? 1 : -1,
  };
  return c;
}

// Somewhere new to swim: mostly within view, sometimes far off into the blue (where the water hides it), and
// now and then a big animal passes close to the screen.
function newTarget(THREE, c, stayIn = false) {
  const away = !stayIn && Math.random() < 0.12;
  const close = !away && c.close && Math.random() < c.close;
  c.target.set(
    (Math.random() - 0.5) * 2 * BOUNDS.x,
    c.yLo + Math.random() * (c.yHi - c.yLo),
    away ? BOUNDS.zFar - 40 : close ? -6 - Math.random() * 8 : c.zNear - Math.random() * (c.zNear - c.zIn),
  );
}

// A fish, length 1 along +x (nose at +0.5): an ellipsoid shaped into a body, with tail, dorsal, anal and
// pectoral fins. aPart marks fins (1) so the shader colours them apart from the body.
function fishGeometry(THREE, sp) {
  const body = new THREE.SphereGeometry(1, sp.seg ? sp.seg[0] : 30, sp.seg ? sp.seg[1] : 18);
  body.rotateZ(-Math.PI / 2);
  const p = body.attributes.position;
  const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const prof = (x) => {
    const t = Math.min(1, Math.max(0, x + 0.5));
    let f = Math.max(0.08, Math.pow(Math.sin(Math.PI * Math.pow(t, 1.4)), sp.blunt));
    if (sp.beak) f *= 1 - 0.6 * sm(0.84, 0.95, t); // a dolphin's beak
    return Math.max(0.05, f);
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 0.5;
    const f = prof(x);
    p.setXYZ(i, x, p.getY(i) * f * sp.h * 0.5, p.getZ(i) * f * sp.w * 0.5);
  }
  body.computeVertexNormals();
  const parts = [[body, 0]];
  const shape = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); return new THREE.ShapeGeometry(s); };
  const [tl, th, fork] = sp.tail;
  let tail;
  if (sp.flukes) { // whales and dolphins: a crescent lying flat
    tail = shape([[0.04, 0.02], [-tl * 0.7, th], [-tl, th * 0.95], [-tl * fork, 0], [-tl, -th * 0.95], [-tl * 0.7, -th], [0.04, -0.02]]);
    tail.rotateX(Math.PI / 2);
  } else if (sp.shark) tail = shape([[0.03, 0.01], [-tl * 0.9, th * 1.4], [-tl * 0.55, 0.0], [-tl * 0.45, -th * 0.7], [0.03, -0.01]]);
  else tail = shape([[0.04, 0.02], [-tl, th], [-tl * fork, 0], [-tl, -th], [0.04, -0.02]]);
  tail.translate(-0.47, 0, 0);
  parts.push([tail, 1]);
  const topAt = (x) => prof(x) * sp.h * 0.5 * 0.92;
  if (sp.dorsal) {
    const [x1, x2, dh] = sp.dorsal;
    const yb = topAt((x1 + x2) / 2);
    parts.push([shape([[x1, 0], [x1 - (x1 - x2) * (sp.shark || sp.curvedDorsal ? 0.45 : 0.25), dh], [x2 - 0.04, dh * 0.35], [x2, 0]]).translate(0, yb - 0.01, 0), 1]);
  }
  if (sp.anal) {
    const [x1, x2, dh] = sp.anal;
    const yb = topAt((x1 + x2) / 2);
    parts.push([shape([[x1, 0], [x2, 0], [x2 - 0.04, -dh * 0.4], [x1 - (x1 - x2) * 0.3, -dh]]).translate(0, -yb + 0.01, 0), 1]);
  }
  for (const side of [1, -1]) {
    const len = sp.pec || 0.1;
    const pec = sp.pecAccent // a humpback's long white flipper
      ? shape([[0.02, 0], [-len * 0.45, -len], [-len * 0.25, -len * 0.95], [-0.04, 0]])
      : shape([[0, 0], [-len, -len * 0.9], [-len * 0.6, -len * 0.2]]);
    pec.rotateX(side * 0.9);
    pec.translate(0.22, -sp.h * 0.12, side * sp.w * 0.42);
    parts.push([pec, sp.pecAccent ? 2 : 1]);
  }
  if (sp.finlets) { // tuna: little yellow finlets along the back and belly towards the tail
    for (let k = 0; k < 6; k++) {
      const x = -0.2 - k * 0.04; const y = topAt(x);
      parts.push([shape([[x + 0.012, 0], [x - 0.02, 0.028], [x - 0.012, 0]]).translate(0, y - 0.004, 0), 2]);
      parts.push([shape([[x + 0.012, 0], [x - 0.012, 0], [x - 0.02, -0.028]]).translate(0, -y + 0.004, 0), 2]);
    }
  }
  return merge(THREE, parts);
}

function merge(THREE, parts, extra = []) {
  const pos = []; const nor = []; const part = []; const more = extra.map(() => []);
  for (const [g0, flag] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const a = g.attributes.position.array; const n = g.attributes.normal.array;
    for (let i = 0; i < a.length; i++) { pos.push(a[i]); nor.push(n[i]); }
    const count = a.length / 3;
    for (let i = 0; i < count; i++) part.push(flag);
    extra.forEach((name, j) => { const src = g.attributes[name]; for (let i = 0; i < count; i++) more[j].push(src ? src.array[i] : 0); });
    g.dispose(); if (g !== g0) g0.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  extra.forEach((name, j) => out.setAttribute(name, new THREE.Float32BufferAttribute(more[j], 1)));
  return out;
}

// Octopus (round mantle, eight long arms) or squid (long pointed mantle with fins, short arms and two long
// tentacles), length about 1.5 along +x: mantle first, arms trailing, the way they jet through the water.
function cephGeometry(THREE, sp) {
  const parts = [];
  const blob = (cx, rx, ry, rz, point = 0) => {
    const g = new THREE.SphereGeometry(1, 20, 12);
    g.rotateZ(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i); const taper = point && x > 0 ? 1 - point * Math.pow(x, 1.5) : 1;
      p.setXYZ(i, cx + x * rx, p.getY(i) * ry * taper, p.getZ(i) * rz * taper);
    }
    g.computeVertexNormals();
    return g;
  };
  const arm = (x0, r0, len, rb, rt, a) => {
    const g = new THREE.CylinderGeometry(rt, rb, len, 6, 12, false);
    g.rotateZ(Math.PI / 2); // tip towards -x
    g.translate(x0 - len / 2, r0 * Math.cos(a), r0 * Math.sin(a));
    const p = g.attributes.position;
    const k = new Float32Array(p.count); const ang = new Float32Array(p.count).fill(a);
    for (let i = 0; i < p.count; i++) k[i] = Math.min(1, Math.max(0.001, (x0 - p.getX(i)) / len));
    g.setAttribute('aK', new THREE.BufferAttribute(k, 1));
    g.setAttribute('aArm', new THREE.BufferAttribute(ang, 1));
    return g;
  };
  if (sp.ceph === 'octopus') {
    parts.push([blob(0.22, 0.32, 0.26, 0.26), 0], [blob(-0.05, 0.17, 0.15, 0.17), 0]);
    for (let i = 0; i < 8; i++) parts.push([arm(-0.12, 0.1, 0.9, 0.055, 0.008, (i / 8) * Math.PI * 2 + 0.2), 0]);
  } else {
    parts.push([blob(0.18, 0.42, 0.1, 0.1, 0.65), 0], [blob(-0.28, 0.1, 0.085, 0.09), 0]);
    const fin = new THREE.Shape(); fin.moveTo(0.62, 0); fin.lineTo(0.45, 0.17); fin.lineTo(0.3, 0); fin.lineTo(0.45, -0.17); fin.lineTo(0.62, 0);
    const fg = new THREE.ShapeGeometry(fin); fg.rotateX(Math.PI / 2);
    parts.push([fg, 0]);
    for (let i = 0; i < 8; i++) parts.push([arm(-0.36, 0.05, 0.28, 0.025, 0.004, (i / 8) * Math.PI * 2), 0]);
    for (const a of [0.4, Math.PI + 0.4]) parts.push([arm(-0.36, 0.03, 0.75, 0.012, 0.007, a), 0]);
  }
  return merge(THREE, parts, ['aK', 'aArm']);
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
