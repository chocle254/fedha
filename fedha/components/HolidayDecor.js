// The holiday decoration that hangs on the net worth card: Halloween's spider dropping on its thread, a
// Christmas bauble swinging, a birthday balloon bobbing on its string, New Year cheers, a beating Valentine
// heart, an Easter chick hopping, a Kenyan flag waving. Transform-only animations (styles/globals.css .hd-*).
const ITEMS = {
  spider: { thread: true, emoji: '🕷️', cls: 'hd-drop' },
  ornament: { thread: true, emoji: '🔴', cls: 'hd-swing' },
  balloon: { string: true, emoji: '🎈', cls: 'hd-bob' },
  cheers: { emoji: '🥂', cls: 'hd-clink' },
  heart: { emoji: '💘', cls: 'hd-beat' },
  chick: { emoji: '🐣', cls: 'hd-hop' },
  flag: { emoji: '🇰🇪', cls: 'hd-wave' },
};

export default function HolidayDecor({ kind }) {
  const it = ITEMS[kind];
  if (!it) return null;
  return (
    <div className={`hd hd-${kind}`} aria-hidden="true">
      <div className={`hd-move ${it.cls}`}>
        {it.thread && <span className="hd-thread" />}
        <span className="hd-emoji">{it.emoji}</span>
        {it.string && <span className="hd-string" />}
      </div>
    </div>
  );
}
