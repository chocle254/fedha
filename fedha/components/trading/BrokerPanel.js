import { useCallback, useEffect, useMemo, useState } from 'react';
import { C, fmtUsd, ago } from './util';

const STATUS = {
  pending: ['Waiting to fill', C.gold],
  open: ['Open', '#5B9BFF'],
  won: ['TP hit', C.up],
  lost: ['Stopped', C.down],
  cancelled: ['Cancelled', '#848E9C'],
  failed: ['Rejected', C.down],
};

// MT5 demo accounts (XM, LiteFinance) driven through MetaApi: balances, switches, risk and every leg placed.
export default function BrokerPanel({ onData, flash }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({});

  const apply = useCallback((j) => {
    setData(j);
    onData?.(j.trades || []);
    const d = {};
    for (const a of j.accounts || []) d[a.key] = { risk_pct: String(a.settings?.risk_pct ?? 1), min_confidence: String(a.settings?.min_confidence ?? 0), daily_loss_pct: String(a.settings?.daily_loss_pct ?? 5) };
    setDraft(d);
  }, [onData]);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/trading/brokers', { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) apply(j); else setData({ error: j.error });
    } catch { setData({ error: 'Could not load the MT5 accounts.' }); }
  }, [apply]);
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);

  async function save(body) {
    setBusy(true);
    try {
      const r = await fetch('/api/trading/brokers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not save.');
      apply(j);
      flash?.('MT5 settings saved.');
    } catch (e) { flash?.(e.message, true); } finally { setBusy(false); }
  }
  async function sync() {
    setBusy(true);
    try {
      const r = await fetch('/api/trading/brokers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }) });
      const j = await r.json();
      if (r.ok) apply(j);
      flash?.(j.error ? j.error : `Checked ${j.checked || 0} open legs.`, !!j.error);
    } catch { flash?.('Sync failed.', true); } finally { setBusy(false); }
  }

  // One card per signal per account, legs listed inside.
  const signals = useMemo(() => {
    const map = {};
    for (const t of data?.trades || []) {
      const k = `${t.account}|${t.signal_key}`;
      (map[k] = map[k] || { key: k, account: t.account, source: t.source, side: t.side, symbol: t.symbol, created_at: t.created_at, mult: t.lot_multiplier, confidence: t.confidence, risk: t.risk_usd, legs: [] }).legs.push(t);
    }
    return Object.values(map).map((g) => ({ ...g, legs: g.legs.sort((a, b) => a.leg - b.leg), profit: g.legs.reduce((s, l) => s + Number(l.profit || 0), 0), live: g.legs.some((l) => ['pending', 'open'].includes(l.status)) }))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [data]);

  if (!data) return <div className="tx-empty">Loading MT5 accounts…</div>;
  if (data.error) return <div className="tx-empty">{data.error}</div>;
  if (!data.configured) {
    return (
      <div className="tx-empty" style={{ textAlign: 'left', lineHeight: 1.6 }}>
        <b>Connect your MT5 demo accounts</b><br />
        1. In metaapi.cloud add your XM and LiteFinance MT5 logins (Accounts → Add account).<br />
        2. In Vercel → Settings → Environment Variables add <code>METAAPI_TOKEN</code>, <code>METAAPI_XM_ACCOUNT_ID</code> and <code>METAAPI_LITEFINANCE_ACCOUNT_ID</code>, then redeploy.<br />
        3. Run <code>supabase-migration-broker-trades.sql</code> in Supabase.
      </div>
    );
  }

  const name = (k) => data.accounts.find((a) => a.key === k)?.name || k;
  return (
    <div className="tx-brokers">
      {data.accounts.map((a) => {
        const s = a.settings || {};
        const d = draft[a.key] || {};
        return (
          <div key={a.key} className="tx-broker">
            <div className="tx-group-top">
              <b>{a.name}{a.info ? ` · ${a.info.login}` : ''}</b>
              {a.info && <span className="tx-badge" style={{ color: a.info.real ? C.down : C.up, background: 'rgba(132,142,156,.12)' }}>{a.info.real ? 'REAL MONEY' : 'DEMO'}</span>}
            </div>
            {!a.configured && <div className="tx-muted">Not connected: add its MetaApi account id to Vercel.</div>}
            {a.error && <div className="tx-muted" style={{ color: C.down }}>{a.error}</div>}
            {a.info && (
              <div className="tx-muted font-num">
                {a.info.server} · balance {fmtUsd(a.info.balance, false)} · equity {fmtUsd(a.info.equity, false)} · 1:{a.info.leverage}
                {a.info.real && !data.settings.allow_real ? ' · real trading is OFF, so nothing will be placed here' : ''}
              </div>
            )}
            {a.configured && (
              <>
                <div className="tx-set-row">
                  <div><b>Trade signals here</b><span>{s.enabled ? 'On: every new signal is placed on this account.' : 'Off'}</span></div>
                  <button disabled={busy} className={`tx-switch ${s.enabled ? 'on' : ''}`} onClick={() => save({ [a.key]: { enabled: !s.enabled } })} aria-label={`Trade on ${a.name}`}><i /></button>
                </div>
                <label className="tx-field"><span>Base risk per signal</span><input className="font-num" inputMode="decimal" value={d.risk_pct || ''} onChange={(e) => setDraft({ ...draft, [a.key]: { ...d, risk_pct: e.target.value } })} /><em>% of balance</em></label>
                <label className="tx-field"><span>Only channels at least</span><input className="font-num" inputMode="numeric" value={d.min_confidence || ''} onChange={(e) => setDraft({ ...draft, [a.key]: { ...d, min_confidence: e.target.value } })} /><em>% confident</em></label>
                <label className="tx-field"><span>Stop for the day after losing</span><input className="font-num" inputMode="decimal" value={d.daily_loss_pct || ''} onChange={(e) => setDraft({ ...draft, [a.key]: { ...d, daily_loss_pct: e.target.value } })} /><em>% (0 = off)</em></label>
                <button className="tx-link" disabled={busy} onClick={() => save({ [a.key]: { risk_pct: d.risk_pct, min_confidence: d.min_confidence, daily_loss_pct: d.daily_loss_pct } })}>Save {a.name} settings</button>
              </>
            )}
          </div>
        );
      })}

      <div className="tx-broker">
        <div className="tx-set-row">
          <div><b>Smart trailing stop</b><span>After TP1, the other positions&apos; SL follows the price in the style learned for that channel (ATR-based by default). Same rules as the paper trades.</span></div>
          <button disabled={busy} className={`tx-switch ${data.settings.breakeven ? 'on' : ''}`} onClick={() => save({ breakeven: !data.settings.breakeven })} aria-label="Trailing stop"><i /></button>
        </div>
        <div className="tx-set-row">
          <div><b>Luxe paper trades too</b><span>{data.settings.paper_too ? 'On: signals are also paper-traded here.' : 'Off: the MT5 demo accounts replace Luxe paper trading.'}</span></div>
          <button disabled={busy} className={`tx-switch ${data.settings.paper_too ? 'on' : ''}`} onClick={() => save({ paper_too: !data.settings.paper_too })} aria-label="Paper too"><i /></button>
        </div>
        <p className="tx-fine">
          Each signal is split into one MT5 position per TP (MT5 allows one TP per position), all with the signal&apos;s SL. Lots = balance × base risk × the channel&apos;s lot multiplier from the report card. If the total is too small for every TP at 0.01 lots, only the first TPs are used. Limit orders that do not fill within 6 hours are cancelled. Real-money accounts are never traded unless you switch that on.
        </p>
        <button className="tx-link" disabled={busy} onClick={sync}>{busy ? 'Working…' : 'Check fills and closes now'}</button>
      </div>

      <div className="tx-sub" style={{ padding: '10px 14px 4px' }}>MT5 trades</div>
      {signals.length ? signals.map((g) => (
        <details key={g.key} className="tx-inbox">
          <summary>
            <span className="tx-badge" style={{ color: g.side === 'BUY' ? C.up : C.down, background: 'rgba(132,142,156,.12)' }}>{g.side}</span>
            <b>{g.symbol}</b>
            <span className="tx-muted">{name(g.account)} · {g.source} · {ago(g.created_at)}</span>
            <span className="tx-inbox-detail font-num" style={{ color: g.live ? '#5B9BFF' : g.profit >= 0 ? C.up : C.down }}>
              {g.live ? `${g.legs.filter((l) => ['pending', 'open'].includes(l.status)).length}/${g.legs.length} live` : `${g.profit >= 0 ? '+' : ''}${fmtUsd(g.profit, false)}`}
            </span>
          </summary>
          <div className="tx-muted" style={{ padding: '4px 14px' }}>Lot ×{g.mult} · {g.confidence}% confident · risk {fmtUsd(g.risk, false)}</div>
          {g.legs.map((l) => {
            const [label, color] = STATUS[l.status] || [l.status, '#848E9C'];
            return (
              <div key={l.id} className="tx-board-row font-num">
                <span>TP{l.leg} {l.take_profit}</span>
                <span className="tx-muted">{l.lots} lots · SL {l.stop_loss}{l.breakeven ? ' (trailed)' : ''}</span>
                <b style={{ color }}>{label}</b>
                <b style={{ color: Number(l.profit) >= 0 ? C.up : C.down }}>{l.profit != null ? `${Number(l.profit) >= 0 ? '+' : ''}${Number(l.profit).toFixed(2)}` : l.error ? '⚠' : ''}</b>
              </div>
            );
          })}
          {g.legs.some((l) => l.error) && <div className="tx-muted" style={{ padding: '4px 14px', color: C.down }}>{g.legs.find((l) => l.error).error}</div>}
        </details>
      )) : <div className="tx-empty">No MT5 trades yet. Switch an account on and the next signal will be placed there.</div>}
    </div>
  );
}
