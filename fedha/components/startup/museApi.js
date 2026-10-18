// One way for every startup tab to talk to Muse (pages/api/ai.js).
export async function museAsk(type, payload) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// What Muse needs to know about a startup — without bulky history.
export function startupForAI(startup, stages) {
  const { chat, investor_sessions, audit, ...rest } = startup || {};
  const pitch = startup?.pitch ? { one_liner: startup.pitch.one_liner, elevator: startup.pitch.elevator, slides: startup.pitch.slides } : undefined;
  return { ...rest, stages: stages || startup?.stages || {}, pitch, notebook: (startup?.notebook || []).slice(0, 12) };
}

export function ScoreBar({ value, max = 10, color = '#7B61FF' }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / max) * 100));
  return (
    <div className="muse-bar" style={{ margin: '6px 0 0', height: 5 }}>
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function scoreColor(pct) {
  return pct >= 70 ? '#10B981' : pct >= 45 ? '#F59E0B' : '#EF4444';
}
