import { useState, useEffect } from 'react';
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

  // Sync local draft from the persisted startup once it loads.
  useEffect(() => { if (startup) setDraft(startup.stages || {}); }, [startup?.id]);

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
        <div style={{ padding: '52px 20px 0' }}>
          <button onClick={() => router.push('/tech-hub')} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 16, fontFamily: 'Outfit' }}>← Tech Hub</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--green-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>💡</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{startup.name}</div>
              {startup.accelerator && <div style={{ fontSize: 13, color: 'var(--text-3)' }}>🏛 {startup.accelerator}</div>}
            </div>
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
                            className="input"
                            placeholder={f.placeholder}
                            value={draft[stage.id]?.[f.key] || ''}
                            onChange={(e) => setField(stage.id, f.key, e.target.value)}
                            rows={2}
                            style={{ resize: 'vertical', minHeight: 56, lineHeight: 1.5 }}
                          />
                        </div>
              ))}
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
