// Diamond: flying low across a frozen plain of mirror ice, between spires of clear crystal that rise out of a
// blue haze, under a slow aurora, towards a diamond the size of a mountain turning on the horizon and throwing
// flashes of colour. Small diamonds fall like snow the whole way.
export function brilliant(THREE, sides = 10) {
  const V = (x, y) => new THREE.Vector2(x, y);
  // Up the side of a cut diamond: the point at the bottom, the wide girdle, the crown, the flat table on top.
  return new THREE.LatheGeometry([V(0.0001, -1.05), V(1, 0.1), V(1, 0.18), V(0.6, 0.5), V(0.0001, 0.5)], sides);
}

export default function diamond(k) {
  const { THREE, scene, camera, R, range } = k;
  const L = 120; const FRONT = 20; const ICE = -9;
  k.backdrop('#0e6f8a', '#06203a', '#01060c');
  scene.fog = new THREE.FogExp2(new THREE.Color('#072742'), 0.0135);
  // White strips for the sparkle, small strong colours for the rainbow flashes in the facets.
  k.env([
    { c: '#ffffff', i: 12, p: [0, 11, 2], s: [10, 1.5] }, { c: '#ffffff', i: 9, p: [-10, 3, 3], s: [1, 12] }, { c: '#bfe9ff', i: 6, p: [10, -1, 2], s: [2, 10] },
    { c: '#ff3b5c', i: 7, p: [-7, -6, 7], s: [2, 2] }, { c: '#36ff7a', i: 6, p: [7, 6, 7], s: [2, 2] }, { c: '#3b6bff', i: 8, p: [5, -8, 6], s: [2.5, 2] },
    { c: '#ffd23b', i: 6, p: [-6, 8, 6], s: [2, 1.5] }, { c: '#c23bff', i: 6, p: [0, 3, 11], s: [1.5, 1.5] }, { c: '#7dd3fc', i: 4, p: [0, 4, -11], s: [12, 6] },
  ], '#020a14');
  scene.add(new THREE.AmbientLight('#bfe9ff', 0.4));
  const key = new THREE.DirectionalLight('#ffffff', 1.8); key.position.set(4, 9, 8); scene.add(key);

  const ice = k.mat('#e6f8ff', { metal: 1, rough: 0.02, flat: true, env: 2.2 });
  const plain = new THREE.Mesh(k.keep(new THREE.PlaneGeometry(600, 700)), k.mat('#0b3a5c', { metal: 1, rough: 0.09, env: 1.1 }));
  plain.rotation.x = -Math.PI / 2; plain.position.set(0, ICE, -220); scene.add(plain);

  // The mountain-sized diamond on the horizon.
  const far = k.mat('#e6f8ff', { metal: 1, rough: 0.03, flat: true, env: 2.4, fog: false });
  const hero = new THREE.Mesh(k.keep(brilliant(THREE, 14)), far);
  const stand = new THREE.Group(); stand.position.set(0, 34, -300); stand.rotation.set(0.38, 0, 0.12); stand.add(hero); hero.scale.setScalar(46);
  scene.add(stand);
  const aura = k.card(300, 300, { color: '#7dd3fc', opacity: 0.3, tex: k.glow() }); aura.position.set(0, 34, -320);
  const tex = k.star();
  const flashes = [0, 1, 2].map((i) => {
    const p = k.points(8, { color: ['#ffffff', '#bfe9ff', '#fff2c4'][i], size: 30, box: [84, 60, 6], center: [0, 40, -252], opacity: 0, tex });
    return { p, ph: i * 2.1, sp: 1.1 + i * 0.37 };
  });
  // Aurora: three wide veils of colour high up.
  const veils = [['#34d399', -40, 0.5], ['#818cf8', 30, -0.4], ['#22d3ee', 0, 0.1]].map(([c, x, rz], i) => { const v = k.card(60, 240, { color: c, opacity: 0.09, tex: k.glow() }); v.position.set(x, 100, -330 - i * 10); v.rotation.z = Math.PI / 2 + rz; return v; });

  // Spires of crystal on the ice, in clusters on both sides of your path.
  const V = (x, y) => new THREE.Vector2(x, y);
  const N = 200;
  const spires = k.many(new THREE.LatheGeometry([V(0.5, 0), V(0.5, 2.3), V(0.001, 3.2)], 6), ice, N);
  let n = 0;
  for (let z = FRONT; z > FRONT - L; z -= 6) {
    for (const side of [-1, 1]) {
      const cx = side * range(5, 15); const cz = z + range(-2.5, 2.5); const size = range(0.9, 2.6);
      for (let i = 0; i < 4 && n < N; i++, n++) {
        const s = size * (i === 0 ? 1.6 : range(0.4, 1));
        k.put(spires, n, cx + range(-1, 1) * size, ICE - 0.2, cz + range(-1, 1) * size, range(-0.25, 0.25) * (i ? 1.6 : 0.4), R() * 6.28, range(-0.25, 0.25) * (i ? 1.6 : 0.4), s * 0.7, s * range(1, 2.2), s * 0.7);
      }
    }
  }
  spires.count = n;
  const travel = k.fly([spires], L);

  // Diamonds falling like snow.
  const D = 70;
  const small = k.many(brilliant(THREE, 8), ice, D);
  const sd = Array.from({ length: D }, () => ({ x: range(-11, 11), z: range(FRONT - 90, FRONT), off: R() * 30, sp: range(0.3, 0.8), s: range(0.2, 0.7), a: range(0.3, 1.1), ph: R() * 6.28 }));
  const twinkle = k.points(140, { color: '#e0f2fe', size: 0.6, box: [34, 26, 100], center: [0, 2, -40], opacity: 0.6, tex });
  const frost = k.points(150, { color: '#bae6fd', size: 0.16, box: [24, 24, 80], center: [0, 0, -30], opacity: 0.8 });

  return (t, dt) => {
    const dist = t * 1.9;
    travel(dist);
    hero.rotation.y = t * 0.12;
    stand.position.y = 34 + Math.sin(t * 0.3) * 2;
    for (const f of flashes) f.p.mat.opacity = Math.pow(Math.max(0, Math.sin(t * f.sp + f.ph)), 6) * 0.95;
    veils.forEach((v, i) => { v.material.opacity = 0.06 + 0.05 * Math.sin(t * 0.25 + i * 2); v.position.x += Math.sin(t * 0.1 + i) * dt * 2; });
    for (let i = 0; i < D; i++) {
      const d = sd[i];
      const y = 15 - ((t * d.sp + d.off) % 30);
      k.put(small, i, d.x + Math.sin(t * 0.2 + d.ph) * 0.6, y, k.wrapZ(d.z, dist, 90, FRONT), 0.4 + Math.sin(t * d.a + d.ph) * 0.5, t * d.a + d.ph, 0.2, d.s);
    }
    small.instanceMatrix.needsUpdate = true;
    twinkle.mat.opacity = 0.35 + 0.3 * Math.sin(t * 0.9);
    k.drift(frost, dt, t, -0.25, 0.1);
    aura.material.opacity = 0.24 + 0.08 * Math.sin(t * 0.5);
    camera.position.set(Math.sin(t * 0.06) * 1.8, -1.5 + Math.sin(t * 0.045) * 1.2, 14);
    camera.lookAt(Math.sin(t * 0.04) * 2, 2.5 + Math.sin(t * 0.03) * 1.5, -60);
    camera.rotation.z += Math.sin(t * 0.04) * 0.03;
  };
}
