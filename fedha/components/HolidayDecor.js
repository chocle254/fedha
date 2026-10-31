// The holiday decoration that hangs on the net worth card: Halloween's spider dropping on its thread, a
// Christmas bauble swinging, a birthday balloon bobbing on its string, New Year cheers, a beating Valentine
// heart, an Easter chick hopping, a Kenyan flag waving. Transform-only animations (styles/globals.css .hd-*).
// Drawn (not emoji) where it matters: a black hairy spider with red eyes, a glass Christmas bauble.
const SPIDER = (
  <svg width="30" height="26" viewBox="0 0 30 26" style={{ display: 'block' }}>
    <g stroke="#0A0A0F" strokeWidth="1.4" fill="none" strokeLinecap="round">
      <path d="M12 12 L5 6 L1 9 M12 14 L4 12 L0 15 M12 15 L5 18 L2 23 M13 16 L8 21 L7 26" /><path d="M18 12 L25 6 L29 9 M18 14 L26 12 L30 15 M18 15 L25 18 L28 23 M17 16 L22 21 L23 26" />
    </g>
    <ellipse cx="15" cy="17" rx="6" ry="6.5" fill="#0A0A0F" /><circle cx="15" cy="10" r="3.6" fill="#111118" />
    <circle cx="13.6" cy="9.4" r=".9" fill="#DC2626" /><circle cx="16.4" cy="9.4" r=".9" fill="#DC2626" /><path d="M13 19 L15 16 L17 19 L15 22Z" fill="#7F1D1D" />
  </svg>
);
const BAUBLE = (
  <svg width="26" height="32" viewBox="0 0 26 32" style={{ display: 'block' }}>
    <defs><radialGradient id="hdB" cx="35%" cy="35%"><stop offset="0" stopColor="#FCA5A5" /><stop offset=".5" stopColor="#DC2626" /><stop offset="1" stopColor="#7F1D1D" /></radialGradient></defs>
    <rect x="9" y="0" width="8" height="6" rx="1" fill="#FBBF24" /><circle cx="13" cy="19" r="12" fill="url(#hdB)" />
    <ellipse cx="9" cy="14" rx="3" ry="2" fill="#fff" opacity=".6" /><path d="M2 19 Q13 24 24 19" stroke="#FDE68A" strokeWidth="1.2" fill="none" />
  </svg>
);
const ITEMS = {
  spider: { thread: true, art: SPIDER, cls: 'hd-drop' },
  ornament: { thread: true, art: BAUBLE, cls: 'hd-swing' },
  balloon: { string: true, emoji: '🎈', cls: 'hd-bob' },
  cheers: { emoji: '🥂', cls: 'hd-clink' },
  heart: { emoji: '💘', cls: 'hd-beat' },
  chick: { emoji: '🐣', cls: 'hd-hop' },
  flag: { emoji: '🇰🇪', cls: 'hd-wave' },
  palm: { emoji: '🌴', cls: 'hd-sway' },
};

export default function HolidayDecor({ kind }) {
  const it = ITEMS[kind];
  if (!it) return null;
  return (
    <div className={`hd hd-${kind}`} aria-hidden="true">
      <div className={`hd-move ${it.cls}`}>
        {it.thread && <span className="hd-thread" />}
        {it.art || <span className="hd-emoji">{it.emoji}</span>}
        {it.string && <span className="hd-string" />}
      </div>
    </div>
  );
}
