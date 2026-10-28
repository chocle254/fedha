// Turns a pasted Telegram signal into structured data.
// Handles the common layouts: "BTC/USDT LONG entry 65000 TP1 66000 TP2 67000 SL 64000",
// "#BTCUSDT Buy 65,000-65,500 Targets: 66000, 67000 Stop: 64000", etc.
const NUM = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?|\\.\\d+';

// Telegram channels love "𝗕𝗢𝗟𝗗" maths letters and superscripts (TP¹). NFKC turns those back into plain A-Z / 0-9.
export function normalizeText(text) {
  return String(text || '').normalize('NFKC').replace(/[*_`~]/g, ' ').replace(/\u00a0/g, ' ');
}

// Result posts ("TP2 HIT", "590 pips", "1:1.7rr") are follow-ups, not new signals.
export function isFollowUp(text) {
  const up = normalizeText(text).toUpperCase();
  const followUp = /\b(HIT|DONE|REACHED|ACHIEVED|BOOKED|SMASHED|SECURED|CLOSED|RUNNING)\b|TPS?\s*\d*\s*HIT|TPHIT|\bPIPS\b|\d\s*RR\b/.test(up);
  return followUp && !/\b(ENTRY|ENTER|ENTRIES|NOW|LIMIT)\b|@/.test(up);
}

function num(s) {
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseSignal(text) {
  const t = normalizeText(text);
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
  // Gold is tracked on the real gold price (COMEX futures, see lib/market.js), shifted onto the signal's levels.
  let proxyOf = null;
  if (!symbol && /\b(?:XAU\s*[\/\-]?\s*USD|GOLD)\b/.test(up)) { symbol = 'XAUUSD'; proxyOf = 'XAUUSD'; }
  // Instruments Binance Spot does not offer: say so instead of guessing a pair.
  if (!symbol) {
    const fx = up.match(/\b(XAG\s*\/?\s*USD|EUR\s*\/?\s*USD|GBP\s*\/?\s*USD|AUD\s*\/?\s*USD|NZD\s*\/?\s*USD|USD\s*\/?\s*(?:JPY|CAD|CHF)|[A-Z]{3}\s*\/?\s*JPY|USOIL|UKOIL|US30|US100|NAS100|SPX500|GER40|DXY|BRENT|WTI)\b/);
    if (fx) return { ok: false, error: `${fx[1].replace(/\s+/g, '')} is not available on Binance Spot.` };
  }
  // Last resort: a #TICKER hashtag. Common hashtag words are not coins.
  if (!symbol) {
    const NOT_TAGS = ['BUY', 'SELL', 'LONG', 'SHORT', 'SIGNAL', 'SIGNALS', 'OTHER', 'OTHERS', 'LIMIT', 'FREE', 'VIP', 'TRADE', 'SCALP', 'SWING', 'FOREX', 'CRYPTO', 'PREMIUM', 'NEW', 'ALERT', 'UPDATE', 'RESULT', 'RESULTS', 'TP', 'SL', 'ENTRY', 'STOP', 'TARGET', 'MARKET', 'PENDING', 'GOLD'];
    for (const x of up.matchAll(/[#$]([A-Z]{2,10})\b/g)) {
      if (!NOT_TAGS.includes(x[1])) { symbol = x[1] + 'USDT'; break; }
    }
  }
  if (!symbol) return { ok: false, error: 'Could not find a trading pair (for example BTC/USDT).' };

  // Side: whichever of buy/long or sell/short appears first
  const sideMatch = up.match(/\b(BUY|LONG|SELL|SHORT)\b/);
  if (!sideMatch) return { ok: false, error: 'Could not tell whether this is a buy or a sell.' };
  const side = sideMatch[1] === 'BUY' || sideMatch[1] === 'LONG' ? 'BUY' : 'SELL';

  // Entry (single price or range)
  let entryLow = null;
  let entryHigh = null;
  // "ENTRY 4058", "SELL NOW 4058", "BUY LIMIT 65000", "SELL @ 4058", "BUY ZONE 64000-64500", "SELL 4058/4062"
  const entryRe = new RegExp(`\\b(?:ENTRY|ENTER|(?:BUY|SELL|LONG|SHORT)\\s*(?:NOW|LIMIT|STOP|MARKET|ZONE|AT|BELOW|ABOVE)?)\\s*(?:ZONE|PRICE|RANGE|AT|@)?\\s*[:=@\\-]?\\s*(${NUM})(?:\\s*(?:-|–|—|/|TO)\\s*(${NUM}))?`, 'i');
  const em = up.match(entryRe);
  if (em) {
    const a = num(em[1]);
    const b = em[2] ? num(em[2]) : null;
    if (a) { entryLow = b ? Math.min(a, b) : a; entryHigh = b ? Math.max(a, b) : a; }
  }

  // Take profits
  const takeProfits = [];
  const tpRe = new RegExp(`\\b(?:TP|TAKE[\\s-]*PROFIT|TARGET)S?(?:\\s*\\d{1,2}(?![\\d,]|\\.\\d))?\\.?\\s*[:=@\\-]?\\s*(${NUM})((?:\\s*(?:,|/|>|\\|)\\s*(?:${NUM}))*)`, 'gi');
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
  return { ok: true, symbol, proxyOf, side, entryLow, entryHigh, takeProfits: tps, stopLoss };
}

// For gold: the signal's prices are a broker's spot quotes, while the feed is gold futures, which sit a few
// dollars away from the stand-in's price. Shift every level by that gap so the distances (and so the risk) are preserved,
// and treat the entry as the stand-in's current price. Returns { error } when it cannot be matched safely.
export function rebaseToMarket(parsed, marketPrice) {
  if (parsed.entryLow == null) return { error: 'Gold signals need a stated entry price so they can be matched to the gold price.' };
  const ref = (parsed.entryLow + parsed.entryHigh) / 2;
  const delta = marketPrice - ref;
  if (Math.abs(delta) / marketPrice > 0.02) return { error: `Gold is more than 2% away from the signal's price, so it was skipped.` };
  const r = (v) => Math.round((v + delta) * 100) / 100;
  return {
    entry: marketPrice,
    entryLow: marketPrice,
    entryHigh: marketPrice,
    takeProfits: parsed.takeProfits.map(r),
    stopLoss: parsed.stopLoss != null ? r(parsed.stopLoss) : null
  };
}
