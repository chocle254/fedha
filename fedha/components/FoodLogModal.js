import { useState, useMemo } from 'react';
import { COMMON_FOODS, FOOD_GROUPS, MEAL_SLOTS } from '../lib/foods';

export default function FoodLogModal({ slot: initialSlot, onClose, onAdd }) {
  const [slot, setSlot] = useState(initialSlot || 'breakfast');
  const [tab, setTab] = useState('common'); // 'common' | 'custom'
  const [query, setQuery] = useState('');
  const [addedCount, setAddedCount] = useState(0);
  const [flashId, setFlashId] = useState(null);

  // Custom entry
  const [cName, setCName] = useState('');
  const [cCal, setCCal] = useState('');
  const [cProtein, setCProtein] = useState('');
  const [cQty, setCQty] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMON_FOODS;
    return COMMON_FOODS.filter((f) => f.name.toLowerCase().includes(q));
  }, [query]);

  const grouped = useMemo(() => {
    return FOOD_GROUPS.map((g) => ({
      ...g,
      items: filtered.filter((f) => f.group === g.id),
    })).filter((g) => g.items.length > 0);
  }, [filtered]);

  function addItem(food) {
    onAdd({
      name: food.name,
      cal: food.cal,
      protein: food.protein,
      icon: food.icon,
      qty: 1,
      slot,
    });
    setAddedCount((c) => c + 1);
    setFlashId(food.id);
    setTimeout(() => setFlashId(null), 400);
  }

  function addCustom() {
    const cal = Number(cCal);
    if (!cName.trim() || !cal) return;
    const qty = Math.max(1, Number(cQty) || 1);
    onAdd({
      name: cName.trim(),
      cal,
      protein: Number(cProtein) || 0,
      icon: '🍽️',
      qty,
      slot,
    });
    setAddedCount((c) => c + 1);
    setCName('');
    setCCal('');
    setCProtein('');
    setCQty(1);
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />

        <div className="modal-header">
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Log Food</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          {/* Slot selector */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Meal</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {MEAL_SLOTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSlot(s.id)}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${slot === s.id ? s.color : 'var(--border)'}`,
                    background: slot === s.id ? `${s.color}22` : 'var(--card-2)',
                    color: slot === s.id ? s.color : 'var(--text-2)',
                    fontFamily: 'Outfit', fontSize: 12, fontWeight: 600,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{s.icon}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`chip ${tab === 'common' ? 'active' : ''}`} onClick={() => setTab('common')}>Food List</button>
            <button className={`chip ${tab === 'custom' ? 'active' : ''}`} onClick={() => setTab('custom')}>Custom</button>
          </div>

          {tab === 'common' && (
            <>
              <input
                className="input"
                placeholder="Search foods…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '42vh', overflowY: 'auto' }}>
                {grouped.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 14, padding: '20px 0' }}>
                    No match. Try the Custom tab.
                  </div>
                )}
                {grouped.map((g) => (
                  <div key={g.id}>
                    <div className="section-title" style={{ marginBottom: 8 }}>{g.label}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {g.items.map((food) => (
                        <button
                          key={food.id}
                          onClick={() => addItem(food)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                            padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                            border: `1px solid ${flashId === food.id ? 'var(--green)' : 'var(--border)'}`,
                            background: flashId === food.id ? 'var(--green-dim)' : 'var(--card-2)',
                            fontFamily: 'Outfit', transition: 'all 0.2s',
                          }}
                        >
                          <span style={{ fontSize: 20, flexShrink: 0 }}>{food.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{food.name}</div>
                            <div className="font-num" style={{ fontSize: 11, color: 'var(--text-3)' }}>{food.cal} cal · {food.protein}g protein</div>
                          </div>
                          <span style={{ fontSize: 18, color: 'var(--green)', flexShrink: 0, fontWeight: 700 }}>
                            {flashId === food.id ? '✓' : '+'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'custom' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Food name</label>
                <input className="input" placeholder="e.g. Nyama choma" value={cName} onChange={(e) => setCName(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Calories</label>
                  <input className="input font-num" type="number" inputMode="numeric" placeholder="0" value={cCal} onChange={(e) => setCCal(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Protein (g)</label>
                  <input className="input font-num" type="number" inputMode="numeric" placeholder="0" value={cProtein} onChange={(e) => setCProtein(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Servings</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button className="btn-icon" onClick={() => setCQty((q) => Math.max(1, q - 1))}>−</button>
                  <span className="font-num" style={{ fontSize: 18, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{cQty}</span>
                  <button className="btn-icon" onClick={() => setCQty((q) => q + 1)}>+</button>
                </div>
              </div>
              <button className="btn-primary" onClick={addCustom} disabled={!cName.trim() || !cCal}>Add to diary</button>
            </div>
          )}

          {/* Footer */}
          <button className="btn-ghost" onClick={onClose} style={{ marginTop: 4 }}>
            {addedCount > 0 ? `Done — ${addedCount} item${addedCount > 1 ? 's' : ''} logged` : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
