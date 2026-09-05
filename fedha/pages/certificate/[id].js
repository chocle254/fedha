import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

const RANK_STYLE = {
  '1st Place': { ribbon: '🥇', color: '#F5C56B' },
  '2nd Place': { ribbon: '🥈', color: '#C7CDD8' },
  '3rd Place': { ribbon: '🥉', color: '#CD8B5C' },
  'Winner': { ribbon: '🏆', color: '#F5C56B' },
};
function rankMeta(a) { return RANK_STYLE[a] || { ribbon: '🎖️', color: '#8496B8' }; }

export default function PublicCertificatePage() {
  const router = useRouter();
  const { id } = router.query;
  const [cert, setCert] = useState(undefined); // undefined = loading, null = not found
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/certificate/${id}`)
      .then(async (r) => {
        if (!r.ok) { const body = await r.json().catch(() => ({})); throw new Error(body.error || 'Not found'); }
        return r.json();
      })
      .then(setCert)
      .catch((e) => { setErr(e.message); setCert(null); });
  }, [id]);

  return (
    <div style={{ minHeight: '100vh', background: '#080C18', color: '#EDF2FF', fontFamily: 'Outfit, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
        <span style={{ fontSize: 22 }}>⚡</span>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>FEDHA TECH HUB</span>
      </div>

      {cert === undefined && <div style={{ color: '#8496B8', fontSize: 14 }}>Verifying certificate…</div>}

      {cert === null && (
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Certificate Not Found</div>
          <div style={{ fontSize: 13, color: '#8496B8' }}>{err || "This certificate doesn't exist or the link is incorrect."}</div>
        </div>
      )}

      {cert && (
        <div style={{ width: '100%', maxWidth: 460 }}>
          <div style={{
            position: 'relative', borderRadius: 16, padding: 4,
            border: '1px solid rgba(245,197,107,0.35)',
            background: 'linear-gradient(160deg, #1a1710 0%, #0e0d09 100%)',
            boxShadow: '0 20px 45px -20px rgba(0,0,0,0.6)',
          }}>
            {cert.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cert.image} alt={cert.title} style={{ width: '100%', borderRadius: 12, display: 'block' }} />
            ) : (
              <div style={{ padding: 28, textAlign: 'center', borderRadius: 12, background: 'linear-gradient(160deg, #0E1525 0%, #080C18 100%)', border: '1px solid rgba(245,197,107,0.25)' }}>
                <div style={{ fontSize: 11, color: '#3D5070', letterSpacing: 2, textTransform: 'uppercase' }}>Certificate of Achievement</div>
                <div style={{ fontSize: 10, color: '#3D5070', marginTop: 10 }}>Proudly presented to</div>
                <div style={{ fontFamily: 'Outfit, cursive', fontSize: 28, fontWeight: 700, marginTop: 8 }}>{cert.recipient_name}</div>
                <div style={{ fontSize: 12, color: '#8496B8', marginTop: 12, padding: '0 10px', lineHeight: 1.6 }}>
                  {cert.description || `For achieving ${cert.achievement} in ${cert.title}.`}
                </div>
                <div style={{ width: 44, height: 44, margin: '16px auto 0', borderRadius: '50%', background: 'rgba(245,197,107,0.15)', border: '1px solid rgba(245,197,107,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                  {rankMeta(cert.achievement).ribbon}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 20, background: '#182032', border: '1px solid #1F2D45', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 14, color: '#10B981', fontWeight: 700 }}>✓ Verified Certificate</span>
            </div>
            {[
              ['Certificate ID', cert.id],
              ['Event', cert.title],
              ['Achievement', cert.achievement],
              ['Date Earned', cert.date_earned ? new Date(cert.date_earned).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'],
              ['Issued By', cert.organization],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #1F2D45', fontSize: 13 }}>
                <span style={{ color: '#8496B8' }}>{label}</span>
                <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#3D5070', marginTop: 16 }}>
            Verified via Fedha Tech Hub — this is a read-only view.
          </div>
        </div>
      )}
    </div>
  );
}
