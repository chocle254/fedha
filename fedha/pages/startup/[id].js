import { useState, useEffect, useRef } from 'react';
import { fireConfetti } from '../../lib/confetti';
import { genId, todayISO, localISO } from '../../lib/utils';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { useApp } from '../../context/AppContext';

// Stage definitions — each stage has fields revealed when you open it.
const STAGES = [
  {
    id: 'ideation', label: 'Ideation', emoji: '💡', color: '#F59E0B',
    blurb: 'Define the problem and validate that it is worth solving.',
    fields: [
      { key: 'problem', label: 'The Problem', placeholder: 'What painful problem are you solving? Who has it?' },
      { key: 'solution', label: 'The Solution', placeholder: 'How does your idea solve it?' },
      { key: 'project', label: 'The Project', placeholder: 'What exactly are you building? Scope & name.' },
      { key: 'validation', label: 'Problem Validation', placeholder: 'Evidence the problem is real — interviews, signups, data…' },
    ],
  },
  {
    id: 'prototyping', label: 'Prototyping', emoji: '🛠️', color: '#3B82F6',
    blurb: 'Build something testable and learn fast.',
    fields: [
      { key: 'tech_stack', label: 'Tech Stack', placeholder: 'Languages, frameworks, tools' },
      { key: 'key_features', label: 'Key Features', placeholder: 'Core features the prototype must show' },
      { key: 'prototype_link', label: 'Prototype / Demo Link', placeholder: 'Figma, repo, or live link' },
      { key: 'learnings', label: 'Learnings', placeholder: 'What did testing the prototype teach you?' },
    ],
  },
  {
    id: 'mvp', label: 'MVP', emoji: '🚀', color: '#10B981',
    blurb: 'Ship the smallest thing real users can use.',
    fields: [
      { key: 'launch_status', label: 'Launch Status', placeholder: 'Not launched / Beta / Live' },
      { key: 'target_users', label: 'Target Users', placeholder: 'Who are the first users?' },
      { key: 'metrics', label: 'Key Metrics', placeholder: 'Signups, retention, revenue…' },
      { key: 'next_steps', label: 'Next Steps', placeholder: 'What comes after the MVP?' },
    ],
  },
  {
    id: 'pmf', label: 'Product-Market Fit', emoji: '🎯', color: '#8B5CF6',
    blurb: 'Refine based on user feedback until retention is strong.',
    fields: [
      { key: 'retention_metrics', label: 'Retention Metrics', placeholder: 'DAU/MAU, churn rate, retention curves' },
      { key: 'user_feedback', label: 'User Feedback Insights', placeholder: 'Key patterns from user interviews & support' },
      { key: 'product_changes', label: 'Product Changes', placeholder: 'Major pivots or refinements made' },
      { key: 'market_fit_signals', label: 'Market Fit Signals', placeholder: 'How do you know you have PMF? (e.g. viral coefficient, NPS score)' },
    ],
  },
  {
    id: 'growth', label: 'Growth / Scaling', emoji: '📈', color: '#EC4899',
    blurb: 'Marketing, partnerships, hiring.',
    fields: [
      { key: 'marketing_strategy', label: 'Marketing Strategy', placeholder: 'Channels: organic, paid, partnerships, referral…' },
      { key: 'team_size', label: 'Team Size & Hires', placeholder: 'Who have you hired? What roles still needed?' },
      { key: 'partnerships', label: 'Key Partnerships', placeholder: 'Strategic alliances or integrations' },
      { key: 'growth_metrics', label: 'Growth Metrics', placeholder: 'MoM growth rate, CAC, LTV, paid channel ROI' },
    ],
  },
  {
    id: 'revenue', label: 'Revenue & Monetization', emoji: '💰', color: '#06B6D4',
    blurb: 'Sustainable business model.',
    fields: [
      { key: 'revenue_model', label: 'Revenue Model', placeholder: 'Freemium, subscription, transaction fees, licensing…' },
      { key: 'pricing_strategy', label: 'Pricing Strategy', placeholder: 'Tiers, pricing, discounts, enterprise deals' },
      { key: 'current_arr', label: 'Current ARR / Revenue', placeholder: 'Annual Recurring Revenue or MRR' },
      { key: 'unit_economics', label: 'Unit Economics', placeholder: 'Gross margin, CAC payback period, LTV:CAC ratio' },
    ],
  },
  {
    id: 'expansion', label: 'Expansion', emoji: '🌍', color: '#14B8A6',
    blurb: 'New markets, features, or geographies.',
    fields: [
      { key: 'new_markets', label: 'New Markets / Geographies', placeholder: 'Target regions: Africa, Asia, Europe…' },
      { key: 'new_features', label: 'New Product Lines', placeholder: 'Adjacent features or new verticals' },
      { key: 'localization', label: 'Localization & Adaptation', placeholder: 'Language, culture, compliance, payment methods' },
      { key: 'expansion_timeline', label: 'Expansion Timeline', placeholder: 'Roadmap: when, where, how?' },
    ],
  },
  {
    id: 'exit', label: 'Exit / Maturity', emoji: '🏁', color: '#6366F1',
    blurb: 'Acquisition, IPO, or long-term sustainability.',
    fields: [
      { key: 'exit_strategy', label: 'Exit Strategy', placeholder: 'IPO, acquisition, stay private, wind down' },
      { key: 'acquisition_targets', label: 'Potential Acquirers', placeholder: 'Which companies might buy you?' },
      { key: 'valuation', label: 'Current Valuation', placeholder: 'Latest valuation / funding round' },
      { key: 'long_term_vision', label: 'Long-Term Vision', placeholder: 'Where do you see this in 10 years?' },
    ],
  },
];

