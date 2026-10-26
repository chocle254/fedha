// Turns a pasted Telegram signal into structured data.
// Handles the common layouts: "BTC/USDT LONG entry 65000 TP1 66000 TP2 67000 SL 64000",
// "#BTCUSDT Buy 65,000-65,500 Targets: 66000, 67000 Stop: 64000", etc.
const NUM = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?|\\.\\d+';

function num(s) {
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseSignal(text) {
  const t = String(text || '').replace(/[*_`~]/g, ' ').replace(/\u00a0/g, ' ');
  const up = t.toUpperCase();

  // Symbol
  let symbol = null;
  let m = up.match(/([A-Z0-9]{2,10})\s*[\/\-_]\s*(USDT|USDC|FDUSD)\b/);
  if (m) symbol = m[1] + m[2];
  if (!symbol) { m = up.match(/\b([A-Z0-9]{2,10})(USDT|USDC|FDUSD)\b/); if (m) symbol = m[1] + m[2]; }
  if (!symbol) {
    const NOT_COINS = ['BUY', 'SELL', 'LONG', 'SHORT', 'ENTRY', 'SIGNAL', 'STOP', 'LOSS', 'TARGET', 'TP', 'SL', 'AT', 'NOW'];
    for (const x of up.matchAll(/\b([A-Z0-9]{2,10})\s+(USDT|USDC|FDUSD)\b/g)) {
      if (!NOT_COINS.includes(x[1])) { symbol = x[1] + x[2]; break; }
    }
  }
  if (!symbol) { m = up.match(/[#$]([A-Z]{2,10})\b/); if (m && !['BUY', 'SELL', 'LONG', 'SHORT', 'SIGNAL'].includes(m[1])) symbol = m[1] + 'USDT'; }
  if (!symbol) return { ok: false, error: 'Could not find a trading pair (for example BTC/USDT).' };

  // Side: whichever of buy/long or sell/short appears first
  const sideMatch = up.match(/\b(BUY|LONG|SELL|SHORT)\b/);
  if (!sideMatch) return { ok: false, error: 'Could not tell whether this is a buy or a sell.' };
  const side = sideMatch[1] === 'BUY' || sideMatch[1] === 'LONG' ? 'BUY' : 'SELL';

  // Entry (single price or range)
  let entryLow = null;
  let entryHigh = null;
  const entryRe = new RegExp(`\\b(?:ENTRY|ENTER|BUY\\s*(?:ZONE|AT|BELOW|ABOVE|NOW)?|SELL\\s*(?:ZONE|AT)?)\\s*(?:ZONE|PRICE|RANGE|AT|@)?\\s*[:=@\\-]?\\s*(${NUM})(?:\\s*(?:-|–|—|TO)\\s*(${NUM}))?`, 'i');
  const em = up.match(entryRe);
  if (em) {
    const a = num(em[1]);
    const b = em[2] ? num(em[2]) : null;
    if (a) { entryLow = b ? Math.min(a, b) : a; entryHigh = b ? Math.max(a, b) : a; }
  }

  // Take profits
  const takeProfits = [];
  const tpRe = new RegExp(`\\b(?:TP|TAKE[\\s-]*PROFIT|TARGET)S?(?:\\s*\\d{1,2}(?![\\d.,]))?\\s*[:=@\\-]?\\s*(${NUM})((?:\\s*(?:,|/|>|\\|)\\s*(?:${NUM}))*)`, 'gi');
  for (const x of up.matchAll(tpRe)) {
    const first = num(x[1]);
    if (first) takeProfits.push(first);
    for (const n of (x[2] || '').match(new RegExp(NUM, 'g')) || []) {
      const v = num(n);
      if (v) takeProfits.push(v);
    }
  }
  const tps = [...new Set(takeProfits)].sort((a, b) => (side === 'BUY' ? a - b : b - a));

  // Stop loss
  let stopLoss = null;
  const sm = up.match(new RegExp(`\\b(?:SL|STOP[\\s-]*LOSS|STOP)\\s*[:=@\\-]?\\s*(${NUM})`, 'i'));
  if (sm) stopLoss = num(sm[1]);

  if (!tps.length && !stopLoss) return { ok: false, error: 'Needs at least one take-profit (TP) or a stop-loss (SL).' };
  return { ok: true, symbol, side, entryLow, entryHigh, takeProfits: tps, stopLoss };
}
