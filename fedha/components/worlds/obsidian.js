// Black Card: midnight over Dubai. A real photograph of the Burj Khalifa and Downtown at night is the city; you
// drift slowly in towards it while your own black card turns in the air above the towers, gold-edged, catching
// the light, and gold sparks rise past you like the city's lights coming loose.
// Photo: public/worlds/blackcard.jpg (Unsplash, free licence).
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

export default function obsidian(k) {
  const { THREE, scene, camera, R, range } = k;
  k.backdrop('#04101c', '#02070d', '#000000');
  k.env([
    { c: '#ffe9b0', i: 9, p: [0, 11, 3], s: [12, 1] }, { c: '#e9c46a', i: 5, p: [-10, 1, 4], s: [1, 14] }, { c: '#ffffff', i: 6, p: [10, 3, 2], s: [0.8, 12] },
    { c: '#e9c46a', i: 4, p: [3, -9, 6], s: [8, 1] }, { c: '#ffffff', i: 10, p: [-5, 5, 9], s: [2.5, 0.5] }, { c: '#3aa0ff', i: 2.5, p: [0, -2, -11], s: [10, 6] },
  ], '#020202');
  scene.add(new THREE.AmbientLight('#e9c46a', 0.3));
  const spark = new THREE.PointLight('#ffe2a0', 90, 50, 2); scene.add(spark);

  const city = k.photo('/worlds/blackcard.jpg', { aspect: 1280 / 1707, z: -120, y: 4, height: 200, tint: '#d9d9d9' });
  // Darker towards the bottom, where the app's cards sit, and a thin haze over the streets.
  const shade = k.card(400, 150, { color: '#000000', opacity: 0.55, tex: k.glow(), add: false }); shade.position.set(0, -78, -100);
  const haze = [0, 1, 2].map((i) => { const h = k.card(range(120, 200), range(18, 30), { color: '#2b5f9e', opacity: 0.07, tex: k.glow() }); h.position.set(range(-30, 30), -20 - i * 9, -90 + i * 12); h.userData.sp = range(0.6, 1.4) * (i % 2 ? 1 : -1); return h; });

  // The card.
  const W = 5.6; const H = 3.5;
  const body = k.keep(roundedCard(THREE, W, H, 0.3));
  const black = k.mat('#0b0b0c', { metal: 0.9, rough: 0.26, env: 1.4, fog: false });
  const edge = k.mat('#e9c46a', { metal: 1, rough: 0.18, env: 1.6, fog: false });
  const card = new THREE.Group();
  card.add(new THREE.Mesh(body, [black, edge]));
  const face = new THREE.Mesh(k.keep(new THREE.PlaneGeometry(W, H)), k.keep(new THREE.MeshStandardMaterial({ map: k.keep(cardFace(THREE)), transparent: true, metalness: 1, roughness: 0.22, envMapIntensity: 1.8, depthWrite: false, fog: false })));
  face.position.z = 0.05; card.add(face);
  card.scale.setScalar(1.5); card.position.set(0, 5.5, -12);
  scene.add(card);
  const halo = k.card(26, 26, { color: '#e9c46a', opacity: 0.1, tex: k.glow() }); halo.position.set(0, 5.5, -16);

  // Sparks at every distance between you and the city, so they slide across it as you move.
  const near = k.points(110, { color: '#f4d58d', size: 0.2, box: [24, 30, 40], center: [0, 0, -10], opacity: 0.85 });
  const mid = k.points(140, { color: '#ffd98a', size: 0.5, box: [70, 60, 50], center: [0, 0, -55], opacity: 0.6 });
  const far = k.points(120, { color: '#fff1cc', size: 0.9, box: [120, 70, 20], center: [0, -6, -100], opacity: 0.45 });

  return (t, dt) => {
    city.userData.tick(dt);
    card.rotation.set(Math.sin(t * 0.31) * 0.18, Math.sin(t * 0.3) * 0.6, -0.14 + Math.sin(t * 0.2) * 0.04);
    card.position.y = 5.5 + Math.sin(t * 0.4) * 0.35;
    spark.position.set(Math.sin(t * 0.5) * 6, 6 + Math.cos(t * 0.4) * 3, -6);
    halo.material.opacity = 0.08 + 0.05 * Math.sin(t * 0.6);
    for (const h of haze) { h.position.x += h.userData.sp * dt; if (h.position.x > 90) h.position.x = -90; else if (h.position.x < -90) h.position.x = 90; }
    k.drift(near, dt, t, 0.5, 0.1); k.drift(mid, dt, t, 0.8, 0.2); k.drift(far, dt, t, 0.6, 0.3);
    far.mat.opacity = 0.3 + 0.2 * Math.sin(t * 1.3);
    // A slow approach to the city and back, looking around a little: the near things move, the far city barely does.
    const go = 0.5 - 0.5 * Math.cos(t * 0.05);
    camera.position.set(Math.sin(t * 0.06) * 3.2, Math.sin(t * 0.045) * 1.6, 14 - go * 34);
    camera.lookAt(Math.sin(t * 0.04) * 4, 3 + Math.sin(t * 0.03) * 2, -120);
  };
}
