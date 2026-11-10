import { brilliant } from './diamond';

// Royal: the throne hall. A long nave of gold columns and vaults hung with purple banners, a carpet running
// down the middle to a dais far away where the crown rests on its cushion in a shaft of light, jewels circling
// it. You walk slowly up the hall towards it and back, with gold glitter falling the whole length.
export default function royal(k) {
  const { THREE, scene, camera, R, range } = k;
  const FLOOR = -9; const END = -96; const BAY = 9; const BAYS = 12;
  k.backdrop('#3b1578', '#160830', '#070212');
  scene.fog = new THREE.FogExp2(new THREE.Color('#1a0a38'), 0.0085);
  k.env([
    { c: '#fff1c2', i: 9, p: [0, 11, 2], s: [8, 5] }, { c: '#fbbf24', i: 5, p: [-10, 2, 4], s: [3, 10] }, { c: '#c4b5fd', i: 4, p: [10, 1, 3], s: [3, 10] },
    { c: '#ffffff', i: 10, p: [4, 6, 9], s: [1.5, 1.5] }, { c: '#7c3aed', i: 2.5, p: [0, -11, 0], s: [14, 14] }, { c: '#fde68a', i: 6, p: [0, 3, -11], s: [5, 9] },
  ], '#0d0420');
  scene.add(new THREE.AmbientLight('#b79cff', 0.45));
  const key = new THREE.DirectionalLight('#fff3d1', 1.6); key.position.set(-3, 10, 7); scene.add(key);
  const throneLight = new THREE.PointLight('#ffe6a8', 400, 90, 2); throneLight.position.set(0, 12, END + 6); scene.add(throneLight);

  const gold = k.mat('#f6c14a', { metal: 1, rough: 0.2, env: 1.5 });
  const velvet = k.mat('#4c1d95', { metal: 0, rough: 0.92, env: 0.25, double: true });
  const G = (geo) => k.keep(geo);
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // ── The hall ──
  const marble = new THREE.Mesh(G(new THREE.PlaneGeometry(60, 260)), k.mat('#130a24', { metal: 0.85, rough: 0.16, env: 1 }));
  marble.rotation.x = -Math.PI / 2; marble.position.set(0, FLOOR, -80); scene.add(marble);
  const carpet = new THREE.Mesh(G(new THREE.PlaneGeometry(5.5, 130)), k.mat('#6d1d6b', { metal: 0, rough: 0.95, env: 0.2 }));
  carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, FLOOR + 0.03, -40); scene.add(carpet);
  [-2.95, 2.95].forEach((x) => { const s = new THREE.Mesh(G(new THREE.PlaneGeometry(0.3, 130)), gold); s.rotation.x = -Math.PI / 2; s.position.set(x, FLOOR + 0.04, -40); scene.add(s); });
  const cols = k.many(new THREE.CylinderGeometry(0.85, 1, 28, 14), k.mat('#e9c877', { metal: 1, rough: 0.3, env: 1.1 }), BAYS * 2);
  const bases = k.many(new THREE.BoxGeometry(2.8, 1, 2.8), gold, BAYS * 4);
  const vaults = k.many(new THREE.TorusGeometry(8.5, 0.32, 8, 30, Math.PI), gold, BAYS);
  const banners = k.many(new THREE.PlaneGeometry(2.6, 11), k.mat('#5b21b6', { metal: 0, rough: 0.85, env: 0.3, double: true, emissive: '#2e1065', glowing: 0.5 }), BAYS * 2);
  const crests = k.many(brilliant(THREE, 8), k.mat('#fbbf24', { metal: 1, rough: 0.1, flat: true, env: 1.8 }), BAYS * 2);
  const chGlow = []; const TOP = FLOOR + 28;
  for (let b = 0; b < BAYS; b++) {
    const z = 10 - b * BAY;
    [-8.5, 8.5].forEach((x, s) => {
      k.put(cols, b * 2 + s, x, FLOOR + 14, z);
      k.put(bases, b * 4 + s * 2, x, FLOOR + 0.5, z); k.put(bases, b * 4 + s * 2 + 1, x, TOP - 0.5, z);
      k.put(banners, b * 2 + s, x * 0.78, FLOOR + 17, z - BAY / 2, 0, s ? -0.5 : 0.5, 0);
      k.put(crests, b * 2 + s, x * 0.78, FLOOR + 24, z - BAY / 2, 0, 0, 0, 0.6);
    });
    k.put(vaults, b, 0, TOP - 1, z);
    if (b % 2 === 1) { const c = k.card(7, 7, { color: '#fde68a', opacity: 0.5, tex: k.glow() }); c.position.set(0, TOP - 7, z); chGlow.push(c); }
  }

  // ── The dais and the crown ──
  const dais = new THREE.Group(); dais.position.set(0, FLOOR, END); scene.add(dais);
  [[11, 0.5], [9, 1.5], [7, 2.5]].forEach(([r, y]) => add(dais, G(new THREE.CylinderGeometry(r, r + 0.4, 1, 40)), k.mat('#2a1450', { metal: 0.7, rough: 0.25, env: 1 }), 0, y, 0));
  add(dais, G(new THREE.TorusGeometry(7, 0.12, 8, 60)), gold, 0, 3.02, 0).rotation.x = Math.PI / 2;

  const JEWELS = [['#ff2d55', '#7a0020'], ['#2f6bff', '#06206e'], ['#19d06a', '#04532a'], ['#f5f5ff', '#5b5b8a'], ['#c13bff', '#42066e']]
    .map(([c, e]) => k.mat(c, { metal: 0.6, rough: 0.05, flat: true, emissive: e, glowing: 0.9, env: 2 }));
  const crown = new THREE.Group();
  const RAD = 2; const RIM = 0.45;
  add(crown, G(new THREE.CylinderGeometry(RAD, RAD, 0.9, 56, 1, true)), k.mat('#f6c14a', { metal: 1, rough: 0.2, env: 1.5, double: true }), 0, 0, 0);
  const rim = G(new THREE.TorusGeometry(RAD, 0.1, 10, 72));
  add(crown, rim, gold, 0, RIM, 0).rotation.x = Math.PI / 2;
  add(crown, rim, gold, 0, -RIM, 0).rotation.x = Math.PI / 2;
  const gem = G(new THREE.OctahedronGeometry(0.17, 0)); const pearl = G(new THREE.SphereGeometry(0.11, 12, 8));
  const spike = G(new THREE.ConeGeometry(0.3, 1.15, 4)); const low = G(new THREE.ConeGeometry(0.2, 0.6, 4)); const ball = G(new THREE.SphereGeometry(0.15, 14, 10));
  const pearlMat = k.mat('#fff8ec', { metal: 0.3, rough: 0.25, env: 1.2 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2; const x = Math.cos(a) * RAD; const z = Math.sin(a) * RAD;
    if (i % 2 === 0) {
      add(crown, spike, gold, x, RIM + 0.57, z).rotation.y = -a;
      add(crown, ball, gold, x, RIM + 1.2, z);
      add(crown, gem, JEWELS[(i / 2) % 3], Math.cos(a) * (RAD + 0.06), RIM + 0.5, Math.sin(a) * (RAD + 0.06)).scale.set(1, 1.5, 1);
      add(crown, gem, JEWELS[(i / 2 + 1) % 5], Math.cos(a) * (RAD + 0.1), 0, Math.sin(a) * (RAD + 0.1)).scale.set(1.5, 1.5, 1.5);
    } else {
      add(crown, low, gold, x, RIM + 0.3, z).rotation.y = -a;
      add(crown, pearl, pearlMat, x, RIM + 0.68, z);
      add(crown, pearl, pearlMat, Math.cos(a) * (RAD + 0.08), 0, Math.sin(a) * (RAD + 0.08));
    }
  }
  // Four arches (each a half hoop) meeting at the top, the cap under them, then the orb and cross.
  const arch = G(new THREE.TorusGeometry(RAD, 0.08, 8, 48, Math.PI));
  for (let i = 0; i < 4; i++) { const m = add(crown, arch, gold, 0, RIM, 0); m.rotation.y = (i / 4) * Math.PI; m.scale.set(1, 0.8, 1); }
  add(crown, G(new THREE.SphereGeometry(RAD * 0.96, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)), velvet, 0, RIM, 0).scale.set(1, 0.74, 1);
  const peak = RIM + RAD * 0.8;
  add(crown, G(new THREE.SphereGeometry(0.34, 20, 14)), gold, 0, peak + 0.25, 0);
  add(crown, G(new THREE.BoxGeometry(0.11, 0.62, 0.11)), gold, 0, peak + 0.85, 0);
  add(crown, G(new THREE.BoxGeometry(0.4, 0.11, 0.11)), gold, 0, peak + 0.92, 0);
  add(crown, gem, JEWELS[0], 0, peak + 0.25, 0.34).scale.set(1.3, 1.3, 1.3);
  const cushion = add(crown, G(new THREE.SphereGeometry(3.3, 32, 16)), velvet, 0, -1.25, 0); cushion.scale.set(1, 0.26, 1);
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i / 4) * Math.PI * 2; add(crown, G(new THREE.ConeGeometry(0.16, 0.7, 8)), gold, Math.cos(a) * 3.2, -1.6, Math.sin(a) * 3.2); }
  const CY = FLOOR + 9; const SCALE = 2.3;
  const stand = new THREE.Group(); stand.position.set(0, CY, END); stand.rotation.x = 0.22; stand.scale.setScalar(SCALE); stand.add(crown);
  scene.add(stand);

  // Loose jewels circling the crown, the light falling on it, and its glow.
  const J = 24;
  const ringGems = JEWELS.map((m) => k.many(brilliant(THREE, 8), m, J));
  const shafts = [-5, 0, 5].map((x, i) => { const s = k.card(7, 70, { color: '#fde68a', opacity: 0.06 }); s.position.set(x, CY + 26, END + 2 + i); s.rotation.z = -0.14 + i * 0.14; return s; });
  const halo = k.card(70, 70, { color: '#fbbf24', opacity: 0.22, tex: k.glow() }); halo.position.set(0, CY + 2, END - 8);
  const glitter = k.points(240, { color: '#fde047', size: 0.19, box: [18, 26, 120], center: [0, 2, -46], opacity: 0.9 });

  return (t, dt) => {
    crown.rotation.y = t * 0.16;
    stand.position.y = CY + Math.sin(t * 0.4) * 0.3;
    ringGems.forEach((mesh, g) => {
      for (let i = 0; i < J; i++) {
        const on = i % JEWELS.length === g;
        const a = (i / J) * Math.PI * 2 + t * 0.2;
        k.put(mesh, i, Math.cos(a) * 9.5, CY + 1.5 + Math.sin(a) * 2.6 + Math.sin(t * 0.8 + i) * 0.3, END + Math.sin(a) * 9.5, 0.4, t * 0.9 + i, 0, on ? 0.45 + (i % 3) * 0.1 : 0);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
    k.drift(glitter, dt, t, -0.45, 0.12);
    shafts.forEach((s, i) => { s.material.opacity = 0.045 + 0.03 * Math.sin(t * 0.3 + i * 2); });
    chGlow.forEach((c, i) => { c.material.opacity = 0.4 + 0.15 * Math.sin(t * 1.1 + i * 1.3); });
    halo.material.opacity = 0.17 + 0.07 * Math.sin(t * 0.5);
    throneLight.intensity = 340 + 90 * Math.sin(t * 0.5);
    // Walking up the hall and back, with the small rise and fall of a step.
    const walk = 0.5 - 0.5 * Math.cos(t * 0.055);
    camera.position.set(Math.sin(t * 0.07) * 0.9, -2 + Math.sin(t * 1.5) * 0.06 + walk * 1.5, 14 - walk * 62);
    camera.lookAt(Math.sin(t * 0.05) * 1.5, CY - 1 + walk * 2, END);
  };
}
