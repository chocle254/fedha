// components/worlds/kit.js — the small engine every tier world runs on (components/TierWorld.js loads it).
// One WebGL canvas behind the app: a renderer, a camera, and helpers for the things every world needs
// (a gradient sky, studio reflections for metal and gems, soft glowing points, instanced placement, and
// fly(): endless travel through a world, so it stretches away from the screen like the Sapphire aquarium).
// Only three.js's own materials are used (no hand-written shaders), so there is nothing for a phone to fail to
// compile. Pauses on low battery (html.lx-saver); steps the resolution down if the phone can't keep up.

export function boot(THREE, host, build) {
  THREE.ColorManagement.enabled = true;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  let ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);
  let broken = false;
  renderer.debug.onShaderError = () => { broken = true; };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 0, 14);

  const bin = [];
  const keep = (x) => { bin.push(x); return x; };
  const dummy = new THREE.Object3D();

  // The same "random" layout every time, so the world looks designed and doesn't jump between visits.
  let seed = 20011205;
  const R = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  let glowTex = null;
  const kit = {
    THREE, scene, camera, renderer, keep, R,
    range: (a, b) => a + R() * (b - a),
    pick: (list) => list[Math.floor(R() * list.length)],

    // A sky dome that fades from one colour at the top, through the middle, to the bottom.
    backdrop(top, mid, bottom) {
      const geo = keep(new THREE.SphereGeometry(400, 24, 16));
      const ct = new THREE.Color(top); const cm = new THREE.Color(mid); const cb = new THREE.Color(bottom); const c = new THREE.Color();
      const pos = geo.attributes.position; const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 400; // -1..1
        if (y >= 0) c.copy(cm).lerp(ct, Math.min(1, y * 1.6)); else c.copy(cm).lerp(cb, Math.min(1, -y * 1.6));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(geo, keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false })));
      mesh.renderOrder = -10;
      scene.add(mesh);
      return mesh;
    },

    // Studio lighting for reflections: bright panels around the scene that metal and gems mirror.
    // panels: [{ c: colour, i: brightness, p: [x, y, z], s: [width, height] }]
    env(panels, base = '#000000') {
      const room = new THREE.Scene();
      room.add(new THREE.Mesh(new THREE.SphereGeometry(60, 16, 12), new THREE.MeshBasicMaterial({ color: base, side: THREE.BackSide })));
      for (const p of panels) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(p.s[0], p.s[1]), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.c).multiplyScalar(p.i), side: THREE.DoubleSide }));
        m.position.set(p.p[0], p.p[1], p.p[2]);
        m.lookAt(0, 0, 0);
        room.add(m);
      }
      const gen = new THREE.PMREMGenerator(renderer);
      const target = keep(gen.fromScene(room, 0.03));
      scene.environment = target.texture;
      gen.dispose();
      room.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    },

    // A soft round glow (for dust, sparks, bokeh and light sources).
    glow() {
      if (glowTex) return glowTex;
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      glowTex = keep(new THREE.CanvasTexture(c));
      return glowTex;
    },
    // A four-point star flash (for gems).
    star() {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); g.translate(32, 32);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(0, -30); g.quadraticCurveTo(2.2, -2.2, 30, 0); g.quadraticCurveTo(2.2, 2.2, 0, 30); g.quadraticCurveTo(-2.2, 2.2, -30, 0); g.quadraticCurveTo(-2.2, -2.2, 0, -30); g.fill(); g.rotate(Math.PI / 4); g.scale(0.5, 0.5); }
      return keep(new THREE.CanvasTexture(c));
    },

    // n glowing points scattered in a box. Returns { obj, pos, n, mat }; move them by editing pos then flag().
    points(n, { color = '#ffffff', size = 0.25, box = [20, 20, 40], center = [0, 0, -20], opacity = 0.8, tex = null, add = true } = {}) {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = center[0] + (R() - 0.5) * box[0]; pos[i * 3 + 1] = center[1] + (R() - 0.5) * box[1]; pos[i * 3 + 2] = center[2] + (R() - 0.5) * box[2];
      }
      const geo = keep(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = keep(new THREE.PointsMaterial({ color, size, map: tex || kit.glow(), transparent: true, opacity, depthWrite: false, sizeAttenuation: true, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false }));
      const obj = new THREE.Points(geo, mat);
      obj.frustumCulled = false;
      scene.add(obj);
      return { obj, pos, n, mat, box, center, flag: () => { geo.attributes.position.needsUpdate = true; } };
    },
    // Lets points drift (dy per second, with a gentle sideways sway) and wrap round inside their box.
    drift(p, dt, t, dy, sway = 0.15) {
      const half = p.box[1] / 2; const top = p.center[1] + half; const bot = p.center[1] - half;
      for (let i = 0; i < p.n; i++) {
        let y = p.pos[i * 3 + 1] + dy * dt * (0.6 + ((i * 37) % 10) / 12);
        if (y > top) y = bot; else if (y < bot) y = top;
        p.pos[i * 3 + 1] = y;
        p.pos[i * 3] += Math.sin(t * 0.5 + i) * dt * sway;
      }
      p.flag();
    },

    // A physically lit material: metal 0..1, rough 0 (mirror) .. 1 (chalk).
    mat(color, { metal = 1, rough = 0.2, flat = false, emissive = null, glowing = 1, double = false, env = 1, opacity = 1, fog = true } = {}) {
      return keep(new THREE.MeshStandardMaterial({
        color, metalness: metal, roughness: rough, flatShading: flat, envMapIntensity: env, fog,
        ...(emissive ? { emissive: new THREE.Color(emissive), emissiveIntensity: glowing } : {}),
        ...(double ? { side: THREE.DoubleSide } : {}),
        ...(opacity < 1 ? { transparent: true, opacity } : {}),
      }));
    },
    // Many copies of one shape, drawn in a single call.
    many(geo, mat, n) {
      const m = new THREE.InstancedMesh(keep(geo), mat, n);
      m.frustumCulled = false;
      scene.add(m);
      return m;
    },
    // Puts copy i at a position, rotation and size.
    put(mesh, i, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
      dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    },
    tint(mesh, i, color) { mesh.setColorAt(i, color); },

    // ── Travelling through a world that never ends ──
    // The world is laid out along a stretch `length` deep (z from front - length up to front). fly() makes a second
    // copy one stretch further away; the returned function slides both towards you by `distance` and puts each
    // back at the far end as it passes behind you, so the place goes on for ever and far things rise out of the haze.
    fly(objects, length) {
      const twins = objects.map((o) => {
        let c;
        if (o.isInstancedMesh) {
          c = new THREE.InstancedMesh(o.geometry, o.material, o.count);
          c.instanceMatrix.array.set(o.instanceMatrix.array.subarray(0, o.count * 16));
          if (o.instanceColor) c.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(o.instanceColor.array.subarray(0, o.count * 3)), 3);
          c.frustumCulled = false;
        } else c = o.clone();
        scene.add(c);
        return c;
      });
      return (distance) => {
        const off = ((distance % length) + length) % length;
        for (const o of objects) o.position.z = off;
        for (const o of twins) o.position.z = off - length;
      };
    },
    // The same for one thing you move yourself: where is something that started at z0 after travelling `distance`?
    wrapZ(z0, distance, length, front = 20) {
      const gone = (((front - z0 - distance) % length) + length) % length;
      return front - gone;
    },
    // A real photograph as the far end of the world (public/worlds/). It fades in when it has loaded, always
    // overfills the screen with room to spare, so the camera can travel towards it and look around while the 3D
    // things in front slide across it. tint darkens or colours it so the app's text stays readable over it.
    photo(url, { aspect = 0.75, z = -120, y = 0, height = 190, tint = '#ffffff' } = {}) {
      const mat = keep(new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0, fog: false, toneMapped: false, depthWrite: false }));
      const mesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(height * aspect, height)), mat);
      mesh.position.set(0, y, z); mesh.renderOrder = -9;
      scene.add(mesh);
      let shown = false;
      new THREE.TextureLoader().load(url, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; keep(tex); mat.map = tex; mat.needsUpdate = true; shown = true; }, undefined, () => {});
      // Call every frame: fades it in, and keeps it wide enough for this screen (a tablet or a turned phone).
      mesh.userData.tick = (dt) => {
        if (shown && mat.opacity < 1) mat.opacity = Math.min(1, mat.opacity + dt * 0.8);
        const dist = camera.position.z - z;
        const needW = 2 * dist * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect * 1.25;
        const needH = 2 * dist * Math.tan((camera.fov * Math.PI) / 360) * 1.2;
        mesh.scale.setScalar(Math.max(1, needW / (height * aspect), needH / height));
      };
      return mesh;
    },

    // A flat picture that glows (light shafts, halos, clouds).
    card(w, h, { color = '#ffffff', opacity = 0.2, tex = null, add = true } = {}) {
      const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), keep(new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending })));
      scene.add(m);
      return m;
    },
  };

  // A world that fails to build takes its canvas with it, so the tier's own colours show instead of a blank sheet.
  let update;
  try { update = build(kit) || (() => {}); }
  catch (e) {
    bin.forEach((d) => d && d.dispose && d.dispose());
    renderer.dispose(); renderer.domElement.remove();
    throw e;
  }

  let last = performance.now(); let raf = 0; let time = 0; let frames = 0; let spent = 0;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (document.documentElement.classList.contains('lx-saver')) { last = now; return; }
    const raw = (now - last) / 1000; last = now;
    const dt = Math.min(0.05, raw);
    time += dt;
    update(time, dt);
    renderer.render(scene, camera);
    if (broken) { cancelAnimationFrame(raf); renderer.domElement.remove(); return; }
    // A phone that can't hold about 30 frames a second gets a lighter picture instead of a stuttering one.
    if (raw < 0.5) { frames += 1; spent += raw; }
    if (frames === 90) {
      if (spent / frames > 0.034 && ratio > 0.75) { ratio = ratio > 1 ? 1 : 0.75; renderer.setPixelRatio(ratio); renderer.setSize(window.innerWidth, window.innerHeight); }
      frames = 0; spent = 0;
    }
  };
  raf = requestAnimationFrame(loop);

  const onResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
  window.addEventListener('resize', onResize);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    bin.forEach((d) => d && d.dispose && d.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
