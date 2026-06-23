import { useState } from 'react';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import BeautyCamera from '../components/BeautyCamera';
import { useApp } from '../context/AppContext';

const PINK = '#EC4899';

const AREAS = [
  { id: 'skin', label: 'Skin & Face', emoji: '🧴' },
  { id: 'teeth', label: 'Teeth & Smile', emoji: '🦷' },
  { id: 'hair', label: 'Hair & Scalp', emoji: '💇' },
];

function scoreColor(s) {
  if (s >= 70) return 'var(--green)';
  if (s >= 45) return '#F59E0B';
  return 'var(--red)';
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

// ─── ONE AREA RESULT CARD ──────────────────────────────────────────────────────
function AreaCard({ area, data }) {
  if (!data) return null;
  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 24 }}>{area.emoji}</span>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{area.label}</div>
        {data.type && (
          <span style={{ marginLeft: 'auto', background: 'rgba(236,72,153,0.12)', border: '1px solid rgba(236,72,153,0.3)', color: PINK, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100, textTransform: 'capitalize' }}>
            {data.type}
          </span>
        )}
      </div>

      {data.observation && (
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 12 }}>{data.observation}</div>
      )}

      {Array.isArray(data.concerns) && data.concerns.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {data.concerns.map((c, i) => (
            <span key={i} style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 11, padding: '3px 10px', borderRadius: 100 }}>{c}</span>
          ))}
        </div>
      )}

      {Array.isArray(data.routine) && data.routine.length > 0 && (
        <div style={{ marginBottom: data.products?.length ? 12 : 0 }}>
          <div className="section-title" style={{ marginBottom: 8 }}>YOUR ROUTINE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.routine.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'rgba(236,72,153,0.15)', color: PINK, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(data.products) && data.products.length > 0 && (
        <div>
          <div className="section-title" style={{ marginBottom: 8 }}>WHAT TO USE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.products.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                <span style={{ color: PINK }}>•</span>{p}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FULL ANALYSIS VIEW ─────────────────────────────────────────────────────────
function AnalysisView({ analysis, areas }) {
  const sc = Number(analysis.score) || 0;
  const col = scoreColor(sc);
  return (
    <div>
      {/* Score + overall */}
      <div className="hero-card" style={{ padding: '22px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
          <svg viewBox="0 0 120 120" style={{ width: 84, height: 84, transform: 'rotate(-90deg)' }}>
            <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
            <circle cx="60" cy="60" r="50" fill="none" stroke={col} strokeWidth="10" strokeDasharray={`${sc * 3.14} ${314 - sc * 3.14}`} strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="font-num" style={{ fontSize: 22, fontWeight: 700, color: col }}>{sc}</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'rgba(237,242,255,0.5)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Self-Care Score</div>
          <div style={{ fontSize: 13, color: 'rgba(237,242,255,0.85)', lineHeight: 1.5 }}>{analysis.overall}</div>
        </div>
      </div>

      {AREAS.filter((a) => areas.includes(a.id)).map((a) => (
        <AreaCard key={a.id} area={a} data={analysis[a.id]} />
      ))}
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────────────────────────────────
export default function BeautyPage() {
  const { beautyLogs, addBeautyLog, removeBeautyLog } = useApp();
  const [showTxn, setShowTxn] = useState(false);

  const [selectedAreas, setSelectedAreas] = useState(['skin', 'teeth', 'hair']);
  const [showCamera, setShowCamera] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [saved, setSaved] = useState(false);
  const [viewing, setViewing] = useState(null); // a saved log being viewed

  function toggleArea(id) {
    setSelectedAreas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function analyze(image) {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setSaved(false);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'beauty_analysis', image, areas: selectedAreas }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalysis(data.analysis);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCapture(image) {
    setPhoto(image);
    setShowCamera(false);
    analyze(image);
  }

  function reset() {
    setPhoto(null);
    setAnalysis(null);
    setError(null);
    setSaved(false);
  }

  async function saveCheckIn() {
    if (!analysis) return;
    await addBeautyLog({
      photo,
      analysis,
      areas: selectedAreas,
      score: Number(analysis.score) || 0,
    });
    setSaved(true);
  }

  const lastScore = beautyLogs[0]?.score;
  const prevScore = beautyLogs[1]?.score;
  const trend = lastScore != null && prevScore != null ? lastScore - prevScore : null;

  return (
    <Layout onFab={() => setShowTxn(true)}>
      <div className="page">
        {/* Header */}
        <div style={{ padding: '52px 20px 0' }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Beauty & Self-Care 💆</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Scan your face for a tailored skin, teeth & hair routine</div>
          </div>
        </div>

        <div style={{ padding: '0 20px 24px' }}>
          {/* ── CAPTURE / ANALYZE FLOW ─────────────────────────────── */}
          {!analysis && !loading && (
            <>
              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div className="section-title" style={{ marginBottom: 10 }}>WHAT TO CHECK</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {AREAS.map((a) => {
                    const on = selectedAreas.includes(a.id);
                    return (
                      <button key={a.id} onClick={() => toggleArea(a.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 100, cursor: 'pointer', fontFamily: 'Outfit', fontSize: 13, fontWeight: 600,
                          background: on ? 'rgba(236,72,153,0.12)' : 'var(--card-2)',
                          border: `1px solid ${on ? 'rgba(236,72,153,0.4)' : 'var(--border)'}`,
                          color: on ? PINK : 'var(--text-3)' }}>
                        <span>{a.emoji}</span>{a.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {photo && (
                <img src={photo || "/placeholder.svg"} alt="Your captured selfie" style={{ width: '100%', borderRadius: 14, marginBottom: 16, transform: 'scaleX(-1)' }} />
              )}

              {error && (
                <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--red)', marginBottom: 16, lineHeight: 1.5 }}>
                  ⚠ {error}
                  {error.includes('GROQ_API_KEY') && <div style={{ marginTop: 6, color: 'var(--text-3)' }}>Add GROQ_API_KEY to your environment variables to enable AI analysis.</div>}
                </div>
              )}

              <button className="btn-primary" onClick={() => setShowCamera(true)} disabled={selectedAreas.length === 0}
                style={{ background: PINK, marginBottom: photo ? 10 : 0 }}>
                {photo ? '📸 Retake & Analyze' : '📸 Scan My Face'}
              </button>

              {photo && !error && (
                <button onClick={() => analyze(photo)} className="btn-primary" style={{ background: 'var(--card-2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                  ✨ Analyze This Photo Again
                </button>
              )}
            </>
          )}

          {/* ── LOADING ─────────────────────────────────────────────── */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              {photo && <img src={photo || "/placeholder.svg"} alt="Analyzing" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: '50%', marginBottom: 20, transform: 'scaleX(-1)', opacity: 0.8 }} />}
              <div style={{ fontSize: 40, marginBottom: 14, animation: 'spin 1s linear infinite', display: 'inline-block' }}>✨</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Reading your photo…</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>Building your personalized routine</div>
            </div>
          )}

          {/* ── RESULTS ─────────────────────────────────────────────── */}
          {analysis && !loading && (
            <>
              {photo && (
                <img src={photo || "/placeholder.svg"} alt="Your selfie" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 14, marginBottom: 16, transform: 'scaleX(-1)' }} />
              )}
              <AnalysisView analysis={analysis} areas={selectedAreas} />

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                {!saved ? (
                  <button className="btn-primary" onClick={saveCheckIn} style={{ background: PINK, flex: 2 }}>
                    💾 Save This Check-In
                  </button>
                ) : (
                  <div style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, color: 'var(--green)', fontSize: 14, fontWeight: 700 }}>
                    ✓ Saved
                  </div>
                )}
                <button onClick={reset} className="btn-primary" style={{ flex: 1, background: 'var(--card-2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                  New Scan
                </button>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
                This is general grooming guidance, not medical advice. For persistent skin, dental or hair-loss issues, see a professional.
              </div>
            </>
          )}

          {/* ── PROGRESS / HISTORY ──────────────────────────────────── */}
          {beautyLogs.length > 0 && !loading && (
            <div style={{ marginTop: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="section-title" style={{ marginBottom: 0 }}>YOUR PROGRESS</div>
                {trend != null && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: trend >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)} pts vs last
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {beautyLogs.map((log) => (
                  <button key={log.id} onClick={() => setViewing(log)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit' }}>
                    {log.photo ? (
                      <img src={log.photo || "/placeholder.svg"} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover', transform: 'scaleX(-1)', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>💆</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmtDate(log.created_at)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.analysis?.overall || 'Check-in'}</div>
                    </div>
                    <div className="font-num" style={{ fontSize: 18, fontWeight: 700, color: scoreColor(log.score), flexShrink: 0 }}>{log.score}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Camera overlay */}
      {showCamera && <BeautyCamera onCapture={handleCapture} onClose={() => setShowCamera(false)} />}

      {/* View saved log */}
      {viewing && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setViewing(null)}>
          <div className="modal-sheet" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
            <div className="modal-header">
              <span style={{ fontSize: 16, fontWeight: 700 }}>{fmtDate(viewing.created_at)}</span>
              <button className="btn-icon" onClick={() => setViewing(null)} aria-label="Close">✕</button>
            </div>
            <div className="modal-body">
              {viewing.photo && (
                <img src={viewing.photo || "/placeholder.svg"} alt="Saved selfie" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 14, transform: 'scaleX(-1)' }} />
              )}
              {viewing.analysis && <AnalysisView analysis={viewing.analysis} areas={viewing.areas || ['skin', 'teeth', 'hair']} />}
              <button onClick={() => { removeBeautyLog(viewing.id); setViewing(null); }}
                style={{ width: '100%', padding: 12, background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, color: 'var(--red)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit' }}>
                🗑 Delete This Check-In
              </button>
            </div>
          </div>
        </div>
      )}

      {showTxn && <TransactionModal onClose={() => setShowTxn(false)} />}
    </Layout>
  );
}
