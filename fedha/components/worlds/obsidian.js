// Black Card: midnight over a city that has no edge. You fly down an avenue between black glass towers with
// gold-lit windows, traffic running as threads of light far below, towers rising out of the dark ahead for
// ever. Above the avenue, far off and huge, your own black card turns slowly, gold-edged, catching the light.
function roundedCard(THREE, w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -0.03);
  return g;
}

// The printing on the card, drawn in gold on a clear sheet.
function cardFace(THREE) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 640;
  const g = c.getContext('2d');
  const gold = g.createLinearGradient(0, 0, 1024, 640);
  gold.addColorStop(0, '#f6e3a1'); gold.addColorStop(0.45, '#d4a94a'); gold.addColorStop(0.6, '#fff2c4'); gold.addColorStop(1, '#b8892f');
  g.fillStyle = gold; g.strokeStyle = gold;
  g.font = '700 118px Georgia, "Times New Roman", serif'; g.textBaseline = 'alphabetic';
  g.fillText('LUXE', 70, 160);
  g.font = '600 30px Georgia, serif';
  g.fillText('B L A C K   C A R D', 76, 208);
  // The chip.
  g.lineWidth = 4;
  const chip = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  chip(76, 270, 150, 112, 16); g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1;
  g.strokeStyle = '#3a2a08'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(76, 308); g.lineTo(126, 308); g.moveTo(76, 344); g.lineTo(126, 344); g.moveTo(176, 308); g.lineTo(226, 308); g.moveTo(176, 344); g.lineTo(226, 344); g.moveTo(126, 270); g.lineTo(126, 382); g.moveTo(176, 270); g.lineTo(176, 382); g.stroke();
  // Contactless waves.
  g.strokeStyle = gold; g.lineWidth = 6; g.lineCap = 'round';
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(262, 326, 22 + i * 18, -0.75, 0.75); g.stroke(); }
  g.font = '500 54px "Courier New", monospace';
  g.fillText('••••  ••••  ••••  2001', 76, 478);
  g.font = '600 26px Georgia, serif';
  g.fillText('MEMBER SINCE 2026', 76, 560);
  g.font = '700 34px Georgia, serif'; g.textAlign = 'right';
  g.fillText('∞', 950, 566);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// A tower's windows: a grid of small gold lights, some on, some dim, most dark.
