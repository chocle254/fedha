// Rose Gold: gliding low over a sea of rose-gold silk that runs to a dusk horizon, through a line of great
// polished rings standing in the silk like gates, one after another into the distance, while petals fall.
export default function rosegold(k) {
  const { THREE, scene, camera, R, range, pick } = k;
  const GAP = 17; const GATES = 8; const L = GAP * GATES; const FRONT = 20;
  k.backdrop('#8a4353', '#2a0f18', '#0c0406');
  scene.fog = new THREE.FogExp2(new THREE.Color('#3a1622'), 0.0125);
  k.env([
    { c: '#ffd6c9', i: 6, p: [0, 11, 3], s: [12, 5] }, { c: '#ff9db0', i: 4, p: [-10, 3, 4], s: [4, 10] },
    { c: '#ffc48a', i: 5, p: [0, 2, -11], s: [10, 4] }, { c: '#ffffff', i: 8, p: [-3, 7, 9], s: [1.5, 3] }, { c: '#5a1f2c', i: 1.5, p: [0, -11, 0], s: [14, 14] },
  ], '#1a070c');
  scene.add(new THREE.AmbientLight('#ffb7a8', 0.5));
  const sun = new THREE.DirectionalLight('#ffd9c2', 1.7); sun.position.set(-3, 5, -10); scene.add(sun);

  // The low sun on the horizon the gates lead to.
  const disc = k.card(120, 120, { color: '#ffb199', opacity: 0.55, tex: k.glow() }); disc.position.set(0, 4, -260);
  const core = k.card(34, 34, { color: '#fff0e0', opacity: 0.8, tex: k.glow() }); core.position.set(0, 2, -258);

  // The silk: a sheet whose folds move. Heights and shading are worked out here each frame.
  const W = 30; const H = 84;
  const geo = k.keep(new THREE.PlaneGeometry(80, 190, W, H));
  geo.rotateX(-Math.PI / 2);
  const silk = new THREE.Mesh(geo, k.mat('#c98591', { metal: 1, rough: 0.3, double: true, env: 1.25 }));
  silk.position.set(0, -7.5, -78); silk.frustumCulled = false;
  scene.add(silk);
  const pos = geo.attributes.position; const nor = geo.attributes.normal;
  const bx = new Float32Array(pos.count); const bz = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) { bx[i] = pos.getX(i); bz[i] = pos.getZ(i); }

  // The gates: rings you pass through, each leaning and swinging a little on its own.
  const gold = k.mat('#e8a598', { metal: 1, rough: 0.12, env: 1.5 });
  const ringGeo = k.keep(new THREE.TorusGeometry(7.2, 0.2, 14, 90));
  const inner = k.keep(new THREE.TorusGeometry(6.5, 0.06, 8, 90));
  const gates = Array.from({ length: GATES }, (_, i) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(ringGeo, gold)); g.add(new THREE.Mesh(inner, gold));
    scene.add(g);
    return { g, z: FRONT - i * GAP, ph: i * 1.3, lean: (i % 2 ? 1 : -1) * 0.12 };
  });

  // Petals: a cupped, tapered leaf shape.
  const pg = new THREE.PlaneGeometry(1, 1.3, 4, 6);
  const pp = pg.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const v = (pp.getY(i) + 0.65) / 1.3;
    const x = pp.getX(i) * (0.3 + 0.7 * Math.sin(Math.PI * (0.12 + 0.8 * v)));
    pp.setXYZ(i, x, pp.getY(i), x * x * 0.9 + (v - 0.4) * (v - 0.4) * 0.5);
  }
  pg.computeVertexNormals();
  const P = 90;
  const petals = k.many(pg, k.mat('#ffffff', { metal: 0.05, rough: 0.55, double: true, emissive: '#6b1535', glowing: 0.3, env: 0.7 }), P);
  const pinks = ['#fbcfe8', '#f9a8d4', '#f472b6', '#fda4af', '#ffe4e6', '#e8a0a8'].map((c) => new THREE.Color(c));
  const pd = Array.from({ length: P }, (_, i) => { k.tint(petals, i, pick(pinks)); return { x: range(-10, 10), z: range(FRONT - 90, FRONT), off: R() * 26, sp: range(0.5, 1.1), s: range(0.35, 0.85), a: range(0.3, 0.8), ph: R() * 6.28 }; });
  petals.instanceColor.needsUpdate = true;
  const bokeh = k.points(90, { color: '#ffc9b8', size: 0.6, box: [26, 20, 80], center: [0, 2, -36], opacity: 0.35 });

  return (t, dt) => {
    const dist = t * 2.1;
    for (let i = 0; i < pos.count; i++) {
      const x = bx[i]; const z = bz[i] - dist; // the folds slide towards you as you glide over them
      const a = x * 0.32 + t * 0.4; const b = z * 0.2; const c = (x + z) * 0.17 + t * 0.2;
      pos.setY(i, Math.sin(a) * 0.9 + Math.sin(b) * 1.15 + Math.sin(c) * 0.7);
      const dx = Math.cos(a) * 0.288 + Math.cos(c) * 0.119; const dz = Math.cos(b) * 0.23 + Math.cos(c) * 0.119;
      const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
      nor.setXYZ(i, -dx * inv, inv, -dz * inv);
    }
    pos.needsUpdate = true; nor.needsUpdate = true;
    for (const q of gates) {
      q.g.position.set(0, -1.6, k.wrapZ(q.z, dist, L, FRONT));
      q.g.rotation.set(Math.sin(t * 0.3 + q.ph) * 0.06, Math.sin(t * 0.22 + q.ph) * 0.28, q.lean + t * 0.05);
    }
    for (let i = 0; i < P; i++) {
      const d = pd[i];
      const y = 13 - ((t * d.sp + d.off) % 26);
      k.put(petals, i, d.x + Math.sin(t * d.a + d.ph) * 1.4, y, k.wrapZ(d.z, dist, 90, FRONT), t * d.sp * 0.9 + d.ph, t * d.a + d.ph, Math.sin(t * d.a + d.ph) * 0.9, d.s);
    }
    petals.instanceMatrix.needsUpdate = true;
    k.drift(bokeh, dt, t, 0.12, 0.05);
    camera.position.set(Math.sin(t * 0.06) * 1.6, -0.6 + Math.sin(t * 0.045) * 0.9, 14);
    camera.lookAt(Math.sin(t * 0.04) * 1.2, -0.8, -40);
  };
}
