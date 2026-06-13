// lib/confetti.js — tiny canvas confetti, no dependencies.
export function fireConfetti({ count = 120, spread = 70 } = {}) {
  if (typeof window === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const colors = ['#10B981', '#F59E0B', '#3B82F6', '#EF4444', '#A78BFA', '#22C55E'];
  const cx = canvas.width / 2, cy = canvas.height * 0.35;
  const parts = Array.from({ length: count }, () => {
    const angle = (Math.random() * spread - spread / 2 - 90) * (Math.PI / 180);
    const v = 8 + Math.random() * 8;
    return { x: cx, y: cy, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
      size: 5 + Math.random() * 6, color: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * 360, vr: Math.random() * 12 - 6, life: 0 };
  });
  let raf;
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of parts) {
      p.life += 1; p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr;
      const alpha = Math.max(0, 1 - p.life / 90);
      if (alpha > 0) alive = true;
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(p.x, p.y); ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5); ctx.restore();
    }
    if (alive) raf = requestAnimationFrame(tick); else { cancelAnimationFrame(raf); canvas.remove(); }
  };
  tick();
}
