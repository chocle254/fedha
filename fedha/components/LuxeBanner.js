import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { holidayFor } from '../lib/holidays';
import { playSound } from '../lib/sounds';

// Luxe's own notification banner while the app is open (lib/notifications.js sends here instead of the system
// tray when Luxe is on screen). Slides down from the top in the current look (tier accent, or the holiday's
// skin: gothic violet at Halloween, snow and red at Christmas, party pink on your birthday, gold at New Year),
// plays the matching sound (lib/sounds.js), buzzes, auto-hides after a
// few seconds, swipe up to dismiss, tap to open. 🔕 on a banner mutes banner sounds (localStorage).
const KINDS = {
  money: { color: '#22C55E', icon: '💰', label: 'MONEY IN', sound: 'x-money' },
  alert: { color: '#EF4444', icon: '⚠️', label: 'ALERT', sound: 'x-alert' },
  trade: { color: '#3B82F6', icon: '🚀', label: 'TRADE', sound: 'x-trade' },
  win: { color: '#22C55E', icon: '🎯', label: 'TARGET HIT', sound: 'x-win' },
  loss: { color: '#F97316', icon: '🛑', label: 'STOPPED OUT', sound: 'x-loss' },
  planner: { color: '#8B5CF6', icon: '🗓️', label: 'PLANNER', sound: 'x-planner' },
  study: { color: '#818CF8', icon: '🎓', label: 'STUDY', sound: 'x-study' },
  other: { color: '#64748B', icon: '🔔', label: 'LUXE', sound: 'x-luxe' },
};
const HOLIDAY_SOUND = { halloween: 'h-halloween', christmas: 'h-christmas', birthday: 'h-birthday', newyear: 'h-newyear', vice: 'h-vice' };
const MUTE = 'luxe_banner_mute';

// Same sorting as the Android app (LuxeDelegationService.kindOf), from the tag and title.
export function kindOf(tag = '', title = '') {
  const g = String(tag), t = String(title);
  // A trade that closed: its own sound for a target and for a stop, so you know which without looking.
  if ((g.includes('trade-') || g.includes('broker-close')) && t.startsWith('🛑')) return 'loss';
  if ((g.includes('trade-') || g.includes('broker-close')) && (t.startsWith('🎯') || t.startsWith('✅'))) return 'win';
  if (g.includes('upesipay') || t.startsWith('Withdrawal failed') || t.startsWith('🛑') || t.startsWith('⚠️')) return 'alert';
  if (g.includes('earn-') || g.includes('startup-pay') || g.includes('sms-in-') || g.includes('nestlink') || t.startsWith('💸')) return 'money';
  if (t.startsWith('🚀') || t.startsWith('🎯') || t.startsWith('✅') || t.startsWith('📥')) return 'trade';
  if (g.includes('study') || t.startsWith('🍅') || t.startsWith('🎓')) return 'study';
  if (g.includes('block_') || g.includes('meal_') || g.includes('planner') || g.includes('break')) return 'planner';
  return 'other';
}