function stageProgress(stageData, fields) {
  if (!stageData) return 0;
  const filled = fields.filter((f) => stageData[f.key]?.trim()).length;
  return Math.round((filled / fields.length) * 100);
}

// Count total filled fields across all stages
function totalProgress(stages, draftStages) {
  let total = 0, filled = 0;
  stages.forEach((s) => {
    s.fields.forEach((f) => {
      total++;
      if (draftStages[s.id]?.[f.key]?.trim()) filled++;
    });
  });
  return total > 0 ? Math.round((filled / total) * 100) : 0;
}

// Short, stage-specific nudges in plain words (not quotes) — one per day.
const NUDGES = {
  ideation: ['Talk to five people who have this problem before writing more code.', 'Write the problem in one sentence a stranger would understand.', 'Find out what people use today instead — that is your real competitor.'],
  prototyping: ['Cut the prototype to the one feature that proves the idea.', 'Put it in front of one real user this week and watch them use it.', 'Ugly and tested beats beautiful and untested.'],
  mvp: ['Ship to ten users before adding another feature.', 'Pick one number that shows people get value, and check it daily.', 'Launch before you feel ready — you learn faster live.'],
  pmf: ['Ask users how disappointed they would be if it disappeared.', 'Double down on the users who use it most, not the ones who complain loudest.', 'Retention is the truth — fix the leak before pouring in more users.'],
  growth: ['Find the one channel that works and push it hard before trying others.', 'Make it easy for happy users to bring friends.', 'Hire only for the bottleneck that is slowing you down most.'],
  revenue: ['Charge earlier than feels comfortable — payment is the best validation.', 'Know what one customer costs you to win and what they pay you.', 'Raise prices for new customers and see who still says yes.'],
  expansion: ['Win one new market fully before opening the next.', 'Talk to local users first — every market has its own payment and trust habits.', 'Expand what already works; do not rebuild from scratch.'],
  exit: ['Build the company you would want to keep, not just sell.', 'Know your numbers cold — buyers and investors will.', 'Write down what success looks like in ten years and check today against it.'],
};

