// Platinum: drifting through a chrome solar system. Polished spheres slide past on every side, orreries (rings
// turning inside rings around a bead of liquid metal) come up out of the dark and go by, and far ahead hangs a
// great ringed planet of mirror metal that never gets any closer.
export default function platinum(k) {
  const { THREE, scene, camera, R, range } = k;
  const L = 130; const FRONT = 20;
  k.backdrop('#6b7686', '#151a22', '#04050a');
  scene.fog = new THREE.FogExp2(new THREE.Color('#12161d'), 0.014);
  // Long thin lights: they are what draws the bright streaks along chrome.
  k.env([
    { c: '#ffffff', i: 9, p: [0, 11, 2], s: [14, 1.2] }, { c: '#dbeafe', i: 6, p: [-10, 0, 3], s: [1.2, 16] }, { c: '#ffffff', i: 6, p: [10, 2, 1], s: [1, 14] },
    { c: '#9fb4d0', i: 3, p: [0, -11, 2], s: [12, 3] }, { c: '#ffffff', i: 10, p: [-4, 6, 9], s: [3, 0.6] }, { c: '#7dd3fc', i: 3, p: [6, -6, 8], s: [2, 2] }, { c: '#ffffff', i: 5, p: [0, 3, -11], s: [8, 1] },
  ], '#0a0d13');
  scene.add(new THREE.AmbientLight('#cfd8e6', 0.4));
  const key = new THREE.DirectionalLight('#ffffff', 1.4); key.position.set(-5, 8, 8); scene.add(key);

  const chrome = k.mat('#e8ecf2', { metal: 1, rough: 0.07, env: 1.5 });
  // The planet on the horizon: too far for the haze to hide, so it is always there to head for.
  const farChrome = k.mat('#cfd6e2', { metal: 1, rough: 0.16, env: 1.2, fog: false });
  const planet = new THREE.Group(); planet.position.set(26, 34, -330); planet.rotation.set(0.5, 0, 0.35);
  planet.add(new THREE.Mesh(k.keep(new THREE.SphereGeometry(40, 40, 28)), farChrome));
  [58, 68, 76].forEach((r, i) => { const m = new THREE.Mesh(k.keep(new THREE.TorusGeometry(r, 1.2 + i * 0.6, 4, 120)), farChrome); m.rotation.x = Math.PI / 2; m.scale.set(1, 1, 0.08); planet.add(m); });
  scene.add(planet);
  const haze = k.card(260, 260, { color: '#9fb4d0', opacity: 0.2, tex: k.glow() }); haze.position.set(26, 34, -340);

  // The field of spheres you travel through (kept clear of the middle, where you fly).
  const S = 90;
  const orbs = k.many(new THREE.SphereGeometry(1, 20, 14), chrome, S);
  for (let i = 0; i < S; i++) {
    const a = R() * 6.28; const d = range(4.5, 17);
    k.put(orbs, i, Math.cos(a) * d * 0.8, Math.sin(a) * d, range(FRONT - L, FRONT), 0, 0, 0, range(0.25, 1.9));
  }
  const travel = k.fly([orbs], L);

  // Orreries, each at its own point along the way.
  const ringGeos = [1.5, 2.15, 2.8, 3.45].map((r, i) => k.keep(new THREE.TorusGeometry(r, 0.045 + i * 0.01, 12, 90)));
  const beadGeo = k.keep(new THREE.SphereGeometry(0.17, 16, 12)); const coreGeo = k.keep(new THREE.IcosahedronGeometry(0.85, 3));
  const orreries = [[-4.5, 3, 0], [4.8, -3.5, -44], [-3.8, -5, -88], [3.6, 5.5, -22], [0, 0.5, -66]].map(([x, y, z], n) => {
    const g = new THREE.Group(); const size = n === 4 ? 1.5 : range(0.8, 1.2); g.scale.setScalar(size);
    const rings = ringGeos.map((geo, i) => {
      const r = new THREE.Group(); r.add(new THREE.Mesh(geo, chrome));
      const bead = new THREE.Mesh(beadGeo, chrome); bead.position.set([1.5, 2.15, 2.8, 3.45][i], 0, 0); r.add(bead);
      g.add(r);
      return { r, a: R() * 6.28, b: R() * 6.28, sa: (0.14 + i * 0.04) * (i % 2 ? -1 : 1), sb: 0.22 - i * 0.03 };
    });
    const core = new THREE.Mesh(coreGeo, chrome); g.add(core);
    scene.add(g);
    return { g, rings, core, x, y, z: FRONT - 20 + z, ph: n * 1.9 };
  });

  const beams = [0, 1, 2].map((i) => { const b = k.card(1.8, 90, { color: '#dbeafe', opacity: 0.05 }); b.position.set(0, 0, -34 - i * 12); b.rotation.z = 0.35; return b; });
  const glints = k.points(140, { color: '#ffffff', size: 0.18, box: [28, 28, 90], center: [0, 0, -34], opacity: 0.7 });

  return (t, dt) => {
    const dist = t * 1.6;
    travel(dist);
    for (const o of orreries) {
      o.g.position.set(o.x + Math.sin(t * 0.1 + o.ph) * 0.5, o.y + Math.cos(t * 0.13 + o.ph) * 0.5, k.wrapZ(o.z, dist, L, FRONT));
      for (const r of o.rings) r.r.rotation.set(r.a + t * r.sa, r.b + t * r.sb, t * r.sa * 0.5);
      o.core.scale.set(1 + Math.sin(t * 1.1 + o.ph) * 0.07, 1 + Math.sin(t * 1.3 + 1 + o.ph) * 0.07, 1 + Math.sin(t * 0.9 + 2) * 0.07);
    }
    planet.rotation.y = t * 0.01;
    beams.forEach((b, i) => { b.position.x = ((t * (1.1 + i * 0.4) + i * 11) % 50) - 25; });
    k.drift(glints, dt, t, 0.1, 0.08);
    camera.position.set(Math.sin(t * 0.06) * 1.5, Math.sin(t * 0.05) * 1.1, 14);
    camera.lookAt(Math.sin(t * 0.04) * 2.5, 1.5 + Math.sin(t * 0.03) * 1.5, -40);
    camera.rotation.z += Math.sin(t * 0.04) * 0.04;
  };
}
