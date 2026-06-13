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
];

function stageProgress(stageData, fields) {
  if (!stageData) return 0;
  const filled = fields.filter((f) => stageData[f.key]?.trim()).length;
  return Math.round((filled / fields.length) * 100);
}

export default function StartupDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { startups, updateStartup } = useApp();
  const startup = startups.find((s) => s.id === id);

  const [openStage, setOpenStage] = useState('ideation');
  const [draft, setDraft] = useState({});

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
                      <button className="btn-primary" style={{ background: stage.color }} onClick={() => saveStage(stage.id)}>
                        Save {stage.label}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Layout>
  );
}
