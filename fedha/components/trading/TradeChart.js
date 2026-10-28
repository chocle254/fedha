import { useEffect, useRef, useState } from 'react';
import { REST, C, openStream, fmtPrice, fmtCompact, priceDecimals, isMt5 } from './util';

export const INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
const LABEL = { '1d': '1D', '1w': '1W' };
const TZ = -new Date().getTimezoneOffset() * 60; // show candles in local time
const toBar = (k) => ({ time: Math.floor(k[0] / 1000) + TZ, open: +k[1], high: +k[2], low: +k[3], close: +k[4] });
const toVol = (k) => ({ time: Math.floor(k[0] / 1000) + TZ, value: +k[5], color: +k[4] >= +k[1] ? 'rgba(14,203,129,.45)' : 'rgba(246,70,93,.45)' });

async function loadKlines(symbol, interval, endTime) {
  const q = `symbol=${symbol}&interval=${interval}&limit=500${endTime ? `&endTime=${endTime}` : ''}`;
  if (isMt5(symbol) && endTime) return []; // MT5 markets come from our server, newest 500 candles only
  if (!isMt5(symbol)) try {
    const r = await fetch(`${REST}/klines?${q}`, { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch { /* fall back to our server below */ }
  if (endTime) return [];
  const r = await fetch(`/api/trading/chart?symbol=${symbol}&interval=${interval}`, { cache: 'no-store' });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Could not load the chart.');
  return (j.candles || []).map((c) => [c.t, c.o, c.h, c.l, c.c, c.v || 0]);
}

// Candlestick chart in the style of TradingView: volume, OHLC legend, live updates, scroll back for more history,
// position / order / signal lines, and tap-to-pick a price for the order form.
export default function TradeChart({ symbol, interval, onInterval, lines = [], markers = [], onPickPrice }) {
  const boxRef = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const volRef = useRef(null);
  const rawRef = useRef([]);
  const lineRefs = useRef([]);
  const pickRef = useRef(onPickPrice);
  const [legend, setLegend] = useState(null);
  const [state, setState] = useState('loading');
  const [ready, setReady] = useState(0);
  const [showVol, setShowVol] = useState(true);
  pickRef.current = onPickPrice;

  useEffect(() => {
    let disposed = false;
    let stop = null;
    let poll = null;
    let loadingMore = false;
    let noMore = false;
    let chart = null;
    setState('loading');
    setLegend(null);

    const legendFrom = (k) => {
      if (!k) return null;
      const o = +k[1];
      const c = +k[4];
      return { o, h: +k[2], l: +k[3], c, v: +k[5], ch: o ? ((c - o) / o) * 100 : 0 };
    };

    (async () => {
      try {
        const [{ createChart, CrosshairMode, LineStyle }, rows] = await Promise.all([import('lightweight-charts'), loadKlines(symbol, interval)]);
        if (disposed || !boxRef.current) return;
        const dec = priceDecimals(rows.length ? +rows[rows.length - 1][4] : 1);
        chart = createChart(boxRef.current, {
          autoSize: true,
          layout: { background: { color: '#0B0E11' }, textColor: '#848E9C', fontSize: 11, fontFamily: "'DM Mono', ui-monospace, monospace" },
          grid: { vertLines: { color: 'rgba(43,49,57,.55)' }, horzLines: { color: 'rgba(43,49,57,.55)' } },
          rightPriceScale: { borderColor: '#2B3139', scaleMargins: { top: 0.08, bottom: 0.22 } },
          timeScale: { borderColor: '#2B3139', timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 7 },
          crosshair: { mode: CrosshairMode.Normal, vertLine: { color: '#5E6673', style: LineStyle.Dashed, labelBackgroundColor: '#2B3139' }, horzLine: { color: '#5E6673', style: LineStyle.Dashed, labelBackgroundColor: '#2B3139' } }
        });
        const candles = chart.addCandlestickSeries({
          upColor: C.up, downColor: C.down, borderUpColor: C.up, borderDownColor: C.down, wickUpColor: C.up, wickDownColor: C.down,
          priceFormat: { type: 'price', precision: dec, minMove: 1 / 10 ** dec }
        });
        const vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        rawRef.current = rows;
        candles.setData(rows.map(toBar));
        vol.setData(rows.map(toVol));
        chart.timeScale().scrollToRealTime();
        chartRef.current = chart;
        candleRef.current = candles;
        volRef.current = vol;
        setLegend(legendFrom(rows[rows.length - 1]));

        chart.subscribeCrosshairMove((p) => {
          if (!p || !p.time) { setLegend(legendFrom(rawRef.current[rawRef.current.length - 1])); return; }
          const t = (p.time - TZ) * 1000;
          const k = rawRef.current.find((r) => r[0] === t);
          if (k) setLegend(legendFrom(k));
        });
        chart.subscribeClick((p) => {
          if (!p || !p.point || !pickRef.current) return;
          const price = candles.coordinateToPrice(p.point.y);
          if (Number.isFinite(price) && price > 0) pickRef.current(Number(price.toFixed(dec)));
        });
        // Scrolled to the left edge: fetch older candles, like TradingView.
        chart.timeScale().subscribeVisibleLogicalRangeChange(async (range) => {
          if (!range || range.from > 20 || loadingMore || noMore || disposed) return;
          loadingMore = true;
          try {
            const older = await loadKlines(symbol, interval, rawRef.current[0][0] - 1);
            if (disposed) return;
            if (!older.length) { noMore = true; return; }
            rawRef.current = [...older, ...rawRef.current];
            candles.setData(rawRef.current.map(toBar));
            vol.setData(rawRef.current.map(toVol));
          } catch { noMore = true; } finally { loadingMore = false; }
        });

        setReady((n) => n + 1);
        const apply = (row) => {
          const raw = rawRef.current;
          if (raw.length && raw[raw.length - 1][0] === row[0]) raw[raw.length - 1] = row;
          else if (!raw.length || row[0] > raw[raw.length - 1][0]) raw.push(row);
          else return;
          candles.update(toBar(row));
          vol.update(toVol(row));
        };
        // If the live socket goes quiet (blocked network, sleeping phone), poll every 3 s instead.
        let lastMsg = Date.now();
        poll = setInterval(async () => {
          if (Date.now() - lastMsg < 6000 || document.visibilityState !== 'visible') return;
          try {
            if (isMt5(symbol)) { // MT5 market: refresh the newest candles from our server (no Binance stream)
              const rows = await loadKlines(symbol, interval);
              if (!disposed) { rows.slice(-2).forEach(apply); setState('live'); }
              return;
            }
            const r = await fetch(`${REST}/klines?symbol=${symbol}&interval=${interval}&limit=2`, { cache: 'no-store' });
            if (!r.ok || disposed) return;
            (await r.json()).forEach((k) => apply([k[0], k[1], k[2], k[3], k[4], k[5]]));
            setState('polling');
          } catch { /* next tick */ }
        }, 3000);
        if (isMt5(symbol)) { lastMsg = 0; stop = () => {}; } else stop = openStream([`${symbol.toLowerCase()}@kline_${interval}`], (_s, d) => {
          const k = d.k;
          if (!k) return;
          lastMsg = Date.now();
          apply([k.t, k.o, k.h, k.l, k.c, k.v]);
        }, setState);
      } catch (e) {
        if (!disposed) setState(e.message || 'error');
      }
    })();

    return () => {
      disposed = true;
      if (stop) stop();
      clearInterval(poll);
      lineRefs.current = [];
      candleRef.current = null;
      volRef.current = null;
      chartRef.current = null;
      if (chart) chart.remove();
    };
  }, [symbol, interval]);

  useEffect(() => { if (volRef.current) volRef.current.applyOptions({ visible: showVol }); }, [showVol, ready]);

  // Position, order and signal lines.
  const linesKey = JSON.stringify(lines);
  useEffect(() => {
    const s = candleRef.current;
    if (!s) return;
    lineRefs.current.forEach((l) => { try { s.removePriceLine(l); } catch { /* chart rebuilt */ } });
    lineRefs.current = lines.filter((l) => Number.isFinite(Number(l.price))).map((l) => s.createPriceLine({
      price: Number(l.price), color: l.color, lineWidth: l.width || 1, lineStyle: l.dashed === false ? 0 : 2, axisLabelVisible: true, title: l.title
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey, ready]);

  const markersKey = JSON.stringify(markers);
  useEffect(() => {
    const s = candleRef.current;
    if (!s) return;
    const sec = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 }[interval] || 900;
    const list = markers
      .map((m) => ({ ...m, time: Math.floor(m.t / 1000 / sec) * sec + TZ }))
      .sort((a, b) => a.time - b.time)
      .map(({ t, ...m }) => m);
    try { s.setMarkers(list); } catch { /* old candles not loaded */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersKey, ready, interval]);

  const up = legend ? legend.c >= legend.o : true;
  return (
    <div className="tx-chart">
      <div className="tx-chart-bar">
        {INTERVALS.map((i) => (
          <button key={i} className={`tx-iv ${i === interval ? 'on' : ''}`} onClick={() => onInterval(i)}>{LABEL[i] || i}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button className={`tx-iv ${showVol ? 'on' : ''}`} onClick={() => setShowVol((v) => !v)} title="Volume">Vol</button>
        <span className={`tx-dot ${state === 'live' || state === 'polling' ? 'live' : state === 'loading' ? '' : 'warn'}`} title={state} />
      </div>
      <div className="tx-chart-area">
        {legend && (
          <div className="tx-legend font-num">
            <span>O <b style={{ color: up ? C.up : C.down }}>{fmtPrice(legend.o)}</b></span>
            <span>H <b style={{ color: up ? C.up : C.down }}>{fmtPrice(legend.h)}</b></span>
            <span>L <b style={{ color: up ? C.up : C.down }}>{fmtPrice(legend.l)}</b></span>
            <span>C <b style={{ color: up ? C.up : C.down }}>{fmtPrice(legend.c)}</b></span>
            <b style={{ color: up ? C.up : C.down }}>{legend.ch >= 0 ? '+' : ''}{legend.ch.toFixed(2)}%</b>
            {showVol && <span>Vol <b>{fmtCompact(legend.v)}</b></span>}
          </div>
        )}
        {state !== 'live' && state !== 'polling' && state !== 'loading' && state !== 'reconnecting' && state !== 'offline' && <div className="tx-chart-msg">{state}</div>}
        <div ref={boxRef} className="tx-chart-canvas" />
      </div>
    </div>
  );
}