// Consecutive days (ending today, or yesterday if today isn't logged yet)
// with at least one progress entry.
function streakOf(log) {
  const days = new Set((log || []).map((l) => l.date));
  const d = new Date();
  const iso = (x) => localISO(x);
  if (!days.has(todayISO())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(iso(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export default function StartupDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { startups, updateStartup } = useApp();
  const startup = startups.find((s) => s.id === id);

  const [openStage, setOpenStage] = useState('ideation');
  const [draft, setDraft] = useState({});
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [focusDraft, setFocusDraft] = useState('');
  const [focusDue, setFocusDue] = useState('');
  const [logDraft, setLogDraft] = useState('');
  const [editingMission, setEditingMission] = useState(false);
  const [missionDraft, setMissionDraft] = useState('');
  const fieldRefs = useRef({});
  const didAutoOpen = useRef(false);

  // Sync local draft from the persisted startup once it loads.
  useEffect(() => { if (startup) setDraft(startup.stages || {}); }, [startup?.id]);

  // Open the stage you're actually on (first one not finished), once.
  useEffect(() => {
    if (!startup || didAutoOpen.current) return;
    didAutoOpen.current = true;
    const cur = STAGES.find((st) => stageProgress((startup.stages || {})[st.id], st.fields) < 100);
    if (cur) setOpenStage(cur.id);
  }, [startup?.id]);

  if (!startup) {
    return (
      <Layout fab={false}>
        <div className="page" style={{ padding: '80px 20px' }}>
          <div className="empty-state"><div className="icon">💡</div><h3>Startup not found</h3><p>It may have been deleted.</p></div>
          <button className="btn-primary" onClick={() => router.push('/tech-hub')}>← Back to Tech Hub</button>
        </div>
      </Layout>
    );
  }

  function setField(stageId, key, value) {
    setDraft((d) => ({ ...d, [stageId]: { ...(d[stageId] || {}), [key]: value } }));
  }
  function saveStage(stageId) {
    updateStartup({ ...startup, stages: { ...(startup.stages || {}), [stageId]: draft[stageId] || {} } });
  }

  // ── Muse data (stored on the startup record itself) ──
  const save = (patch) => updateStartup({ ...startup, ...patch });
  const currentStageIdx = Math.max(0, STAGES.findIndex((st) => stageProgress(draft[st.id], st.fields) < 100));
  const allDone = STAGES.every((st) => stageProgress(draft[st.id], st.fields) === 100);
  const stage = STAGES[allDone ? STAGES.length - 1 : currentStageIdx];
  const nextField = allDone ? null : stage.fields.find((f) => !draft[stage.id]?.[f.key]?.trim());
  const mission = startup.mission || draft.ideation?.solution || draft.ideation?.problem || '';
  const focus = startup.focus || null;
  const focusDaysLeft = focus?.due ? Math.ceil((new Date(focus.due + 'T23:59:59') - new Date()) / 86400000) : null;
  const log = startup.log || [];
  const streak = streakOf(log);
  const last7 = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); const iso = localISO(d); return { iso, on: log.some((l) => l.date === iso), label: d.toLocaleDateString('en-GB', { weekday: 'narrow' }) }; });
  const nudgeList = NUDGES[stage.id] || NUDGES.ideation;
  const nudge = nudgeList[new Date().getDate() % nudgeList.length];

  function setFocus() {
    if (!focusDraft.trim()) return;
    const due = focusDue || (() => { const d = new Date(); d.setDate(d.getDate() + 7); return localISO(d); })();
    save({ focus: { text: focusDraft.trim(), due, done: false, set_at: todayISO() } });
    setFocusDraft(''); setFocusDue('');
  }
  function completeFocus() {
    const entry = { id: genId(), date: todayISO(), text: `✅ Commitment done: ${focus.text}` };
    save({ focus: { ...focus, done: true, done_at: todayISO() }, log: [entry, ...log].slice(0, 200), wins: (startup.wins || 0) + 1 });
    try { fireConfetti({ count: 140 }); } catch {}
  }
  function addLog() {
    if (!logDraft.trim()) return;
    save({ log: [{ id: genId(), date: todayISO(), text: logDraft.trim() }, ...log].slice(0, 200) });
    setLogDraft('');
  }
  function goToNextField() {
    setOpenStage(stage.id);
    setTimeout(() => {
      const el = fieldRefs.current[`${stage.id}.${nextField.key}`];
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
    }, 60);
  }

  // Generate AI analysis and search for similar apps
  async function generateAnalysis() {
    setLoadingAnalysis(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'startup_analysis',
          startup: {
            name: startup.name,
            accelerator: startup.accelerator,
            stages: draft,
          },
        }),
      });
      const data = await res.json();
      setAnalysis(data.analysis);
      setShowAnalysis(true);
    } catch (err) {
      console.error('Analysis error:', err);
      alert('Failed to generate analysis');
    } finally {
      setLoadingAnalysis(false);
    }
  }

  const totalPct = totalProgress(STAGES, draft);

  return (
    <Layout fab={false}>
      <div className="page">
        <div className="page-top" style={{ padding: '52px 20px 0' }}>
          <button onClick={() => router.push('/tech-hub')} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 16, fontFamily: 'Outfit' }}>← Tech Hub</button>
          <div className="muse-hero" style={{ '--stage': stage.color }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="muse-hero-icon">{stage.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{startup.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
                  {allDone ? 'Every stage mapped 🏁' : `Stage ${currentStageIdx + 1} of ${STAGES.length} · ${stage.label}`}{startup.accelerator ? ` · 🏛 ${startup.accelerator}` : ''}
                </div>
              </div>
              <div className="muse-hero-pct">{totalProgress(STAGES, draft)}%</div>
            </div>

            {/* The journey as a path of 8 steps */}
            <div className="muse-path" aria-label="Startup journey">
              {STAGES.map((st, i) => {
                const pct = stageProgress(draft[st.id], st.fields);
                const state = pct === 100 ? 'done' : i === currentStageIdx && !allDone ? 'now' : 'todo';
                return (
                  <button key={st.id} type="button" className={`muse-step muse-step-${state}`} style={{ '--c': st.color }} onClick={() => setOpenStage(st.id)} title={`${st.label} — ${pct}%`}>
                    <span>{state === 'done' ? '✓' : st.emoji}</span>
                  </button>
                );
              })}
            </div>

            {/* North star */}
            <div className="muse-northstar">
              <div className="muse-label">⭐ NORTH STAR</div>
              {editingMission ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input className="input" autoFocus value={missionDraft} onChange={(e) => setMissionDraft(e.target.value)} placeholder="One sentence: who you help and how" style={{ flex: 1 }} />
                  <button className="btn-primary" style={{ width: 'auto', padding: '0 14px' }} onClick={() => { save({ mission: missionDraft.trim() }); setEditingMission(false); }}>Save</button>
                </div>
              ) : (
                <button type="button" className="muse-mission" onClick={() => { setMissionDraft(mission); setEditingMission(true); }}>
                  {mission || 'Tap to write your mission in one sentence — the reason this exists.'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* This week's commitment */}
          <div className="card muse-card">
            <div className="muse-label">🎯 THIS WEEK'S COMMITMENT</div>
            {focus && !focus.done ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, margin: '8px 0 4px', lineHeight: 1.35 }}>{focus.text}</div>
                <div style={{ fontSize: 12, color: focusDaysLeft != null && focusDaysLeft <= 1 ? 'var(--red)' : 'var(--text-3)' }}>
                  {focusDaysLeft == null ? '' : focusDaysLeft < 0 ? `${-focusDaysLeft} day${focusDaysLeft === -1 ? '' : 's'} overdue — finish it or reset it honestly.` : focusDaysLeft === 0 ? 'Due today.' : `${focusDaysLeft} day${focusDaysLeft === 1 ? '' : 's'} left.`}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn-primary" style={{ flex: 1 }} onClick={completeFocus}>✓ I did it</button>
                  <button className="btn-ghost" style={{ width: 'auto', padding: '0 14px' }} onClick={() => save({ focus: null })}>Change</button>
                </div>
              </>
            ) : (
              <>
                {focus?.done && <div style={{ fontSize: 13, color: 'var(--green)', margin: '8px 0 2px' }}>Last one done: {focus.text} 🎉</div>}
                <div style={{ fontSize: 12, color: 'var(--text-3)', margin: '6px 0 10px' }}>One concrete thing you'll finish in the next 7 days. Small and done beats big and vague.</div>
                <input className="input" placeholder={nextField ? `e.g. ${nextField.placeholder.split('?')[0].slice(0, 60)}` : 'e.g. Interview 5 potential users'} value={focusDraft} onChange={(e) => setFocusDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setFocus()} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input className="input" type="date" value={focusDue} onChange={(e) => setFocusDue(e.target.value)} style={{ flex: 1 }} aria-label="Due date (default 7 days)" />
                  <button className="btn-primary" style={{ width: 'auto', padding: '0 16px' }} disabled={!focusDraft.trim()} onClick={setFocus}>Commit</button>
                </div>
              </>
            )}
            {(startup.wins || 0) > 0 && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 10 }}>🏆 {startup.wins} commitment{startup.wins === 1 ? '' : 's'} kept so far</div>}
          </div>

          {/* Next move */}
          {nextField && (
            <button type="button" className="card muse-card muse-next" style={{ '--stage': stage.color }} onClick={goToNextField}>
              <div className="muse-label">👉 YOUR NEXT MOVE</div>
              <div style={{ fontSize: 15, fontWeight: 700, margin: '8px 0 4px' }}>{stage.label}: {nextField.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{nextField.placeholder}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: stage.color, marginTop: 10 }}>Answer it now →</div>
            </button>
          )}

          {/* Momentum */}
          <div className="card muse-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="muse-label">🔥 MOMENTUM</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: streak ? 'var(--yellow)' : 'var(--text-3)' }}>{streak ? `${streak}-day streak` : 'No streak yet'}</div>
            </div>
            <div className="muse-week">
              {last7.map((d) => <div key={d.iso} className={`muse-day${d.on ? ' on' : ''}`}><span>{d.label}</span></div>)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" placeholder="What did you move forward today?" value={logDraft} onChange={(e) => setLogDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLog()} style={{ flex: 1 }} />
              <button className="btn-primary" style={{ width: 'auto', padding: '0 14px' }} disabled={!logDraft.trim()} onClick={addLog}>Log</button>
            </div>
            {log.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {log.slice(0, 4).map((l) => (
                  <div key={l.id} style={{ display: 'flex', gap: 10, fontSize: 12, lineHeight: 1.45 }}>
                    <span className="font-num" style={{ color: 'var(--text-3)', flexShrink: 0, width: 44 }}>{l.date.slice(5).split('-').reverse().join('/')}</span>
                    <span style={{ color: 'var(--text-2)' }}>{l.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Daily nudge */}
          <div className="muse-nudge" style={{ '--stage': stage.color }}>
            <span style={{ fontSize: 18 }}>💡</span>
            <span>{nudge}</span>
          </div>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Journey timeline */}
          <div className="section-title" style={{ marginBottom: 12 }}>Startup Journey</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {STAGES.map((stage, idx) => {
              const open = openStage === stage.id;
              const pct = stageProgress(draft[stage.id], stage.fields);
              return (
                <div key={stage.id} className="card" style={{ padding: 0, overflow: 'hidden', borderColor: open ? stage.color : 'var(--border)' }}>
                  <button onClick={() => setOpenStage(open ? null : stage.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: `${stage.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{stage.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                        <span style={{ color: stage.color }}>{idx + 1}.</span> {stage.label}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{stage.blurb}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? 'var(--green)' : 'var(--text-3)' }}>{pct}%</div>
                      <div style={{ fontSize: 16, color: 'var(--text-3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</div>
                    </div>
                  </button>

                  {open && (
                    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {stage.fields.map((f) => (
                        <div key={f.key}>
                          <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{f.label}</label>
                          <textarea
                            ref={(el) => { fieldRefs.current[`${stage.id}.${f.key}`] = el; }}
                            className="input"
                            placeholder={f.placeholder}
                            value={draft[stage.id]?.[f.key] || ''}
                            onChange={(e) => setField(stage.id, f.key, e.target.value)}
                            rows={2}
                            style={{ resize: 'vertical', minHeight: 56, lineHeight: 1.5 }}
                          />
                        </div>
                      ))}
                      <button className="btn-secondary" onClick={() => saveStage(stage.id)} style={{ marginTop: 8 }}>Save Stage</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Analysis section */}
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Progress & Analysis</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: totalPct === 100 ? 'var(--green)' : 'var(--text-2)' }}>{totalPct}%</div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', height: 8, background: 'var(--bg-2)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${totalPct}%`, background: 'linear-gradient(90deg, #F59E0B, #3B82F6, #10B981, #8B5CF6)', transition: 'width 0.3s' }} />
            </div>

            <button className="btn-primary" onClick={generateAnalysis} disabled={totalPct < 25 || loadingAnalysis}
              style={{ width: '100%', background: '#6366F1', cursor: totalPct < 25 ? 'not-allowed' : 'pointer', opacity: totalPct < 25 ? 0.5 : 1 }}>
              {loadingAnalysis ? '🔄 Analyzing…' : '✨ Get AI Analysis'}
            </button>

            {totalPct < 25 && (
              <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>Fill at least 25% of the journey to unlock analysis</div>
            )}
          </div>

          {showAnalysis && analysis && (
            <div style={{ marginTop: 20 }}>
              <button onClick={() => setShowAnalysis(false)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 12 }}>← Hide Analysis</button>
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Strengths */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>✓ Why This Is a Good Idea</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{analysis.strengths}</div>
                </div>

                {/* Risks */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#EF4444', marginBottom: 8 }}>⚠️ Why This Could Be Risky</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{analysis.risks}</div>
                </div>

                {/* Competitors */}
                {analysis.competitors && analysis.competitors.length > 0 && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>🏆 Similar Apps & Your Competitive Edge</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {analysis.competitors.map((comp, idx) => (
                        <div key={idx} style={{ padding: 10, background: 'var(--bg-2)', borderRadius: 10, borderLeft: '3px solid var(--blue)' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{comp.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{comp.description}</div>
                          <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 6, fontStyle: 'italic' }}>Your edge: {comp.your_edge}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Next Actions */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>→ Recommended Next Steps</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{analysis.next_steps}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
