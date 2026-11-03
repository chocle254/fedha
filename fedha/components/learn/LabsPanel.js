import { unitsOf, labOf } from '../../lib/labs';

// 🧪 Labs: every course's units, each with its lab: locked until the unit's lessons are done, then ready, in progress
// (milestones done) or shipped. Tap to open the lab bench (components/learn/LabMode.js).
export default function LabsPanel({ courses, projects, onOpen }) {
  const rows = courses.filter((c) => (c.modules || []).length).map((c) => ({ c, units: unitsOf(c) }));
  if (!rows.length) return null;
  return (
    <div className="card" style={{ padding: 14, marginBottom: 14, borderColor: 'rgba(52,211,153,.35)', background: 'linear-gradient(135deg,rgba(16,185,129,.12),rgba(5,10,8,.4))' }}>
      <div style={{ fontWeight: 800 }}>🧪 Project Labs</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '4px 0 10px', lineHeight: 1.5 }}>After every unit, Byte runs a hands-on project built from it. He tracks every milestone and reviews your code. Lab after lab.</div>
      {rows.map(({ c, units }) => (
        <div key={c.id} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', marginBottom: 4 }}>{c.title}</div>
          {units.map((u) => {
            const lab = labOf(projects, c.id, u.section);
            const done = lab?.lab?.milestones?.filter((m) => m.done).length || 0, n = lab?.lab?.milestones?.length || 0;
            const state = lab?.status === 'shipped' ? ['🚀', 'Shipped', 'var(--gold)'] : lab ? ['🧪', `${done}/${n} milestones`, 'var(--green)'] : u.complete ? ['✨', 'Lab ready', 'var(--green)'] : ['🔒', `${u.done}/${u.total} lessons`, 'var(--text-3)'];
            return (
              <button key={u.section} onClick={() => onOpen(c.id, u.section)} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%', display: 'flex', gap: 8, alignItems: 'center', padding: '7px 8px', borderRadius: 10, marginBottom: 4, background: 'var(--card-2)' }}>
                <span>{state[0]}</span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Unit {u.index + 1}: {lab?.title || u.section}</span>
                <span style={{ fontSize: 11.5, color: state[2] }}>{state[1]}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
