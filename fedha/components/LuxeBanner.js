import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { holidayFor } from '../lib/holidays';

// Luxe's own notification banner while the app is open (lib/notifications.js sends here instead of the system
// tray when Luxe is on screen). Slides down from the top in the current look (tier accent, or the holiday's
// skin: gothic violet at Halloween, snow and red at Christmas, party pink on your birthday, gold at New Year),
// plays the matching sound (the same files the Android app uses: public/sounds), buzzes, auto-hides after a
// few seconds, swipe up to dismiss, tap to open. 🔕 on a banner mutes banner sounds (localStorage).
const KINDS = {
  money: { color: '#22C55E', icon: '💰', label: 'MONEY IN', sound: 'n-success' },
  alert: { color: '#EF4444', icon: '⚠️', label: 'ALERT', sound: 'n-alert' },
  trade: { color: '#3B82F6', icon: '🚀', label: 'TRADE', sound: 'n-entry' },
  planner: { color: '#8B5CF6', icon: '🗓️', label: 'PLANNER', sound: 'n-planner' },
  study: { color: '#818CF8', icon: '🎓', label: 'STUDY', sound: 'n-planner' },
  other: { color: '#64748B', icon: '🔔', label: 'LUXE', sound: 'n-jarvis' },
};
const HOLIDAY_SOUND = { halloween: 'h-halloween', christmas: 'h-christmas', birthday: 'h-birthday', newyear: 'h-newyear' };
const MUTE = 'luxe_banner_mute';

// Same sorting as the Android app (LuxeDelegationService.kindOf), from the tag and title.
export function kindOf(tag = '', title = '') {
  const g = String(tag), t = String(title);
  if (g.includes('upesipay') || t.startsWith('Withdrawal failed') || t.startsWith('🛑')) return 'alert';
  if (g.includes('earn-') || g.includes('startup-pay') || g.includes('sms-in-') || g.includes('nestlink') || t.startsWith('💸')) return 'money';
  if (t.startsWith('🚀') || t.startsWith('🎯') || t.startsWith('✅') || t.startsWith('📥')) return 'trade';
  if (g.includes('study') || t.startsWith('🍅') || t.startsWith('🎓')) return 'study';
  if (g.includes('block_') || g.includes('meal_') || g.includes('planner') || g.includes('break')) return 'planner';
  return 'other';
}

const audio = {};
function playSound(name) {
  try {
    if (localStorage.getItem(MUTE) === '1') return;
    const a = audio[name] || (audio[name] = new Audio(`/sounds/${name}.wav`)); // loaded the first time it's needed
    a.currentTime = 0; a.volume = 0.8; a.play().catch(() => {});
  } catch { /* no audio */ }
}

export default function LuxeBanner() {
  const router = useRouter();
  const [list, setList] = useState([]);
  const [muted, setMuted] = useState(false);
  const drag = useRef({});

  useEffect(() => { try { setMuted(localStorage.getItem(MUTE) === '1'); } catch { /* private */ } }, []);
  const close = useCallback((id) => setList((l) => l.filter((x) => x.id !== id)), []);

  useEffect(() => {
    const on = (e) => {
      const d = e.detail || {};
      const kind = d.kind || kindOf(d.tag, d.title);
      const k = KINDS[kind] || KINDS.other;
      const hol = holidayFor(new Date());
      const id = `${Date.now()}${Math.random()}`;
      setList((l) => [{ id, ...d, kind, k, hol: hol?.key || null }, ...l.filter((x) => !d.tag || x.tag !== d.tag)].slice(0, 3));
      // Holiday sound for everyday news; trades and alerts keep theirs (same rule as the Android app).
      playSound(hol && HOLIDAY_SOUND[hol.key] && !['alert', 'trade'].includes(kind) ? HOLIDAY_SOUND[hol.key] : k.sound);
      try { navigator.vibrate?.(d.vibrate || [120, 60, 120]); } catch { /* not supported */ }
      setTimeout(() => close(id), d.requireInteraction ? 12000 : 5500);
    };
    window.addEventListener('luxe-notify', on);
    return () => window.removeEventListener('luxe-notify', on);
  }, [close]);

  if (!list.length) return null;
  return (
    <div className="lb-stack" role="region" aria-label="Notifications">
      {list.map((n) => {
        const hol = n.hol && ['halloween', 'christmas', 'birthday', 'newyear'].includes(n.hol) && !['alert', 'trade'].includes(n.kind) ? n.hol : null;
        const holIcon = { halloween: '🦇', christmas: '🎄', birthday: '🎂', newyear: '🎆' }[hol];
        return (
          <div key={n.id} className={`lb ${hol ? `lb-${hol}` : ''}`} style={{ '--k': n.k.color }}
            onPointerDown={(e) => { drag.current[n.id] = { y: e.clientY, el: e.currentTarget }; }}
            onPointerMove={(e) => { const s = drag.current[n.id]; if (s) { const dy = Math.min(0, e.clientY - s.y); s.el.style.transform = `translateY(${dy}px)`; s.dy = dy; } }}
            onPointerUp={() => { const s = drag.current[n.id]; delete drag.current[n.id]; if (s?.dy < -40) close(n.id); else if (s) { s.el.style.transform = ''; if (!s.dy || s.dy > -6) { close(n.id); if (n.url) router.push(n.url); } } }}>
            <div className="lb-badge">{holIcon || n.k.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lb-label">{hol ? `${{ halloween: 'HALLOWEEN', christmas: 'CHRISTMAS', birthday: 'BIRTHDAY', newyear: 'NEW YEAR' }[hol]} · ` : ''}{n.k.label}</div>
              <div className="lb-title">{n.title}</div>
              {n.body && <div className="lb-body">{n.body}</div>}
            </div>
            <button className="lb-mute" aria-label={muted ? 'Turn banner sounds on' : 'Mute banner sounds'} onPointerUp={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); const m = !muted; setMuted(m); try { localStorage.setItem(MUTE, m ? '1' : '0'); } catch { /* private */ } }}>{muted ? '🔕' : '🔔'}</button>
          </div>
        );
      })}
    </div>
  );
}
