import Layout from '../components/Layout';

export default function TradingPage() {
  return (
    <Layout fab={false}>
      <div className="page" style={{ padding: '24px 20px 100px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>BUSINESS · BINANCE</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Trading</h1>
        <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>Your future Binance trading workspace. We're connecting and verifying portfolio balances before enabling real orders.</p>
        <div className="card" style={{ padding: 18, marginTop: 18, borderColor: 'rgba(245,158,11,.3)' }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>Trading is not enabled yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>This page does not place orders. First we'll verify your Spot balance connection, then add order previews, explicit confirmation, order-status checks, and safe API permission handling.</div>
        </div>
        <a href="/binance" className="btn-primary" style={{ display: 'inline-flex', marginTop: 16, textDecoration: 'none', padding: '12px 16px', borderRadius: 10 }}>View Binance portfolio →</a>
      </div>
    </Layout>
  );
}