function windows(THREE, R) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 128, 512);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 8; x++) {
    const r = R();
    if (r > 0.42) continue;
    g.fillStyle = r < 0.07 ? '#fff3cf' : r < 0.25 ? '#e9c46a' : '#6b5420';
    g.fillRect(x * 16 + 4, y * 10.6 + 3, 8, 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default function obsidian(k) {
  const { THREE, scene, camera, R, range } = k;
  const L = 150; const FRONT = 20; const STREET = -26;
  k.backdrop('#0d0b08', '#050403', '#000000');
  scene.fog = new THREE.FogExp2(new THREE.Color('#050403'), 0.0105);
  k.env([
    { c: '#ffe9b0', i: 9, p: [0, 11, 3], s: [12, 1] }, { c: '#e9c46a', i: 5, p: [-10, 1, 4], s: [1, 14] }, { c: '#ffffff', i: 6, p: [10, 3, 2], s: [0.8, 12] },
    { c: '#e9c46a', i: 4, p: [3, -9, 6], s: [8, 1] }, { c: '#ffffff', i: 10, p: [-5, 5, 9], s: [2.5, 0.5] }, { c: '#e9c46a', i: 3, p: [0, -3, -11], s: [10, 2] },
  ], '#020202');
  scene.add(new THREE.AmbientLight('#e9c46a', 0.3));
  const spark = new THREE.PointLight('#ffe2a0', 90, 50, 2); scene.add(spark);

  // The towers: black glass, lit from inside.
  const lit = k.keep(windows(THREE, R));
  const glass = k.keep(new THREE.MeshStandardMaterial({ color: '#08080a', metalness: 0.95, roughness: 0.22, envMapIntensity: 1.2, emissive: new THREE.Color('#ffd98a'), emissiveMap: lit, emissiveIntensity: 1.5 }));
  const N = 120;
  const towers = k.many(new THREE.BoxGeometry(1, 1, 1), glass, N);
  for (let i = 0; i < N; i++) {
    const side = i % 2 ? 1 : -1; const row = R() < 0.55 ? 0 : R() < 0.6 ? 1 : 2;
    const w = range(4, 8); const d = range(4, 8); const h = row === 0 ? range(22, 58) : range(30, 90);
    k.put(towers, i, side * (9 + row * 11 + range(0, 6) + w / 2), STREET + h / 2, range(FRONT - L, FRONT), 0, 0, 0, w, h, d);
  }
  const travel = k.fly([towers], L);

  // The street far below: a dark wet road with two streams of traffic drawn as threads of light.
  const road = new THREE.Mesh(k.keep(new THREE.PlaneGeometry(600, 700)), k.mat('#050505', { metal: 0.9, rough: 0.35, env: 0.6 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, STREET, -200); scene.add(road);
  const lane = (x, color) => { const m = k.card(0.5, 600, { color, opacity: 0.55 }); m.rotation.x = -Math.PI / 2; m.position.set(x, STREET + 0.1, -200); return m; };
  const lanes = [lane(-3, '#ffd98a'), lane(-1.4, '#ffe9b0'), lane(1.4, '#ff5a3c'), lane(3, '#ff3b2f')];
  const cars = k.points(90, { color: '#fff1cc', size: 0.9, box: [7, 0.2, 260], center: [0, STREET + 0.4, -110], opacity: 0.9 });
  const glowBelow = k.card(60, 500, { color: '#e9c46a', opacity: 0.1, tex: k.glow() }); glowBelow.rotation.x = -Math.PI / 2; glowBelow.position.set(0, STREET + 0.3, -180);

  // The card over the avenue.
  const W = 5.6; const H = 3.5;
  const body = k.keep(roundedCard(THREE, W, H, 0.3));
  const black = k.mat('#0b0b0c', { metal: 0.9, rough: 0.26, env: 1.4, fog: false });
  const edge = k.mat('#e9c46a', { metal: 1, rough: 0.18, env: 1.6, fog: false });
  const card = new THREE.Group();
  card.add(new THREE.Mesh(body, [black, edge]));
  const faceTex = k.keep(cardFace(THREE));
  const face = new THREE.Mesh(k.keep(new THREE.PlaneGeometry(W, H)), k.keep(new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, metalness: 1, roughness: 0.22, envMapIntensity: 1.8, depthWrite: false, fog: false })));
  face.position.z = 0.05; card.add(face);
  card.scale.setScalar(4.2); card.position.set(0, 12, -70);
  scene.add(card);
  const halo = k.card(70, 70, { color: '#e9c46a', opacity: 0.12, tex: k.glow() }); halo.position.set(0, 12, -76);
  const moon = k.card(40, 40, { color: '#f4e3b2', opacity: 0.5, tex: k.glow() }); moon.position.set(-60, 110, -380);

  const sparks = k.points(160, { color: '#f4d58d', size: 0.22, box: [26, 30, 90], center: [0, 2, -30], opacity: 0.8 });

  return (t, dt) => {
    const dist = t * 2.4;
    travel(dist);
    card.rotation.set(Math.sin(t * 0.31) * 0.18, Math.sin(t * 0.3) * 0.6, -0.14 + Math.sin(t * 0.2) * 0.04);
    card.position.y = 12 + Math.sin(t * 0.4) * 0.8;
    spark.position.set(Math.sin(t * 0.5) * 8, 12 + Math.cos(t * 0.4) * 5, -52);
    halo.material.opacity = 0.09 + 0.05 * Math.sin(t * 0.6);
    lanes.forEach((m, i) => { m.material.opacity = 0.4 + 0.2 * Math.sin(t * 1.3 + i * 1.7); });
    // Cars: half run towards you, half away.
    for (let i = 0; i < cars.n; i++) {
      const toward = cars.pos[i * 3] < 0;
      let z = cars.pos[i * 3 + 2] + (toward ? 26 : -14) * dt;
      if (z > 20) z -= 260; else if (z < -240) z += 260;
      cars.pos[i * 3 + 2] = z;
    }
    cars.flag();
    k.drift(sparks, dt, t, -0.4, 0.1);
    camera.position.set(Math.sin(t * 0.05) * 1.6, Math.sin(t * 0.04) * 1.2, 14);
    camera.lookAt(Math.sin(t * 0.035) * 3, 1 + Math.sin(t * 0.03) * 2, -60);
    camera.rotation.z += Math.sin(t * 0.045) * 0.035;
  };
}
