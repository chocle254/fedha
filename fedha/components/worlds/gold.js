// Gold: walking the aisle of a vault with no end. Pyramids of gold bars stand on both sides between tall
// columns, row after row into a warm glow far ahead; a lamp sweeps so the stacks flash as you pass, coins rain
// down turning as they fall, and gold dust hangs in the air.
export default function gold(k) {
  const { THREE, scene, camera, R, range } = k;
  const BAY = 13; const BAYS = 8; const L = BAY * BAYS; const FRONT = 20;
  k.backdrop('#5a3d05', '#1a1002', '#050300');
  scene.fog = new THREE.FogExp2(new THREE.Color('#1f1303'), 0.017);
  k.env([
    { c: '#fff1c2', i: 8, p: [0, 11, 2], s: [9, 4] }, { c: '#ffb300', i: 4, p: [-10, 2, 4], s: [4, 10] },
    { c: '#ff8a00', i: 3, p: [10, 0, 2], s: [4, 10] }, { c: '#ffffff', i: 9, p: [4, 6, 9], s: [1.5, 1.5] }, { c: '#ffd27a', i: 5, p: [0, 1, -11], s: [6, 8] }, { c: '#3d2a05', i: 2, p: [0, -11, 0], s: [14, 14] },
  ], '#120b01');
  scene.add(new THREE.AmbientLight('#ffcf70', 0.5));
  const sweep = new THREE.DirectionalLight('#fff0c0', 2.4); scene.add(sweep);
  const lamp = new THREE.PointLight('#ffb300', 140, 60, 2); lamp.position.set(0, 8, -6); scene.add(lamp);

  const FLOOR = -8;
  const floor = new THREE.Mesh(k.keep(new THREE.PlaneGeometry(400, 500)), k.mat('#1a1204', { metal: 0.9, rough: 0.3, env: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, FLOOR, -150); scene.add(floor);
  // The light at the end of the aisle.
  const end = k.card(110, 110, { color: '#ffb300', opacity: 0.5, tex: k.glow() }); end.position.set(0, 2, -230);
  const endCore = k.card(30, 44, { color: '#fff3cf', opacity: 0.6, tex: k.glow() }); endCore.position.set(0, 0, -228);

  // A gold bar: a box narrower at the top.
  const bar = new THREE.BoxGeometry(2.2, 0.68, 1);
  const bp = bar.attributes.position;
  for (let i = 0; i < bp.count; i++) if (bp.getY(i) > 0) bp.setXYZ(i, bp.getX(i) * 0.86, bp.getY(i), bp.getZ(i) * 0.72);
  bar.computeVertexNormals();
  const N = 700;
  const bars = k.many(bar, k.mat('#ffc94d', { metal: 1, rough: 0.2, env: 1.4 }), N);
  let n = 0;
  // A pyramid: `rows` bars at the bottom, one fewer on each layer, `deep` bars back.
  const pile = (cx, cz, rows, deep, yaw) => {
    const cs = Math.cos(yaw); const sn = Math.sin(yaw);
    for (let l = 0; l < rows; l++) for (let i = 0; i < rows - l; i++) for (let d = 0; d < deep && n < N; d++, n++) {
      const lx = (i - (rows - l - 1) / 2) * 2.32 + range(-0.03, 0.03); const lz = (d - (deep - 1) / 2) * 1.1;
      k.put(bars, n, cx + lx * cs + lz * sn, FLOOR + 0.34 + l * 0.7, cz - lx * sn + lz * cs, 0, yaw + range(-0.02, 0.02), 0);
    }
  };
  const pillars = k.many(new THREE.CylinderGeometry(0.75, 0.9, 30, 12), k.mat('#8a6a1e', { metal: 1, rough: 0.38, env: 0.9 }), BAYS * 2);
  const caps = k.many(new THREE.BoxGeometry(2.4, 0.7, 2.4), k.mat('#ffc94d', { metal: 1, rough: 0.22, env: 1.3 }), BAYS * 4);
  for (let b = 0; b < BAYS; b++) {
    const z = FRONT - b * BAY - 4;
    pile(-7.2, z, b % 2 ? 5 : 4, 3, 0.5 + range(-0.1, 0.1));
    pile(7.2, z - BAY / 2, b % 2 ? 4 : 5, 3, -0.5 + range(-0.1, 0.1));
    [-13, 13].forEach((x, s) => {
      const zz = z - 3 - s * (BAY / 2);
      k.put(pillars, b * 2 + s, x, FLOOR + 15, zz);
      k.put(caps, b * 4 + s * 2, x, FLOOR + 0.35, zz); k.put(caps, b * 4 + s * 2 + 1, x, FLOOR + 22, zz);
    });
  }
  bars.count = n;
  const travel = k.fly([bars, pillars, caps], L);

  const C = 110;
  const coins = k.many(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 20), k.mat('#ffd15c', { metal: 1, rough: 0.16, env: 1.6 }), C);
  const cd = Array.from({ length: C }, () => ({ x: range(-9, 9), z: range(FRONT - 90, FRONT), off: R() * 30, sp: range(1.1, 2.2), spin: range(1.2, 3.5), ph: R() * 6.28, s: range(0.7, 1.2) }));
  const dust = k.points(190, { color: '#ffd666', size: 0.2, box: [24, 22, 80], center: [0, 1, -30], opacity: 0.8 });

  return (t, dt) => {
    const dist = t * 1.25;
    travel(dist);
    sweep.position.set(Math.sin(t * 0.25) * 12, 9, 6 + Math.cos(t * 0.25) * 8);
    lamp.intensity = 110 + Math.sin(t * 0.8) * 30;
    for (let i = 0; i < C; i++) {
      const d = cd[i];
      const y = 15 - ((t * d.sp + d.off) % 30);
      k.put(coins, i, d.x + Math.sin(t * 0.3 + d.ph) * 0.3, y, k.wrapZ(d.z, dist, 90, FRONT), t * d.spin + d.ph, t * 0.4 + d.ph, d.ph, d.s);
    }
    coins.instanceMatrix.needsUpdate = true;
    k.drift(dust, dt, t, 0.3);
    end.material.opacity = 0.42 + 0.1 * Math.sin(t * 0.5);
    camera.position.set(Math.sin(t * 0.07) * 1.8, -2.2 + Math.sin(t * 0.9) * 0.08 + Math.sin(t * 0.05) * 0.5, 14);
    camera.lookAt(Math.sin(t * 0.05) * 1.5, -2.6, -40);
  };
}