export default function LuxeBanner() {
  const router = useRouter();
  const [list, setList] = useState([]);
  const [muted, setMuted] = useState(false);
  const drag = useRef({});

  useEffect(() => { try { setMuted(localStorage.getItem(MUTE) === '1'); } catch { /* private */ } }, []);
  // One banner at a time: the rest wait their turn (a small "+N more" shows how many).
  const queue = useRef([]);
  const seen = useRef(new Map());
  const showing = useRef(null);
  const [waiting, setWaiting] = useState(0);
  const pump = useCallback(() => {
    if (showing.current || !queue.current.length) { setWaiting(queue.current.length); return; }
    const n = queue.current.shift();
    showing.current = n.id;
    setWaiting(queue.current.length);
    setList([n]);
    // Holiday sound for everyday news; trades and alerts keep theirs (same rule as the Android app).
    playSound(n.hol && HOLIDAY_SOUND[n.hol] && !['alert', 'trade', 'win', 'loss'].includes(n.kind) ? HOLIDAY_SOUND[n.hol] : n.k.sound);
    try { navigator.vibrate?.(n.vibrate || [120, 60, 120]); } catch { /* not supported */ }
    setTimeout(() => closeRef.current(n.id), n.requireInteraction ? 10000 : 4500);
  }, []);
  const close = useCallback((id) => {
    setList((l) => l.filter((x) => x.id !== id));
    if (showing.current === id) { showing.current = null; setTimeout(() => pump(), 350); }
  }, [pump]);
  const closeRef = useRef(close); closeRef.current = close;

  useEffect(() => {
    const on = (e) => {
      const d = e.detail || {};
      const kind = d.kind || kindOf(d.tag, d.title);
      const k = KINDS[kind] || KINDS.other;
      const hol = holidayFor(new Date());
      // The same reminder often arrives twice (the phone's own timer and the server): show it once.
      const sig = `${String(d.tag || '').replace(/~quiet$/, '')}|${d.title}`;
      const now = Date.now();
      for (const [k0, t] of seen.current) if (now - t > 120000) seen.current.delete(k0);
      if (seen.current.has(sig)) return;
      seen.current.set(sig, now);
      const id = `${now}${Math.random()}`;
      queue.current.push({ id, ...d, kind, k, hol: hol?.key || null });
      pump();
    };
    window.addEventListener('luxe-notify', on);
    // Server pushes that arrive while Luxe is open (worker/sw-src.js) show here instead of the phone's pop-up.
    const fromSw = (e) => { if (e.data?.type === 'LUXE_PUSH') on({ detail: e.data.payload || {} }); };
    navigator.serviceWorker?.addEventListener('message', fromSw);
    return () => { window.removeEventListener('luxe-notify', on); navigator.serviceWorker?.removeEventListener('message', fromSw); };
  }, [close]);

  if (!list.length) return null;
  return (
    <div className="lb-stack" role="region" aria-label="Notifications">
      {list.map((n) => {
        const hol = n.hol && ['halloween', 'christmas', 'birthday', 'newyear', 'vice'].includes(n.hol) && !['alert', 'trade', 'win', 'loss'].includes(n.kind) ? n.hol : null;
        const holIcon = { halloween: '🦇', christmas: '🎄', birthday: '🎂', newyear: '🎆', vice: '🌴' }[hol];
        return (
          <div key={n.id} className={`lb ${hol ? `lb-${hol}` : ''}`} style={{ '--k': n.k.color }}
            onPointerDown={(e) => { drag.current[n.id] = { y: e.clientY, el: e.currentTarget }; }}
            onPointerMove={(e) => { const s = drag.current[n.id]; if (s) { const dy = Math.min(0, e.clientY - s.y); s.el.style.transform = `translateY(${dy}px)`; s.dy = dy; } }}
            onPointerUp={() => { const s = drag.current[n.id]; delete drag.current[n.id]; if (s?.dy < -40) close(n.id); else if (s) { s.el.style.transform = ''; if (!s.dy || s.dy > -6) { close(n.id); if (n.url) router.push(n.url); } } }}>
            <div className="lb-badge">{holIcon || n.k.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lb-label">{hol ? `${{ halloween: 'HALLOWEEN', christmas: 'CHRISTMAS', birthday: 'BIRTHDAY', newyear: 'NEW YEAR', vice: 'VICE NIGHTS' }[hol]} · ` : ''}{n.k.label}</div>
              <div className="lb-title">{n.title}</div>
              {n.body && <div className="lb-body">{n.body}</div>}
              {waiting > 0 && <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3 }}>+{waiting} more after this</div>}
            </div>
            <button className="lb-mute" aria-label={muted ? 'Turn banner sounds on' : 'Mute banner sounds'} onPointerUp={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); const m = !muted; setMuted(m); try { localStorage.setItem(MUTE, m ? '1' : '0'); } catch { /* private */ } }}>{muted ? '🔕' : '🔔'}</button>
          </div>
        );
      })}
    </div>
  );
}
