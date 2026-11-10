// Rose Gold: dawn under the cherry blossom. A real photograph (the Tidal Basin in Washington at sunrise, the
// branches in full bloom over still water) is the place; petals come down through the air at every distance
// between you and it, the sun breathes on the horizon, and you drift slowly in under the branches.
// Photo: public/worlds/rosegold.jpg (Unsplash, free licence).
export default function rosegold(k) {
  const { THREE, scene, camera, R, range, pick } = k;
  k.backdrop('#c98591', '#5a2a36', '#1a0a0f');
  k.env([
    { c: '#ffd6c9', i: 6, p: [0, 11, 3], s: [12, 5] }, { c: '#ff9db0', i: 4, p: [-10, 3, 4], s: [4, 10] },
    { c: '#ffc48a', i: 6, p: [0, 0, -11], s: [10, 6] }, { c: '#ffffff', i: 8, p: [-3, 7, 9], s: [1.5, 3] }, { c: '#5a1f2c', i: 1.5, p: [0, -11, 0], s: [14, 14] },
  ], '#1a070c');
  scene.add(new THREE.AmbientLight('#ffc9bd', 0.9));
  const sun = new THREE.DirectionalLight('#ffd9c2', 1.6); sun.position.set(2, 3, -10); scene.add(sun);

  // Tinted down so the app's white text reads over a bright sky.
  const place = k.photo('/worlds/rosegold.jpg', { aspect: 1500 / 1900, z: -120, y: 2, height: 200, tint: '#b88a92' });
  const shade = k.card(400, 170, { color: '#1a070c', opacity: 0.6, tex: k.glow(), add: false }); shade.position.set(0, -84, -100);
  // The sun's glow, sitting on the sun in the photograph.
  const glow = k.card(90, 90, { color: '#ffd2b0', opacity: 0.35, tex: k.glow() }); glow.position.set(15, -9, -112);

  // Petals: a cupped, tapered leaf shape, in three bands of distance.
  const pg = new THREE.PlaneGeometry(1, 1.3, 4, 6);
  const pp = pg.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const v = (pp.getY(i) + 0.65) / 1.3;
    const x = pp.getX(i) * (0.3 + 0.7 * Math.sin(Math.PI * (0.12 + 0.8 * v)));
    pp.setXYZ(i, x, pp.getY(i), x * x * 0.9 + (v - 0.4) * (v - 0.4) * 0.5);
  }
  pg.computeVertexNormals();
  const P = 150;
  const petals = k.many(pg, k.mat('#ffffff', { metal: 0.02, rough: 0.6, double: true, emissive: '#7a2440', glowing: 0.35, env: 0.8, fog: false }), P);
  const pinks = ['#fbcfe8', '#f9a8d4', '#fda4af', '#ffe4e6', '#fff1f2', '#f4b6c2'].map((c) => new THREE.Color(c));
  const pd = Array.from({ length: P }, (_, i) => {
    k.tint(petals, i, pick(pinks));
    const z = i < 40 ? range(4, -8) : i < 100 ? range(-10, -40) : range(-42, -95);
    const wide = 5 + (14 - z) * 0.3;
    return { x: range(-1, 1) * wide, z, tall: 14 + (14 - z) * 0.55, off: R() * 100, sp: range(0.5, 1.1), s: range(0.35, 0.8) * (z < -40 ? 2.2 : z < -10 ? 1.3 : 1), a: range(0.3, 0.8), ph: R() * 6.28 };
  });
  petals.instanceColor.needsUpdate = true;
  const motes = k.points(110, { color: '#ffe0d2', size: 0.5, box: [40, 34, 80], center: [0, 2, -36], opacity: 0.4 });

  return (t, dt) => {
    place.userData.tick(dt);
    glow.material.opacity = 0.28 + 0.1 * Math.sin(t * 0.4);
    for (let i = 0; i < P; i++) {
      const d = pd[i];
      const y = d.tall / 2 - ((t * d.sp * (1 + d.tall / 40) + d.off) % d.tall);
      k.put(petals, i, d.x + Math.sin(t * d.a + d.ph) * (1.2 + d.s), y, d.z + Math.cos(t * d.a * 0.7 + d.ph) * 0.8, t * d.sp * 0.9 + d.ph, t * d.a + d.ph, Math.sin(t * d.a + d.ph) * 0.9, d.s);
    }
    petals.instanceMatrix.needsUpdate = true;
    k.drift(motes, dt, t, 0.15, 0.08);
    // Drifting in under the branches and back.
    const go = 0.5 - 0.5 * Math.cos(t * 0.045);
    camera.position.set(Math.sin(t * 0.055) * 3, Math.sin(t * 0.04) * 1.5, 14 - go * 30);
    camera.lookAt(Math.sin(t * 0.035) * 4, 1 + Math.sin(t * 0.03) * 2, -120);
  };
}
