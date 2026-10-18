import { useState } from 'react';
import { todayISO } from '../../lib/utils';
import { STAGES } from '../../lib/startup';
import { PLAYBOOK } from '../../lib/founder-playbook';
import { museAsk, startupForAI, ScoreBar, scoreColor } from './museApi';

const SURVEY = 'Quick question about [product]: How would you feel if you could no longer use it?\n1) Very disappointed\n2) Somewhat disappointed\n3) Not disappointed\nAnd: what is the main benefit you get from it?';

// Readiness: stage gates at a glance, the product-market-fit survey (Sean
// Ellis 40% test), retention, and an AI market-fit readiness audit.
export default function ReadinessTab({ startup, stages, currentStage, save, onOpenPlaybook, onAddTask }) {
  const pmf = startup.pmf || {};
  const [form, setForm] = useState({ very: pmf.very || '', somewhat: pmf.somewhat || '', not: pmf.not || '', ret1: pmf.ret1 || '', ret4: pmf.ret4 || '', ret8: pmf.ret8 || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState({});

  const n = (v) => Math.max(0, Number(v) || 0);
  const total = n(form.very) + n(form.somewhat) + n(form.not);
  const veryPct = total ? Math.round((n(form.very) / total) * 100) : null;
  const rets = [['Week 1', form.ret1], ['Week 4', form.ret4], ['Week 8', form.ret8]].filter(([, v]) => v !== '' && v != null);
  const flattening = form.ret4 !== '' && form.ret8 !== '' && n(form.ret8) >= n(form.ret4) * 0.8 && n(form.ret8) > 0;

  const audit = startup.audit || null;
  const history = startup.audit_history || [];

  function savePmf() {
    save({ pmf: { very: n(form.very), somewhat: n(form.somewhat), not: n(form.not), ret1: form.ret1 === '' ? '' : n(form.ret1), ret4: form.ret4 === '' ? '' : n(form.ret4), ret8: form.ret8 === '' ? '' : n(form.ret8), updated: todayISO() } });
  }
  async function runAudit() {
    setBusy(true); setErr('');
    savePmf();
    try {
      const r = await museAsk('readiness_audit', { startup: startupForAI({ ...startup, pmf: { ...form } }, stages), stageId: currentStage.id });
      const entry = { ...r, at: todayISO() };
      save({ audit: entry, audit_history: [{ at: entry.at, score: entry.score }, ...history].slice(0, 12) });
      setAdded({});
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  function copySurvey() {
    const text = SURVEY.replace('[product]', startup.name);
    try { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); } catch {}
  }

  return (
    <div className="muse-col" style={{ padding: '16px 20px 0' }}>
      {/* ── AI audit ── */}
      <section className="card muse-card muse-agent" style={{ '--stage': '#7B61FF' }}>
        <div className="muse-label">🧪 MARKET-FIT READINESS TEST</div>
        {audit ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
            <div className="muse-score" style={{ '--c': scoreColor(audit.score) }}>{audit.score}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{audit.level}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45, marginTop: 4 }}>{audit.summary}</div>
              {history[1] && <div style={{ fontSize: 11.5, color: audit.score >= history[1].score ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>{audit.score >= history[1].score ? '▲' : '▼'} from {history[1].score} on {history[1].at}</div>}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 0', lineHeight: 1.5 }}>Muse looks at everything — journey answers, checklists, notebook, survey and retention numbers — and scores how close you really are to product-market fit and investor-ready, then gives you the 3 cheapest tests to raise the score.</div>
        )}
        <button className="btn-primary muse-send" style={{ marginTop: 14 }} onClick={runAudit} disabled={busy}>{busy ? 'Testing…' : audit ? '↻ Re-test now' : '🧪 Run the readiness test'}</button>
        {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{err}</div>}
      </section>

      {audit && (
        <>
          <section className="card muse-card">
            <div className="muse-label">BREAKDOWN · {audit.at}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              {audit.dimensions.map((d) => (
                <div key={d.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b>{d.name}</b><span className="font-num">{d.score}/10</span></div>
                  <ScoreBar value={d.score} color={scoreColor(d.score * 10)} />
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>✓ {d.evidence}</div>
                  {d.gap && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>→ {d.gap}</div>}
                </div>
              ))}
            </div>
          </section>
          {audit.next_tests?.length > 0 && (
            <section className="card muse-card">
              <div className="muse-label">🔬 RUN THESE TESTS NEXT</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {audit.next_tests.map((t, i) => (
                  <div key={t.test} className="muse-test">
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{i + 1}. {t.test}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.45 }}>{t.how}</div>
                    <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 4 }}>Success = {t.success}</div>
                    <button className="muse-link" disabled={added[i]} onClick={() => { onAddTask({ title: t.test, how: [t.how, `Success = ${t.success}`], minutes: 60 }); setAdded((a) => ({ ...a, [i]: true })); }}>
                      {added[i] ? '✓ Added to tomorrow’s plan' : '+ Schedule it for tomorrow'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── PMF survey ── */}
      <section className="card muse-card">
        <div className="muse-label">🎯 THE 40% TEST (SEAN ELLIS SURVEY)</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 10px', lineHeight: 1.5 }}>Send this to active users, then count the answers. If 40% or more say "very disappointed", you're likely at product-market fit.</div>
        <div className="muse-survey">{SURVEY.replace('[product]', startup.name)}</div>
        <button className="muse-link" onClick={copySurvey}>{copied ? '✓ Copied — paste it in WhatsApp' : '📋 Copy survey'}</button>
        <div className="muse-pmf-inputs">
          {[['very', 'Very', '#10B981'], ['somewhat', 'Somewhat', '#F59E0B'], ['not', 'Not', '#EF4444']].map(([k, label, c]) => (
            <label key={k}>
              <span style={{ color: c }}>{label}</span>
              <input className="input" type="number" min="0" inputMode="numeric" value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} onBlur={savePmf} />
            </label>
          ))}
        </div>
        {veryPct != null && (
          <div style={{ marginTop: 14 }}>
            <div className="muse-gauge">
              <div style={{ width: `${veryPct}%`, background: veryPct >= 40 ? '#10B981' : '#F59E0B' }} />
              <span className="muse-gauge-mark" style={{ left: '40%' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}><span>0%</span><span>40% target</span><span>100%</span></div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: veryPct >= 40 ? 'var(--green)' : 'var(--text)' }}>
              {veryPct}% very disappointed from {total} answer{total === 1 ? '' : 's'}. {veryPct >= 40 ? 'That’s the product-market-fit signal 🎉' : `${40 - veryPct} points to go.`}
            </div>
            {total < 30 && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>Fewer than 30 answers — treat it as an early hint, not proof.</div>}
          </div>
        )}
      </section>

      {/* ── Retention ── */}
      <section className="card muse-card">
        <div className="muse-label">📉 RETENTION</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 10px', lineHeight: 1.5 }}>Of users who joined in the same week, what % still use it after 1, 4 and 8 weeks? A curve that flattens means a core group stays.</div>
        <div className="muse-pmf-inputs">
          {[['ret1', 'Week 1 %'], ['ret4', 'Week 4 %'], ['ret8', 'Week 8 %']].map(([k, label]) => (
            <label key={k}>
              <span>{label}</span>
              <input className="input" type="number" min="0" max="100" inputMode="numeric" value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} onBlur={savePmf} />
            </label>
          ))}
        </div>
        {rets.length > 0 && (
          <>
            <div className="muse-ret">
              {[['Start', 100], ...rets].map(([label, v]) => (
                <div key={label} className="muse-ret-col">
                  <div className="muse-ret-bar"><div style={{ height: `${Math.min(100, n(v))}%` }} /></div>
                  <span className="font-num">{n(v)}%</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            {form.ret4 !== '' && form.ret8 !== '' && (
              <div style={{ fontSize: 12.5, marginTop: 8, color: flattening ? 'var(--green)' : 'var(--yellow)' }}>
                {flattening ? '✓ Your curve is flattening — a core group sticks around.' : '⚠ Still dropping between week 4 and 8 — find out why people leave before spending on growth.'}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Stage gates ── */}
      <section className="card muse-card">
        <div className="muse-label">🚦 STAGE CHECKLISTS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {STAGES.filter((s) => PLAYBOOK[s.id]).map((s) => {
            const g = PLAYBOOK[s.id].gate;
            const done = g.filter((_, i) => startup.gates?.[s.id]?.[i]).length;
            return (
              <button key={s.id} type="button" className="muse-gate-row" onClick={() => onOpenPlaybook(s.id)}>
                <span style={{ width: 22 }}>{s.emoji}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <b style={{ color: s.id === currentStage.id ? s.color : 'var(--text)' }}>{s.label}{s.id === currentStage.id ? ' · now' : ''}</b>
                    <span className="font-num" style={{ color: done === g.length ? 'var(--green)' : 'var(--text-3)' }}>{done}/{g.length}</span>
                  </span>
                  <ScoreBar value={done} max={g.length} color={s.color} />
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
