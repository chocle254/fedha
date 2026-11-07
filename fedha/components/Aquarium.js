import { useEffect, useRef } from 'react';

// Sapphire's living background: a deep-water aquarium in real 3D (three.js, loaded only for this tier).
// Marine life is scheduled as sparse, species-specific encounters: reef fish, butterflyfish, parrotfish,
// barracuda, mackerel and sardine schools, tuna, sharks, dolphins, whales, cephalopods, manta rays and jellyfish.
// Each swims its own path through the water (tails and bodies bend, flukes beat, mantas flap, octopus and squid
// jet, jellies pulse); scales flash as fish turn. Some head off into the blue until the water swallows them,
// then come back from the distance, and the big animals start far off and swim in. Light shafts, caustics on the fish and the sand,
// swaying kelp and drifting marine snow. Pauses on low battery (html.lx-saver) and when the app is hidden.

const FISH_VERT = `
uniform float uTime; uniform float uAmp; uniform float uFreq; uniform float uVert;
attribute float aPart; attribute float aPhase; attribute float aSpeed; attribute float aV; attribute float aA;
varying vec3 vPos; varying vec3 vN; varying vec3 vView; varying vec3 vWorld; varying float vPart; varying vec3 vObjN; varying float vV; varying float vA;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float s = clamp((0.15 - p.x) / 0.65, 0.0, 1.0);
  float bend = sin(uTime * uFreq * aSpeed + aPhase - p.x * 5.0) * uAmp * s * s;
  if (uVert > 0.5) p.y += bend; else p.z += bend;   // whales and dolphins beat their flukes up and down
  vPos = position; vPart = aPart; vObjN = normal; vV = aV; vA = aA;
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
uniform vec2 uEyeXY; uniform vec3 uFlukeUnder;
varying vec3 vPos; varying vec3 vN; varying vec3 vView; varying vec3 vWorld; varying float vPart; varying vec3 vObjN; varying float vV; varying float vA;
${COMMON_FRAG}
#include <fog_pars_fragment>
float band(float t, float c, float w) { return 1.0 - ss(w, w + 0.012, abs(t - c)); }
void main() {
  float t = vPos.x + 0.5;                                   // 0 tail .. 1 nose
  float up = clamp(vV * 0.5 + 0.5, 0.0, 1.0);               // 0 belly .. 1 back (around the body)
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
  } else if (uPattern == 6) {                               // great white: sharp wavy grey/white line, gill slits
    col = mix(uBelly, uBack, ss(0.4, 0.44, up + 0.04 * sin(t * 26.0) + 0.03 * sin(t * 61.0)));
    float g = 0.0;
    for (int i = 0; i < 5; i++) g += 1.0 - ss(0.0, 0.004, abs(t - (0.705 + float(i) * 0.016)));
    col *= 1.0 - 0.55 * clamp(g, 0.0, 1.0) * ss(0.25, 0.35, up) * ss(0.72, 0.62, up);
  } else if (uPattern == 7) {                               // dolphin: dark cape, grey flanks, pale belly
    col = mix(uBelly, uAccent, ss(0.3, 0.38, up));
    float dip = 0.12 * exp(-pow((t - 0.45) / 0.12, 2.0));    // the cape's edge dips below the dorsal fin
    col = mix(col, uBack, ss(0.62, 0.68, up + dip + 0.03 * sin(t * 8.0)));
    col = mix(col, uBelly, ss(0.965, 0.985, t));
  } else if (uPattern == 10) {                              // humpback: dark back, white belly, grooved throat, knobs
    float under = ss(-0.12, -0.35, vV + 0.08 * sin(t * 14.0) + 0.12 * (noise(vec2(t * 10.0, vA * 3.0)) - 0.5));
    col = mix(uBack, uBelly, under);
    col = mix(col, uBack * 1.7, 0.3 * ss(0.62, 0.82, noise(vec2(t * 32.0, vA * 9.0))) * (1.0 - under));
    if (vV < -0.25 && t > 0.5) col *= 0.72 + 0.28 * sin(vA * 95.0);
    if (t > 0.79 && abs(vV - (-0.1 - (1.0 - t) * 0.8)) < 0.018) col *= 0.3;           // mouth line
    if (t > 0.8 && (vV > 0.25 || abs(vV + 0.22) < 0.1)) {                              // knobs on head and jaw
      vec2 kc = fract(vec2(t * 70.0, vA * 9.0)) - 0.5;
      float kd = length(kc);
      col = mix(col, col * 0.55, ss(0.3, 0.22, kd) - ss(0.18, 0.1, kd));
      col = mix(col, uAccent * 0.9, ss(0.12, 0.05, kd) * 0.6);
    }
  } else if (uPattern == 11) {                              // blue whale: blue-grey with pale mottling, long pleats
    float m = noise(vec2(t * 46.0, vA * 11.0));
    col = mix(uBack, uAccent, 0.5 * ss(0.55, 0.78, m));
    col = mix(col, col * 0.7, 0.4 * ss(0.32, 0.12, m));
    col = mix(col, uBelly, 0.4 * ss(-0.3, -0.75, vV));
    if (vV < -0.3 && t > 0.5) col *= 0.8 + 0.2 * sin(vA * 120.0);
    if (t > 0.82 && abs(vV - (-0.12 - (1.0 - t) * 0.6)) < 0.014) col *= 0.35;
  } else if (uPattern == 12) {                              // sperm whale: dark wrinkled skin, pale scars on the head
    col = uBack * (0.8 + 0.35 * noise(vec2(t * 170.0, vA * 26.0)));
    if (t < 0.66) col *= 0.88 + 0.14 * sin(t * 300.0 + noise(vec2(t * 20.0, vA * 4.0)) * 6.0);
    float scar = abs(noise(vec2(t * 22.0, vA * 6.0)) - 0.5);
    col = mix(col, uAccent, 0.45 * ss(0.025, 0.0, scar) * ss(0.62, 0.7, t));
    col = mix(col, uBelly, 0.25 * ss(-0.5, -0.85, vV));
  } else if (uPattern == 13) {                              // orca: black and white
    float side = abs(cos(vA));
    float eyeP = (1.0 - ss(0.8, 1.0, length(vec2((t - 0.835) / 0.055, (vV - 0.22) / 0.15)))) * ss(0.35, 0.6, side);
    float belly = ss(-0.48, -0.62, vV) * ss(0.24, 0.32, t);
    float chin = ss(-0.12, -0.3, vV) * ss(0.86, 0.92, t);
    float lobeTop = -0.05 + 0.3 * sin(clamp((t - 0.18) / 0.24, 0.0, 1.0) * 3.14159);
    float lobe = ss(0.18, 0.21, t) * ss(0.43, 0.4, t) * ss(lobeTop + 0.03, lobeTop - 0.03, vV);
    col = mix(uBack, uBelly, clamp(max(max(eyeP, belly), max(chin, lobe)), 0.0, 1.0));
    col = mix(col, uAccent, 0.75 * ss(0.36, 0.39, t) * ss(0.49, 0.46, t) * ss(0.68, 0.8, vV));   // grey saddle
  } else if (uPattern == 14) {                              // butterflyfish: golden body, dark eye band and tail bar
    float eyeBand = 1.0 - ss(0.035, 0.055, abs(t - 0.82));
    float tailBar = 1.0 - ss(0.025, 0.045, abs(t - 0.12));
    col = mix(col, vec3(0.035, 0.045, 0.055), clamp(max(eyeBand, tailBar), 0.0, 1.0));
    col = mix(col, vec3(0.98, 0.9, 0.58), ss(0.05, 0.12, t) * ss(0.16, 0.1, t));
  } else if (uPattern == 15) {                              // parrotfish: turquoise scales with warm face and mottled plates
    float mosaic = noise(vec2(t * 34.0, up * 23.0));
    col = mix(uBack, uAccent, 0.34 * ss(0.48, 0.72, mosaic));
    col = mix(col, vec3(0.92, 0.48, 0.3), ss(0.82, 0.95, t) * 0.8);
    col += 0.08 * sin(vec3(0.0, 2.0, 4.0) + t * 90.0 + up * 24.0);
  } else if (uPattern == 16) {                              // barracuda: polished silver flank and dark vertical bars
    float bars = 0.0;
    for (int i = 0; i < 9; i++) bars += 1.0 - ss(0.018, 0.035, abs(t - (0.24 + float(i) * 0.065 + 0.012 * sin(up * 5.0))));
    col = mix(col, uBack * 0.55, clamp(bars, 0.0, 0.7) * ss(0.3, 0.55, up));
    col = mix(col, uBelly * 1.15, 0.42 * ss(0.12, 0.38, up));
    col += vec3(0.16, 0.19, 0.2) * pow(scales, 4.0);
  } else if (uPattern == 17) {                              // mackerel: blue-green back with tiger-like wavy bars
    float bars = 0.0;
    for (int i = 0; i < 11; i++) bars += 1.0 - ss(0.012, 0.028, abs(up - (0.55 + 0.34 * sin(t * 17.0 + float(i) * 0.56))));
    col = mix(col, uBack * 0.55, clamp(bars, 0.0, 0.82) * ss(0.45, 0.65, up));
    col = mix(col, uBelly, 0.65 * ss(0.22, 0.48, up));
  } else if (uPattern == 9) {                               // tuna: navy back, silver flanks, gold stripe
    col += 0.1 * ss(0.3, 0.2, length(fract(vec2(t * 30.0, up * 10.0)) - 0.5)) * ss(0.45, 0.25, up) * ss(0.2, 0.35, t);
  }
  col *= 0.9 + 0.12 * scales;
  if (vPart > 1.5) col = uAccent;
  else if (vPart > 0.5) {
    col = mix(uFin, uFin * 0.7, 0.5 + 0.5 * sin(vPos.y * 60.0 + vPos.x * 20.0));
    if (vObjN.y < -0.5) col = uFlukeUnder;                  // underside of flukes (white on humpbacks and orcas)
  }
  float shine = uShine;
  vec2 e = vec2(vPos.x - uEyeXY.x, vPos.y - uEyeXY.y);
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
  float az = abs(vPos.z);
  vec3 top = vec3(0.05, 0.06, 0.08) * (0.8 + 0.4 * noise(vPos.xz * 4.0));
  // white shoulder patches, leaving a black "T" down the middle
  float shoulder = ss(0.1, 0.16, az) * ss(0.55, 0.42, az) * ss(-0.05, 0.05, vPos.x) * ss(0.32, 0.22, vPos.x - az * 0.25);
  top = mix(top, vec3(0.85, 0.87, 0.88), shoulder * ss(0.3, 0.5, noise(vPos.xz * 6.0) + 0.3));
  vec3 belly = vec3(0.9, 0.91, 0.92);
  belly = mix(belly, vec3(0.08), ss(0.36, 0.3, length(fract(vPos.xz * vec2(9.0, 7.0)) - 0.5)) * step(0.62, noise(vPos.xz * 3.0)) * ss(0.3, 0.15, az));
  belly = mix(belly, vec3(0.25, 0.27, 0.3), ss(0.7, 0.95, az));          // dusky wing edges
  vec3 col = gl_FrontFacing ? top : belly;
  if (vPos.x > 0.38) col = vec3(0.06, 0.07, 0.09);                        // cephalic lobes and mouth
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
  { key: 'tang', yaw: 1.0, n: 3, school: 1, visit: { gap: [55, 105], stay: [24, 42], w: 1.5 }, prey: true, pauses: true, wander: 0.9, len: [1.1, 1.5], h: 0.62, w: 0.15, blunt: 0.55, tail: [0.2, 0.2, 0.55], dorsal: [0.32, -0.38, 0.12], anal: [0.1, -0.36, 0.1], pattern: 2, back: '#1d4ed8', belly: '#3b82f6', fin: '#1e3a8a', accent: '#facc15', speed: 1.5, amp: 0.07, freq: 7, eye: 0.04, shine: 0.6, glint: 0.45 },
  { key: 'clown', yaw: 1.2, n: 2, school: 1, visit: { gap: [85, 150], stay: [22, 38], w: 0.8 }, prey: true, pauses: true, wander: 1.0, len: [0.7, 0.95], h: 0.44, w: 0.2, blunt: 0.5, tail: [0.18, 0.15, 0.85], dorsal: [0.3, -0.35, 0.1], anal: [0.0, -0.3, 0.07], pattern: 1, back: '#f97316', belly: '#fb923c', fin: '#ea580c', speed: 1.0, amp: 0.09, freq: 9, eye: 0.045, shine: 0.7, glint: 0.35, zNear: 0, zIn: -40 },
  { key: 'angel', yaw: 0.9, n: 2, school: 1, visit: { gap: [75, 145], stay: [24, 40], w: 1.0 }, prey: true, pauses: true, wander: 0.8, len: [1.3, 1.7], h: 0.72, w: 0.13, blunt: 0.5, tail: [0.16, 0.18, 0.95], dorsal: [0.25, -0.42, 0.1], anal: [0.15, -0.4, 0.09], pattern: 3, back: '#1e3a8a', belly: '#1e40af', fin: '#1e3a8a', accent: '#fde047', speed: 1.0, amp: 0.06, freq: 6, eye: 0.035, shine: 0.6, glint: 0.45 },
  { key: 'grouper', yaw: 0.5, n: 1, visit: { gap: [110, 190], stay: [35, 55], w: 0.55 }, pauses: true, wander: 0.6, len: [2.6, 3.4], h: 0.36, w: 0.27, blunt: 0.65, tail: [0.18, 0.16, 0.9], dorsal: [0.3, -0.35, 0.07], anal: [0.0, -0.3, 0.05], pattern: 5, back: '#5b4636', belly: '#9a8268', fin: '#4a3a2c', speed: 0.8, amp: 0.05, freq: 4, eye: 0.028, shine: 0.3, glint: 0.12, y: [-12, -2] },
  { key: 'sardine', yaw: 1.2, n: 72, school: 1, spread: 2.2, visit: { gap: [75, 135], stay: [25, 42], w: 1.1 }, prey: true, wander: 0.7, seg: [16, 10], len: [0.42, 0.55], h: 0.2, w: 0.1, blunt: 0.8, tail: [0.16, 0.13, 0.5], dorsal: [0.12, -0.06, 0.05], anal: null, pattern: 4, back: '#1e3a5f', belly: '#d1d5db', fin: '#94a3b8', speed: 2.6, amp: 0.08, freq: 14, eye: 0.04, shine: 1.0, glint: 1.0 },
  { key: 'tuna', yaw: 0.7, n: 8, school: 1, spread: 2.5, predator: true, wander: 0.5, visit: { gap: [70, 150], stay: [25, 45], w: 1 }, len: [1.8, 2.4], h: 0.28, w: 0.2, blunt: 0.72, tail: [0.2, 0.32, 0.35], dorsal: [0.12, -0.02, 0.1], anal: [0.0, -0.08, 0.07], finlets: true, pec: 0.13, pattern: 9, back: '#0b1f4a', belly: '#d6dde6', fin: '#1e3a5f', accent: '#c9a227', speed: 4.2, amp: 0.05, freq: 9, eye: 0.028, shine: 0.9, glint: 0.9, far: true, zNear: -5, zIn: -85 },
  { key: 'shark', yaw: 0.35, n: 2, big: true, predator: true, wander: 0.45, visit: { gap: [60, 150], stay: [40, 70], w: 1 }, close: 0.3, len: [6, 8], h: 0.2, w: 0.18, blunt: 0.75, tail: [0.24, 0.22, 0.45], shark: true, dorsal: [0.12, -0.08, 0.17], anal: null, pec: 0.16, pattern: 6, back: '#4b5563', belly: '#e5e7eb', fin: '#4b5563', speed: 2.3, amp: 0.05, freq: 2.2, eye: 0.012, shine: 0.25, glint: 0.04, far: true, zNear: -12, zIn: -90 },
  { key: 'dolphin', yaw: 0.6, n: 4, school: 1, spread: 2.2, big: true, predator: true, wander: 0.6, visit: { gap: [120, 240], stay: [30, 50], w: 1.6 }, close: 0.3, len: [2.4, 3.0], h: 0.22, w: 0.2, blunt: 0.75, beak: true, flukes: true, tail: [0.16, 0.2, 0.6], dorsal: [0.08, -0.12, 0.13], curvedDorsal: true, anal: null, pec: 0.12, pattern: 7, back: '#374151', belly: '#e5e7eb', fin: '#374151', accent: '#9ca3af', speed: 4.0, amp: 0.06, freq: 3.5, eye: 0.012, shine: 0.55, glint: 0, far: true, zNear: -8, zIn: -80, y: [-6, 8] },
  // Whales share one visit timer, so only now and then does one come by: humpback, blue, sperm, or an orca pod.
  { key: 'humpback', kind: 'whale', group: 'whale', yaw: 0.12, n: 1, big: true, wander: 0.25, visit: { gap: [90, 150], stay: [85, 115], w: 1.8, first: true }, close: 0.25, len: [13, 16],
    st: [[0, 0.012, 0.012, 0.008, 0, 2], [0.08, 0.03, 0.03, 0.018, 0, 2], [0.2, 0.06, 0.062, 0.045, 0, 2], [0.35, 0.085, 0.092, 0.08, 0, 2], [0.5, 0.1, 0.11, 0.1, 0, 2], [0.62, 0.1, 0.115, 0.105, -0.005, 2], [0.75, 0.088, 0.105, 0.1, -0.01, 2.2], [0.86, 0.068, 0.09, 0.085, -0.02, 2.3], [0.94, 0.044, 0.064, 0.06, -0.03, 2.3], [0.985, 0.02, 0.034, 0.03, -0.035, 2], [1, 0, 0, 0, -0.035, 2]],
    eyeAt: [0.8, -0.12], dorsalFin: [-0.17, 0.03, 0.05, 'hump'], flipper: { at: 0.72, len: 0.31, w: 0.05, knobs: true, accent: true }, flukeShape: { span: 0.16, sweep: 0.08, notch: 0.035, serr: 0.006 },
    pattern: 10, back: '#1c2636', belly: '#e8ecef', fin: '#1c2636', accent: '#eef1f3', flukeUnder: '#d9dee2', speed: 1.6, amp: 0.04, freq: 1.1, eye: 0.009, shine: 0.45, glint: 0, far: true, zNear: -30, zIn: -95, y: [-7, 6] },
  { key: 'bluewhale', kind: 'whale', group: 'whale', yaw: 0.1, n: 1, big: true, wander: 0.2, visit: { gap: [90, 150], stay: [85, 115], w: 1.5, first: true }, close: 0.15, len: [20, 24],
    st: [[0, 0.008, 0.008, 0.006, 0, 2], [0.1, 0.022, 0.022, 0.016, 0, 2], [0.25, 0.045, 0.046, 0.04, 0, 2], [0.45, 0.064, 0.07, 0.064, 0, 2], [0.6, 0.068, 0.075, 0.07, 0, 2], [0.75, 0.062, 0.07, 0.07, -0.003, 2.2], [0.86, 0.042, 0.06, 0.07, -0.008, 2.7], [0.95, 0.024, 0.04, 0.055, -0.012, 2.7], [0.99, 0.01, 0.02, 0.03, -0.014, 2], [1, 0, 0, 0, -0.014, 2]],
    eyeAt: [0.83, -0.15], dorsalFin: [-0.27, 0.014, 0.025, 'falcate'], flipper: { at: 0.74, len: 0.12, w: 0.025 }, flukeShape: { span: 0.12, sweep: 0.07, notch: 0.03, serr: 0 },
    pattern: 11, back: '#4a6687', belly: '#8ea4bb', fin: '#3e5878', accent: '#a9bfd6', flukeUnder: '#53708f', speed: 1.8, amp: 0.035, freq: 0.9, eye: 0.006, shine: 0.45, glint: 0, far: true, zNear: -35, zIn: -110, y: [-6, 6] },
  { key: 'sperm', kind: 'whale', group: 'whale', yaw: 0.12, n: 1, big: true, wander: 0.25, visit: { gap: [90, 150], stay: [85, 115], w: 1.5, first: true }, close: 0.2, len: [14, 17],
    st: [[0, 0.012, 0.012, 0.008, 0, 2], [0.1, 0.035, 0.035, 0.022, 0, 2], [0.25, 0.07, 0.07, 0.06, 0, 2], [0.45, 0.1, 0.1, 0.095, 0, 2], [0.6, 0.11, 0.11, 0.108, 0, 2.2], [0.68, 0.115, 0.108, 0.105, 0.002, 2.8], [0.8, 0.12, 0.1, 0.1, 0.004, 3.5], [0.93, 0.12, 0.09, 0.095, 0.006, 4], [0.99, 0.112, 0.075, 0.085, 0.008, 4], [1, 0, 0, 0, 0.008, 2]],
    knuckles: true, eyeAt: [0.7, -0.35], jaw: true, flipper: { at: 0.66, len: 0.07, w: 0.035 }, flukeShape: { span: 0.14, sweep: 0.075, notch: 0.02, serr: 0 },
    pattern: 12, back: '#3b4149', belly: '#6b7179', fin: '#353a41', accent: '#c9ced3', flukeUnder: '#3b4149', speed: 1.5, amp: 0.04, freq: 1.0, eye: 0.008, shine: 0.35, glint: 0, far: true, zNear: -30, zIn: -100, y: [-12, 3] },
  { key: 'orca', kind: 'whale', group: 'whale', yaw: 0.35, n: 3, school: 1, spread: 3, big: true, predator: true, wander: 0.4, visit: { gap: [90, 150], stay: [65, 95], w: 1.7, first: true }, close: 0.3, len: [6.5, 8.5],
    st: [[0, 0.012, 0.012, 0.008, 0, 2], [0.1, 0.04, 0.04, 0.025, 0, 2], [0.25, 0.085, 0.09, 0.075, 0, 2], [0.45, 0.115, 0.12, 0.11, 0, 2], [0.6, 0.115, 0.12, 0.115, 0, 2], [0.75, 0.1, 0.11, 0.105, 0, 2], [0.87, 0.075, 0.085, 0.085, -0.005, 2], [0.95, 0.045, 0.055, 0.055, -0.008, 2], [0.99, 0.018, 0.022, 0.022, -0.008, 2], [1, 0, 0, 0, -0.008, 2]],
    eyeAt: [0.885, 0.02], dorsalFin: [0.02, 0.15, 0.09, 'tall'], flipper: { at: 0.7, len: 0.13, w: 0.07, paddle: true }, flukeShape: { span: 0.13, sweep: 0.06, notch: 0.025, serr: 0 },
    pattern: 13, back: '#0a0c0f', belly: '#f2f2ef', fin: '#0a0c0f', accent: '#7d848d', flukeUnder: '#e9eaea', speed: 3.4, amp: 0.05, freq: 2.2, eye: 0.008, shine: 0.7, glint: 0, far: true, zNear: -10, zIn: -85, y: [-6, 8] },
  { key: 'manta', yaw: 0.3, manta: true, n: 2, big: true, wander: 0.4, visit: { gap: [100, 200], stay: [40, 70], w: 0.8 }, close: 0.3, len: [5, 7], speed: 1.6, far: true, y: [-8, 6] },
  { key: 'octopus', yaw: 0.8, ceph: 'octopus', n: 2, prey: true, pauses: true, wander: 0.8, visit: { gap: [60, 130], stay: [50, 90], w: 1 }, len: [1.3, 2.0], body: '#b5472d', belly: '#f1c3a6', eyeX: -0.03, eye: 0.05, shine: 0.7, speed: 0.9, jet: 1.1, y: [-15, -9], zNear: 0, zIn: -50 },
  { key: 'squid', yaw: 0.9, ceph: 'squid', n: 4, school: 1, spread: 1.6, prey: true, wander: 0.8, visit: { gap: [80, 160], stay: [30, 50], w: 1 }, len: [1.1, 1.6], body: '#e9b8b0', belly: '#fbe7e2', eyeX: -0.27, eye: 0.045, shine: 0.9, speed: 2.0, jet: 2.0, y: [-9, 5], zNear: 2, zIn: -60 },
  // Additional reef visitors: these appear as occasional small encounters, never as a permanent crowd.
  { key: 'butterflyfish', yaw: 1.0, n: 2, school: 1, visit: { gap: [95, 175], stay: [22, 38], w: 0.9 }, prey: true, wander: 0.85, len: [0.75, 0.95], h: 0.58, w: 0.17, blunt: 0.48, tail: [0.15, 0.14, 0.9], dorsal: [0.28, -0.34, 0.08], anal: [0.08, -0.3, 0.06], pattern: 14, back: '#f4c84a', belly: '#f5dc83', fin: '#e9ad32', accent: '#171923', speed: 1.05, amp: 0.055, freq: 7, eye: 0.035, shine: 0.65, glint: 0.35 },
  { key: 'parrotfish', yaw: 0.8, n: 1, visit: { gap: [125, 210], stay: [30, 48], w: 0.65 }, prey: true, wander: 0.7, len: [1.5, 1.9], h: 0.62, w: 0.2, blunt: 0.55, tail: [0.19, 0.18, 0.6], dorsal: [0.3, -0.4, 0.11], anal: [0.05, -0.34, 0.08], pattern: 15, back: '#168c86', belly: '#58b6a4', fin: '#126b72', accent: '#e68a45', speed: 1.25, amp: 0.06, freq: 6, eye: 0.034, shine: 0.55, glint: 0.3 },
  { key: 'barracuda', yaw: 0.55, n: 2, school: 1, visit: { gap: [140, 230], stay: [25, 42], w: 0.45 }, predator: true, wander: 0.45, len: [2.8, 3.4], h: 0.18, w: 0.12, blunt: 0.95, tail: [0.22, 0.19, 0.28], dorsal: [0.12, -0.06, 0.07], anal: [0.0, -0.08, 0.05], pattern: 16, back: '#647b83', belly: '#c7d1d1', fin: '#516a73', accent: '#aab8b8', speed: 3.0, amp: 0.045, freq: 8, eye: 0.022, shine: 0.7, glint: 0.5, far: true, zNear: -8, zIn: -75 },
  { key: 'mackerel', yaw: 1.0, n: 12, school: 1, spread: 2.8, visit: { gap: [115, 190], stay: [22, 36], w: 0.7 }, prey: true, wander: 0.65, len: [0.65, 0.85], h: 0.22, w: 0.12, blunt: 0.85, tail: [0.18, 0.15, 0.35], dorsal: [0.16, -0.04, 0.05], anal: [0.02, -0.05, 0.04], pattern: 17, back: '#234b66', belly: '#c6d5d9', fin: '#668b9c', accent: '#b4c8ce', speed: 3.1, amp: 0.07, freq: 12, eye: 0.024, shine: 0.8, glint: 0.75, far: true, zNear: -12, zIn: -85 },
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
  // No permanent crowd: small reef groups and schools arrive in staggered encounters, linger, then leave into
  // the blue. Never more than two encounters at once and only one large animal. Predators may trigger a brief
  // flight response in nearby prey, rather than keeping every species on screen together.
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
      uAccent: { value: new THREE.Color(sp.accent || sp.fin) }, uPattern: { value: sp.pattern }, uH: { value: sp.h || 0.2 }, uEye: { value: sp.eye }, uShine: { value: sp.shine }, uGlint: { value: sp.glint || 0 },
      uEyeXY: { value: new THREE.Vector2(...eyeXY(sp)) }, uFlukeUnder: { value: new THREE.Color(sp.flukeUnder || sp.fin) },
    },
  }));
  const meshes = [];
  const units = [];
  for (const sp of SPECIES) {
    const geo = keep(sp.ceph ? cephGeometry(THREE, sp) : sp.manta ? mantaGeometry(THREE) : sp.kind === 'whale' ? whaleGeometry(THREE, sp) : fishGeometry(THREE, sp));
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
        // Sardines form a broad, shallow shoal rather than a spherical cloud.
        // The loose spacing leaves room for each fish to turn while the group still reads as one school.
        const off = sp.key === 'sardine'
          ? new THREE.Vector3((Math.random() - 0.5) * 5.8 * k, (Math.random() - 0.5) * 1.25 * k, (Math.random() - 0.5) * 2.8 * k)
          : new THREE.Vector3((Math.random() - 0.5) * 3 * k, (Math.random() - 0.5) * 1.6 * k, (Math.random() - 0.5) * 3 * k);
        members.push({ i, off, size: sp.len[0] + Math.random() * (sp.len[1] - sp.len[0]), ph: Math.random() * 6.3 });
        mesh.setMatrixAt(i, HIDDEN);
      }
      units.push({ sp, mesh, c, members, active: false, resident: s < (sp.resident || 0), fear: 0, flee: new THREE.Vector3(), until: 0, huntUntil: 0 });
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1));
  }

  // When each visitor may next come by. The whale's first visit is a few minutes in.
  const visitKey = (sp) => sp.group || sp.key;
  const visits = new Map(SPECIES.filter((sp) => sp.visit).map((sp) => {
    const gap = sp.visit.gap[0] + Math.random() * (sp.visit.gap[1] - sp.visit.gap[0]);
    return [visitKey(sp), { at: sp.visit.first ? Math.min(gap, 25 + Math.random() * 15) : Math.random() * Math.min(8, sp.visit.gap[0] * 0.15) }];
  }));

  const rand = (r) => r[0] + Math.random() * (r[1] - r[0]);
  function activate(u, initial) {
    const c = u.c;
    const entryZ = initial
      ? c.zNear - Math.random() * (c.zNear - c.zIn)
      : u.sp.big
        ? c.zIn - 8 - Math.random() * 12
        : BOUNDS.zFar - 10 - Math.random() * 15;
    c.pos.set((Math.random() - 0.5) * 2 * BOUNDS.x, c.yLo + Math.random() * (c.yHi - c.yLo), entryZ);
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

  let nextVisit = 2 + Math.random() * 3;
  function director(t) {
    if (t < nextVisit) return;
    nextVisit = t + 10 + Math.random() * 12;
    const out = units.filter((u) => u.active && !u.resident);
    if (out.length >= 2) return;
    const bigOut = out.some((u) => u.sp.big);
    const pool = units.filter((u) => !u.active && !u.resident && u.sp.visit && t >= visits.get(visitKey(u.sp)).at && !(bigOut && u.sp.big) && !out.some((o) => visitKey(o.sp) === visitKey(u.sp)));
    if (!pool.length) return;
    let r = Math.random() * pool.reduce((sum, u) => sum + u.sp.visit.w, 0);
    const u = pool.find((x) => (r -= x.sp.visit.w) <= 0) || pool[0];
    activate(u, false);
    visits.get(visitKey(u.sp)).at = t + rand(u.sp.visit.gap);
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
  for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
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
  // Each species gets its own silhouette: body depth, shoulder, peduncle and snout are
  // deliberately different rather than scaling the same generic fish for every species.
  const body = new THREE.SphereGeometry(1, sp.seg ? Math.max(24, sp.seg[0]) : 40, sp.seg ? Math.max(16, sp.seg[1]) : 26);
  body.rotateZ(-Math.PI / 2);
  const p = body.attributes.position;
  const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const prof = (x) => {
    const t = Math.min(1, Math.max(0, x + 0.5));
    let f = Math.max(0.035, Math.pow(Math.sin(Math.PI * Math.pow(t, 1.4)), sp.blunt));
    if (sp.beak) f *= 1 - 0.6 * sm(0.84, 0.95, t);
    return f;
  };
  const av = new Float32Array(p.count); const aa = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 0.5;
    const t = x + 0.5;
    const radialY = p.getY(i);
    const radialZ = p.getZ(i);
    let depth = 1; let width = 1; let crown = 1;
    if (sp.key === 'butterflyfish') {
      depth = 1.18; width = 0.78; crown = 1.0;
    } else if (sp.key === 'angel') {
      depth = 1.32; width = 0.7; crown = 1.02;
    } else if (sp.key === 'parrotfish') {
      depth = 1.08 + 0.12 * sm(0.62, 0.92, t); width = 1.05;
    } else if (sp.key === 'barracuda') {
      depth = 0.62; width = 0.76;
    } else if (sp.key === 'mackerel' || sp.key === 'sardine') {
      depth = 0.78; width = 0.82;
    } else if (sp.key === 'tuna') {
      depth = 1.04; width = 1.02;
    } else if (sp.key === 'clown') {
      depth = 1.12; width = 0.96;
    } else if (sp.key === 'tang') {
      depth = 1.08; width = 0.82;
    }
    // A raised shoulder and a pinched tail wrist give the body a more natural fish profile.
    const shoulder = 1 + 0.12 * Math.exp(-Math.pow((t - 0.58) / 0.2, 2));
    const peduncle = 1 - 0.28 * sm(0.12, 0.28, t) * (1 - sm(0.02, 0.12, t));
    let y = radialY * prof(x) * sp.h * 0.5 * depth * shoulder;
    let z = radialZ * prof(x) * sp.w * 0.5 * width * peduncle;
    if (sp.key === 'parrotfish' && t > 0.88) y *= 0.78; // blunt, beak-like forehead
    if (sp.key === 'barracuda' && t > 0.84) y *= 1 - 0.48 * sm(0.84, 1.0, t); // pointed jaw
    y *= crown;
    av[i] = radialY; aa[i] = Math.atan2(radialY, radialZ);
    p.setXYZ(i, x, y, z);
  }
  body.setAttribute('aV', new THREE.BufferAttribute(av, 1));
  body.setAttribute('aA', new THREE.BufferAttribute(aa, 1));
  body.computeVertexNormals();
  const parts = [[body, 0]];
  // Extruded fins have real thickness and softened edges instead of paper-thin flat polygons.
  const shape = (pts) => {
    const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.006, bevelThickness: 0.006 });
    g.translate(0, 0, -0.009);
    return g;
  };
  const [tl, th, fork] = sp.tail;
  let tail;
  if (sp.flukes) {
    tail = shape([[0.04, 0.02], [-tl * 0.7, th], [-tl, th * 0.95], [-tl * fork, 0], [-tl, -th * 0.95], [-tl * 0.7, -th], [0.04, -0.02]]);
    tail.rotateX(Math.PI / 2);
  } else if (sp.shark) {
    tail = shape([[0.03, 0.01], [-tl * 0.9, th * 1.4], [-tl * 0.55, 0.0], [-tl * 0.45, -th * 0.7], [0.03, -0.01]]);
  } else if (sp.key === 'tuna' || sp.key === 'mackerel' || sp.key === 'barracuda' || sp.key === 'sardine') {
    tail = shape([[0.04, 0.02], [-tl * 0.35, th * 0.25], [-tl, th], [-tl * fork, 0], [-tl, -th], [-tl * 0.35, -th * 0.25], [0.04, -0.02]]);
  } else {
    tail = shape([[0.04, 0.02], [-tl, th], [-tl * fork, 0], [-tl, -th], [0.04, -0.02]]);
  }
  tail.translate(-0.47, 0, 0);
  parts.push([tail, 1]);
  const topAt = (x) => prof(x) * sp.h * 0.5 * 0.92;
  if (sp.dorsal) {
    const [x1, x2, dh] = sp.dorsal;
    const yb = topAt((x1 + x2) / 2);
    const finPts = sp.key === 'butterflyfish'
      ? [[x1, 0], [x1 - 0.05, dh * 0.7], [x2 + 0.03, dh], [x2, 0]]
      : sp.key === 'parrotfish'
        ? [[x1, 0], [x1 - 0.08, dh * 0.55], [x2 + 0.04, dh * 0.72], [x2, 0]]
        : [[x1, 0], [x1 - (x1 - x2) * (sp.shark || sp.curvedDorsal ? 0.45 : 0.25), dh], [x2 - 0.04, dh * 0.35], [x2, 0]];
    parts.push([shape(finPts).translate(0, yb - 0.01, 0), 1]);
  }
  if (sp.anal) {
    const [x1, x2, dh] = sp.anal;
    const yb = topAt((x1 + x2) / 2);
    parts.push([shape([[x1, 0], [x2, 0], [x2 - 0.04, -dh * 0.4], [x1 - (x1 - x2) * 0.3, -dh]]).translate(0, -yb + 0.01, 0), 1]);
  }
  for (const side of [1, -1]) {
    const len = sp.pec || (sp.key === 'butterflyfish' || sp.key === 'parrotfish' ? 0.15 : 0.1);
    const pec = sp.pecAccent
      ? shape([[0.02, 0], [-len * 0.45, -len], [-len * 0.25, -len * 0.95], [-0.04, 0]])
      : shape([[0, 0], [-len, -len * 0.9], [-len * 0.6, -len * 0.2]]);
    pec.rotateX(-side * 0.9);
    pec.translate(0.22, -sp.h * 0.12, side * sp.w * 0.42);
    parts.push([pec, sp.pecAccent ? 2 : 1]);
  }
  // A raised gill-cover seam and short gill slits are visible on both flanks.
  for (const side of [1, -1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.22, 0.055, side * sp.w * 0.49),
      new THREE.Vector3(0.17, 0.015, side * sp.w * 0.51),
      new THREE.Vector3(0.16, -0.055, side * sp.w * 0.49),
      new THREE.Vector3(0.21, -0.09, side * sp.w * 0.44),
    ]);
    parts.push([new THREE.TubeGeometry(curve, 14, 0.0045, 5, false), 2]);
    for (let k = 0; k < 3; k++) {
      const x = 0.13 - k * 0.018;
      const slit = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, 0.045, side * sp.w * 0.49),
        new THREE.Vector3(x - 0.012, 0, side * sp.w * 0.52),
        new THREE.Vector3(x, -0.045, side * sp.w * 0.49),
      ]);
      parts.push([new THREE.TubeGeometry(slit, 8, 0.0025, 4, false), 2]);
    }
  }
  // A fine lateral-line canal runs from behind the gill cover towards the tail.
  // It follows the body surface, so it reads as a feature of the fish rather than a floating stripe.
  const lineWidth = sp.key === 'butterflyfish' || sp.key === 'tang' ? 0.82
    : sp.key === 'angel' ? 0.7
      : sp.key === 'parrotfish' || sp.key === 'tuna' || sp.key === 'clown' ? 1.0
        : sp.key === 'barracuda' || sp.key === 'mackerel' || sp.key === 'sardine' ? 0.82 : 1.0;
  for (const side of [1, -1]) {
    const linePts = [];
    for (let k = 0; k <= 18; k++) {
      const x = 0.08 - k * 0.024;
      const t = Math.min(1, Math.max(0, x + 0.5));
      const surface = prof(x) * sp.w * 0.5 * lineWidth * (1 - 0.28 * sm(0.12, 0.28, t) * (1 - sm(0.02, 0.12, t)));
      const y = 0.012 + 0.008 * Math.sin(k / 18 * Math.PI);
      linePts.push(new THREE.Vector3(x, y, side * (surface + 0.002)));
    }
    const lateral = new THREE.CatmullRomCurve3(linePts);
    parts.push([new THREE.TubeGeometry(lateral, 28, 0.0028, 5, false), 1]);
  }
  // A small, slightly downturned mouth gives the head a readable endpoint in profile.
  for (const side of [1, -1]) {
    const mouth = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.485, -0.018, side * 0.018),
      new THREE.Vector3(0.465, -0.026, side * 0.035),
      new THREE.Vector3(0.438, -0.025, side * 0.045),
    ]);
    parts.push([new THREE.TubeGeometry(mouth, 8, 0.0035, 5, false), 1]);
  }
  // Fine rays in the tail fan catch the light when the fish turns.
  for (let side = -1; side <= 1; side++) {
    const ray = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.49, 0, side * 0.004),
      new THREE.Vector3(-0.47 - tl * 0.45, side * th * 0.42, side * 0.006),
      new THREE.Vector3(-0.47 - tl * fork * 0.88, side * th * 0.82, side * 0.004),
    ]);
    parts.push([new THREE.TubeGeometry(ray, 10, 0.0022, 4, false), 2]);
  }
  if (sp.finlets) {
    for (let k = 0; k < 6; k++) {
      const x = -0.2 - k * 0.04; const y = topAt(x);
      parts.push([shape([[x + 0.012, 0], [x - 0.02, 0.028], [x - 0.012, 0]]).translate(0, y - 0.004, 0), 2]);
      parts.push([shape([[x + 0.012, 0], [x - 0.012, 0], [x - 0.02, -0.028]]).translate(0, -y + 0.004, 0), 2]);
    }
  }
  return merge(THREE, parts, ['aV', 'aA']);
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

// Where the eye sits (object space): whales from their body stations, fish just behind the snout.
function eyeXY(sp) {
  if (sp.kind !== 'whale') return [0.36, (sp.h || 0.2) * 0.12];
  const [t, v] = sp.eyeAt; const [, top, bot, , yc] = station(sp.st, t);
  return [t - 0.5, yc + v * (v > 0 ? top : bot)];
}

// Body shape between stations [t, top, bottom, half-width, centre height, squareness] (t: 0 tail .. 1 snout),
// smoothly (Catmull-Rom), so the outline flows like a real animal's.
function station(st, t) {
  let i = 0;
  while (i < st.length - 2 && t > st[i + 1][0]) i++;
  const p0 = st[Math.max(0, i - 1)]; const p1 = st[i]; const p2 = st[i + 1]; const p3 = st[Math.min(st.length - 1, i + 2)];
  const k = Math.min(1, Math.max(0, (t - p1[0]) / (p2[0] - p1[0])));
  const k2 = k * k; const k3 = k2 * k;
  return p1.map((_, j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * k + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * k2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * k3));
}

// A whale, length 1 along +x (snout at +0.5): the body lofted through its stations (superellipse rings, so a
// sperm whale's head can be square), with flippers, dorsal fin or hump, knuckles, lower jaw and flukes.
function whaleGeometry(THREE, sp) {
  const N = 90; const M = 30;
  const pos = []; const av = []; const aa = []; const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = 0.5 - 0.5 * Math.cos((Math.PI * i) / N); // rings bunch up at the snout and the tail
    let [, top, bot, w, yc, n] = station(sp.st, t);
    top = Math.max(0, top); bot = Math.max(0, bot); w = Math.max(0, w);
    if (sp.knuckles) { // sperm whale: a hump two-thirds back, then a row of knuckles to the tail
      top += 0.022 * Math.exp(-(((t - 0.34) / 0.035) ** 2));
      if (t > 0.06 && t < 0.3) top += 0.008 * Math.max(0, Math.cos(((t - 0.06) / 0.04) * Math.PI * 2));
    }
    for (let j = 0; j <= M; j++) {
      const a = (j / M) * Math.PI * 2; const sn = Math.sin(a); const cs = Math.cos(a);
      const ys = Math.sign(sn) * Math.abs(sn) ** (2 / n); const zs = Math.sign(cs) * Math.abs(cs) ** (2 / n);
      pos.push(t - 0.5, yc + ys * (sn >= 0 ? top : bot), zs * w);
      av.push(sn); aa.push(a);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * (M + 1) + j; const b = a + M + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('aV', new THREE.Float32BufferAttribute(av, 1));
  body.setAttribute('aA', new THREE.Float32BufferAttribute(aa, 1));
  body.setIndex(idx);
  body.computeVertexNormals();
  const parts = [[body, 0]];
  const shape = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); return new THREE.ShapeGeometry(s); };
  const at = (t) => station(sp.st, t);

  // Flukes: a wide, swept-back pair lying flat, notched in the middle (a humpback's trailing edge is serrated).
  const fs = sp.flukeShape; const half = [];
  half.push([0.03, 0.006], [-fs.sweep * 0.35, fs.span * 0.55], [-fs.sweep, fs.span]);
  for (let k = 1; k <= 10; k++) { const u = k / 10; half.push([-fs.sweep + (fs.sweep - fs.notch) * u * 0.6 - (fs.notch * u * 0.4) + fs.serr * Math.sin(u * Math.PI * 9), fs.span * (1 - u) * 0.98]); }
  const outline = [...half, ...half.slice().reverse().map(([x, y]) => [x, -y])];
  const fl = shape(outline); fl.rotateX(Math.PI / 2); fl.translate(-0.495, at(0.01)[4], 0);
  parts.push([fl, 1]);

  // Dorsal fin or hump.
  if (sp.dorsalFin) {
    const [x, h, base, kind] = sp.dorsalFin; const t = x + 0.5; const [, top, , , yc] = at(t);
    const pts = kind === 'tall' ? [[base * 0.6, 0], [-base * 0.1, h], [-base * 0.3, h * 0.94], [-base * 0.45, 0]]
      : kind === 'falcate' ? [[base * 0.5, 0], [-base * 0.35, h], [-base * 0.55, h * 0.8], [-base * 0.3, h * 0.3], [-base * 0.5, 0]]
        : [[base * 0.7, 0], [0, h * 0.6], [-base * 0.3, h], [-base * 0.5, h * 0.5], [-base * 0.6, 0]];
    parts.push([shape(pts).translate(x, yc + top - 0.006, 0), 1]);
  }

  // Flippers: long, white and knobbly on a humpback; slim on a blue whale; paddles on sperm whales and orcas.
  const fp = sp.flipper; const [, , bot, w, yc] = at(fp.at);
  for (const side of [1, -1]) {
    const L = fp.len; const W = fp.w; const lead = []; const trail = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      const width = fp.paddle ? W * Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.1)) : W * (1 - u * 0.85);
      const bump = fp.knobs ? 0.005 * Math.abs(Math.sin(u * Math.PI * 10)) : 0;
      lead.push([width * 0.55 + bump, -L * u]);
      trail.push([-width * 0.45, -L * u]);
    }
    const g = shape([...lead, ...trail.reverse()]);
    g.rotateZ(-0.75);                  // swept back
    g.rotateX(-side * 0.65);           // and out from the body
    g.translate(fp.at - 0.5, yc - bot * 0.45, side * w * 0.85);
    parts.push([g, fp.accent ? 2 : 1]);
  }

  // Sperm whale: the narrow lower jaw tucked under the huge head.
  if (sp.jaw) {
    const jaw = new THREE.CylinderGeometry(0.018, 0.026, 0.3, 10, 4);
    jaw.rotateZ(Math.PI / 2);
    jaw.scale(1, 0.7, 1);
    const [, , b2, , y2] = at(0.86);
    jaw.translate(0.33, y2 - b2 + 0.004, 0);
    parts.push([jaw, 2]);
  }
  return merge(THREE, parts, ['aV', 'aA']);
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
    // the two cephalic lobes either side of the mouth, curling forward
    const lobe = u > 0.75 && Math.abs(v) > 0.45 ? 0.22 * ((u - 0.75) / 0.25) * Math.min(1, (Math.abs(v) - 0.45) / 0.3) : 0;
    const x = u * 0.42 - Math.pow(Math.abs(v), 2) * 0.22 + lobe;
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
