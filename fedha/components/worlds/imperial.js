// Imperial: the top of the ladder. A golden dragon flies through a red dusk above the mountains, chasing a
// glowing pearl. It comes from far away, small against a huge sun, sweeps right past the glass and winds off
// into the distance again. Hundreds of lanterns rise through the whole sky around it, with clouds and embers.
export default function imperial(k) {
  const { THREE, scene, camera, R, range } = k;
  k.backdrop('#8a1f1f', '#2a0606', '#050101');
  scene.fog = new THREE.FogExp2(new THREE.Color('#2e0808'), 0.0078);
  k.env([
    { c: '#fff1c2', i: 9, p: [0, 11, 2], s: [9, 4] }, { c: '#ff6a2b', i: 6, p: [-10, 1, 4], s: [4, 10] }, { c: '#ffb300', i: 5, p: [10, 3, 2], s: [3, 10] },
    { c: '#ff2d2d', i: 4, p: [0, -11, 2], s: [12, 6] }, { c: '#ffffff', i: 9, p: [-4, 6, 9], s: [1.5, 1.5] }, { c: '#ffd27a', i: 7, p: [0, 2, -11], s: [7, 7] },
  ], '#140303');
  scene.add(new THREE.AmbientLight('#ff9a6b', 0.45));
  const sunLight = new THREE.DirectionalLight('#ffd9a0', 1.8); sunLight.position.set(0, 4, -10); scene.add(sunLight);
  const fill = new THREE.DirectionalLight('#ffb37a', 0.9); fill.position.set(3, 6, 10); scene.add(fill);

  // The sun, and ranges of mountains in front of it.
  const sun = k.card(260, 260, { color: '#ffb347', opacity: 0.75, tex: k.glow() }); sun.position.set(0, 26, -380);
  const sunCore = k.card(90, 90, { color: '#fff3d6', opacity: 0.95, tex: k.glow() }); sunCore.position.set(0, 26, -378);
  const peaks = k.many(new THREE.ConeGeometry(1, 1, 5), k.mat('#3a0a0a', { metal: 0.1, rough: 0.9, flat: true, env: 0.3 }), 46);
  for (let i = 0; i < 46; i++) {
    const row = i % 3; const h = range(26, 60) * (1 + row * 0.5);
    k.put(peaks, i, range(-150, 150), -34 + h / 2, -150 - row * 55 - range(0, 25), 0, R() * 6.28, 0, range(18, 34) * (1 + row * 0.4), h, range(18, 34));
  }

  // ── The dragon ──
  // Its path through the sky: a long loop that reaches far back and comes close.
  const path = (s, out) => out.set(
    Math.sin(s * 0.83) * 4.3 * (1 + (Math.cos(s * 0.5) * -0.5 + 0.5) * 1.6) + Math.sin(s * 0.31) * 1.5,
    1.5 + Math.sin(s * 0.57 + 1) * 6.5 + Math.cos(s * 1.27) * 1.2,
    -46 + Math.cos(s * 0.5) * 38,
  );
  const N = 130; const STEP = 0.042;
  const scaleCols = ['#ffc94d', '#ffb020', '#ffd76a', '#e89a10'].map((c) => new THREE.Color(c));
  const body = k.many(new THREE.SphereGeometry(1, 9, 7), k.mat('#ffffff', { metal: 1, rough: 0.24, flat: true, env: 1.5 }), N);
  for (let i = 0; i < N; i++) k.tint(body, i, scaleCols[i % 4]);
  body.instanceColor.needsUpdate = true;
  const fins = k.many(new THREE.ConeGeometry(0.2, 1, 4), k.mat('#e11d2a', { metal: 0.4, rough: 0.35, flat: true, emissive: '#7a0a10', glowing: 0.6, env: 1 }), N);
  const girth = (i) => { const u = i / N; return 1.05 * (0.62 + 0.38 * Math.sin(Math.min(1, u * 5) * Math.PI / 2)) * (1 - Math.pow(u, 1.7) * 0.88); };

  const gold = k.mat('#ffc94d', { metal: 1, rough: 0.2, flat: true, env: 1.6 });
  const red = k.mat('#e11d2a', { metal: 0.4, rough: 0.35, flat: true, emissive: '#7a0a10', glowing: 0.7 });
  const head = new THREE.Group();
  const part = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => { const m = new THREE.Mesh(k.keep(geo), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); head.add(m); return m; };
  part(new THREE.SphereGeometry(1, 10, 8), gold, 0, 0.1, 0, 0, 0, 0, 1.15, 1.0, 1.35);          // skull
  part(new THREE.BoxGeometry(1.1, 0.62, 1.7), gold, 0, -0.05, 1.5);                             // snout
  part(new THREE.BoxGeometry(0.95, 0.26, 1.5), gold, 0, -0.62, 1.35, 0.22);                     // jaw
  for (const s of [-1, 1]) {
    part(new THREE.ConeGeometry(0.16, 2.3, 5), gold, s * 0.55, 1.25, -0.8, -1.0, 0, s * -0.3);  // horns
    part(new THREE.ConeGeometry(0.1, 1.1, 4), gold, s * 0.85, 0.95, -0.4, -0.9, 0, s * -0.75);
    part(new THREE.SphereGeometry(0.2, 10, 8), k.mat('#fff7c2', { metal: 0, rough: 0.3, emissive: '#ffe066', glowing: 3 }), s * 0.62, 0.42, 0.85); // eyes
    part(new THREE.CylinderGeometry(0.035, 0.012, 4.2, 5), red, s * 1.3, -0.3, 1.5, 0.5, 0, s * -1.15);  // whiskers
    part(new THREE.ConeGeometry(0.1, 0.5, 4), k.mat('#fff8ec', { metal: 0.2, rough: 0.3 }), s * 0.36, -0.42, 2.1, Math.PI);  // fangs
    for (let j = 0; j < 4; j++) part(new THREE.ConeGeometry(0.2, 1.3 - j * 0.15, 4), red, s * (1.0 - j * 0.05), 0.3 - j * 0.35, -0.7 - j * 0.12, -1.3, 0, s * -1.1); // mane
  }
  for (let j = 0; j < 3; j++) part(new THREE.ConeGeometry(0.22, 1.1, 4), red, 0, 1.15, -0.2 - j * 0.6, -0.6);  // crest
  scene.add(head);

  // The pearl it chases.
  const pearl = new THREE.Mesh(k.keep(new THREE.SphereGeometry(0.6, 20, 14)), k.mat('#fffbe6', { metal: 0.2, rough: 0.15, emissive: '#ffe9a8', glowing: 2.4 }));
  scene.add(pearl);
  const pearlGlow = k.card(7, 7, { color: '#ffe9a8', opacity: 0.7, tex: k.glow() });
  const pearlLight = new THREE.PointLight('#ffe2a0', 160, 40, 2); scene.add(pearlLight);

  // ── Lanterns through the whole sky ──
  const LN = 150;
  const paper = k.many(new THREE.SphereGeometry(0.5, 12, 9), k.mat('#c21a12', { metal: 0, rough: 0.6, emissive: '#ff4a1c', glowing: 1.9, env: 0.3 }), LN);
  const lcap = k.many(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10), k.mat('#ffc94d', { metal: 1, rough: 0.25 }), LN * 2);
  const ld = Array.from({ length: LN }, () => ({ x: range(-1, 1), z: -Math.pow(R(), 1.6) * 210 + 8, off: R() * 60, sp: range(0.35, 0.9), s: range(0.7, 1.5), ph: R() * 6.28 }));
  const lglow = k.points(LN, { color: '#ff7a3c', size: 3.2, box: [1, 1, 1], center: [0, 0, 0], opacity: 0.5 });

  const clouds = Array.from({ length: 12 }, (_, i) => { const c = k.card(range(50, 110), range(16, 30), { color: i % 2 ? '#5a1010' : '#7a1c12', opacity: 0.2, tex: k.glow(), add: false }); c.position.set(range(-70, 70), range(-22, 30), -60 - i * 16); c.userData.sp = range(0.4, 1.4) * (i % 2 ? 1 : -1); return c; });
  const embers = k.points(200, { color: '#ffb347', size: 0.2, box: [26, 26, 90], center: [0, 0, -30], opacity: 0.9 });

  const p = new THREE.Vector3(); const q = new THREE.Vector3(); const up = new THREE.Vector3();
  const o = new THREE.Object3D();
  return (t, dt) => {
    const s0 = t * 0.34;
    // Body: each piece sits a little further back along the path and looks at the one in front.
    for (let i = 0; i < N; i++) {
      const s = s0 - 0.12 - i * STEP;
      path(s, p); path(s + STEP, q);
      const r = girth(i);
      o.position.copy(p); o.lookAt(q); o.rotateZ(Math.sin(s * 3) * 0.25);
      o.scale.set(r, r * 0.9, Math.max(0.35, p.distanceTo(q) * 1.25));
      o.updateMatrix(); body.setMatrixAt(i, o.matrix);
      // A fin along the spine on every other piece.
      up.set(0, 1, 0).applyQuaternion(o.quaternion);
      o.position.addScaledVector(up, r * 0.85);
      const f = i % 2 === 0 ? r * 1.25 : 0;
      o.scale.set(f, f, f);
      o.updateMatrix(); fins.setMatrixAt(i, o.matrix);
    }
    body.instanceMatrix.needsUpdate = true; fins.instanceMatrix.needsUpdate = true;
    path(s0, p); path(s0 + 0.05, q);
    head.position.copy(p); head.lookAt(q); head.rotateZ(Math.sin(s0 * 3) * 0.2);
    head.scale.setScalar(1.05);
    path(s0 + 0.42, p);
    pearl.position.set(p.x, p.y + Math.sin(t * 2) * 0.4, p.z);
    pearlGlow.position.copy(pearl.position); pearlGlow.quaternion.copy(camera.quaternion);
    pearlGlow.material.opacity = 0.55 + 0.2 * Math.sin(t * 3);
    pearlLight.position.copy(pearl.position);

    for (let i = 0; i < LN; i++) {
      const d = ld[i];
      const spread = 9 + (8 - d.z) * 0.42; // the sky is wider the further away it is
      const x = d.x * spread + Math.sin(t * 0.3 + d.ph) * 0.8;
      const y = -34 + ((t * d.sp + d.off) % 68);
      k.put(paper, i, x, y, d.z, 0, 0, Math.sin(t * 0.5 + d.ph) * 0.12, d.s * 0.85, d.s * 1.15, d.s * 0.85);
      k.put(lcap, i * 2, x, y + d.s * 0.56, d.z, 0, 0, 0, d.s); k.put(lcap, i * 2 + 1, x, y - d.s * 0.56, d.z, 0, 0, 0, d.s);
      lglow.pos[i * 3] = x; lglow.pos[i * 3 + 1] = y; lglow.pos[i * 3 + 2] = d.z + 0.6;
    }
    paper.instanceMatrix.needsUpdate = true; lcap.instanceMatrix.needsUpdate = true; lglow.flag();
    lglow.mat.opacity = 0.42 + 0.1 * Math.sin(t * 2.2);
    for (const c of clouds) { c.position.x += c.userData.sp * dt; if (c.position.x > 110) c.position.x = -110; else if (c.position.x < -110) c.position.x = 110; }
    k.drift(embers, dt, t, 1.1, 0.4);
    sun.material.opacity = 0.68 + 0.08 * Math.sin(t * 0.3);
    camera.position.set(Math.sin(t * 0.05) * 1.6, Math.sin(t * 0.04) * 1.1, 14);
    camera.lookAt(Math.sin(t * 0.035) * 2.5, 2 + Math.sin(t * 0.03) * 1.5, -50);
    camera.rotation.z += Math.sin(t * 0.04) * 0.03;
  };
}
