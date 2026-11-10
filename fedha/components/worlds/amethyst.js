// Amethyst: a flight through a geode cavern that never ends. Crystal clusters grow from the floor, the roof
// and the walls; they rise out of the violet haze far ahead, slide past and are gone. Pools of light glow inside
// the biggest clusters, loose shards hang turning in the air, and motes drift up through it all.
export default function amethyst(k) {
  const { THREE, scene, camera, R, range, pick } = k;
  const L = 120; const FRONT = 20;
  k.backdrop('#3b1a6e', '#14072e', '#04010a');
  scene.fog = new THREE.FogExp2(new THREE.Color('#14072e'), 0.021);
  k.env([
    { c: '#c9a6ff', i: 5, p: [0, 11, 4], s: [10, 6] }, { c: '#7c3aed', i: 3.5, p: [-10, 2, 3], s: [5, 10] },
    { c: '#ff7ad9', i: 3, p: [10, -2, 2], s: [4, 8] }, { c: '#ffffff', i: 7, p: [3, 6, 10], s: [2, 2] }, { c: '#4c1d95', i: 2, p: [0, -11, 0], s: [12, 12] },
  ], '#0d0420');
  scene.add(new THREE.AmbientLight('#7a4be0', 0.7));
  const lamp = new THREE.PointLight('#c4a0ff', 90, 46, 2); lamp.position.set(0, 0, 2); scene.add(lamp);

  // One crystal: a six-sided column with a point.
  const V = (x, y) => new THREE.Vector2(x, y);
  const N = 230;
  const rock = k.many(new THREE.LatheGeometry([V(0.001, 0), V(0.5, 0.12), V(0.5, 2.3), V(0.001, 3.2)], 6), k.mat('#ffffff', { metal: 0.85, rough: 0.14, flat: true, emissive: '#3b0f8c', glowing: 0.45, env: 1.3 }), N);
  const tones = ['#7c3aed', '#a78bfa', '#5b21b6', '#c4b5fd', '#9333ea', '#e879f9', '#f5f3ff', '#6d28d9'].map((c) => new THREE.Color(c));
  let n = 0;
  const glows = new THREE.Group(); scene.add(glows);
  const halo = k.keep(new THREE.PlaneGeometry(1, 1));
  const haloMat = (c) => k.keep(new THREE.MeshBasicMaterial({ color: c, map: k.glow(), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
  const hm = [haloMat('#8b5cf6'), haloMat('#e879f9')];
  // A cluster: crystals fanning out from one spot, the tallest in the middle, with a glow at its heart.
  const cluster = (x, y, z, baseRx, baseRz, count, size) => {
    for (let i = 0; i < count && n < N; i++, n++) {
      const lean = i === 0 ? 0.08 : 0.7;
      const s = size * (i === 0 ? 1.6 : range(0.45, 1.05));
      k.put(rock, n, x + range(-1, 1) * size * 0.7, y, z + range(-1, 1) * size * 0.7, baseRx + range(-lean, lean), R() * 6.28, baseRz + range(-lean, lean), s * range(0.55, 1), s * range(0.8, 1.7), s * range(0.55, 1));
      k.tint(rock, n, pick(tones));
    }
    if (R() < 0.55) { const g = new THREE.Mesh(halo, hm[Math.floor(R() * 2)]); g.position.set(x * 0.9, y * 0.72, z); g.scale.setScalar(size * 7); glows.add(g); }
  };
  for (let z = FRONT; z > FRONT - L; z -= 5) {
    cluster(range(-8, 8), -9.5, z + range(-2, 2), 0, 0, 7, range(1.0, 2.0));                  // floor
    cluster(range(-8, 8), 10.5, z + range(-2, 2), Math.PI, 0, 6, range(0.9, 1.8));            // roof
    if (z % 2) cluster(-9.5, range(-6, 6), z, 0, -Math.PI / 2, 3, range(0.9, 1.6)); else cluster(9.5, range(-6, 6), z, 0, Math.PI / 2, 3, range(0.9, 1.6)); // walls
  }
  rock.count = n;
  rock.instanceColor.needsUpdate = true;
  const travel = k.fly([rock, glows], L);

  // Shards hanging in the air: each keeps its own place in the tunnel and comes round again.
  const S = 22;
  const shards = k.many(new THREE.OctahedronGeometry(0.42, 0), k.mat('#e9d5ff', { metal: 0.9, rough: 0.08, flat: true, emissive: '#6d28d9', glowing: 0.55, env: 1.6 }), S);
  const sd = Array.from({ length: S }, () => ({ x: range(-5.5, 5.5), y: range(-6, 6), z: range(FRONT - L, FRONT), s: range(0.5, 1.6), sp: range(0.15, 0.5), ph: R() * 6.28 }));
  const motes = k.points(200, { color: '#d8b4fe', size: 0.26, box: [20, 22, 70], center: [0, 0, -24], opacity: 0.85 });
  const far = k.card(70, 70, { color: '#7c3aed', opacity: 0.22, tex: k.glow() }); far.position.set(0, 0, -130);

  return (t, dt) => {
    const dist = t * 1.5;
    travel(dist);
    hm[0].opacity = 0.2 + 0.14 * Math.sin(t * 0.6); hm[1].opacity = 0.2 + 0.14 * Math.sin(t * 0.5 + 2);
    lamp.intensity = 70 + 40 * Math.sin(t * 0.4);
    for (let i = 0; i < S; i++) { const d = sd[i]; k.put(shards, i, d.x + Math.sin(t * 0.2 + d.ph) * 0.4, d.y + Math.sin(t * d.sp + d.ph) * 0.7, k.wrapZ(d.z, dist, L, FRONT), t * d.sp + d.ph, t * d.sp * 1.3, d.ph, d.s * 0.7, d.s * 1.5, d.s * 0.7); }
    shards.instanceMatrix.needsUpdate = true;
    k.drift(motes, dt, t, 0.35);
    camera.position.set(Math.sin(t * 0.07) * 1.8, Math.sin(t * 0.05) * 1.3, 14);
    camera.lookAt(Math.sin(t * 0.045) * 3, Math.sin(t * 0.06) * 1.2, -30);
    camera.rotation.z += Math.sin(t * 0.05) * 0.03;
  };
}
