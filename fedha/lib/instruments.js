// MT5-style markets Luxe tracks besides Binance crypto: metals, forex, energy and indices.
// Shared by the server (prices, sizing, fees) and the browser (labels, pips, lots). No imports, no fetch.
//   yahoo   free Yahoo Finance feed (futures for metals/energy/indices, spot for forex)
//   pip     how signal channels count pips (gold: $0.10, FX: 0.0001, JPY pairs: 0.01, indices: 1 point)
//   spread  typical broker spread in price units (these trade as CFDs: the cost is spread, not a fee)
//   lot     units per standard broker lot (gold 100 oz, silver 5000 oz, FX 100,000, oil 1000 bbl, indices 1)
//   step    smallest paper position step, in units
//   aliases how signals write it
export const MT5 = {
  XAUUSD: { name: 'Gold', group: 'Metals', yahoo: 'GC=F', base: 'XAU', quote: 'USD', pip: 0.1, spread: 0.3, lot: 100, unit: 'oz', step: 0.01, aliases: ['XAU\\s*[/-]?\\s*USD', 'GOLD'] },
  XAGUSD: { name: 'Silver', group: 'Metals', yahoo: 'SI=F', base: 'XAG', quote: 'USD', pip: 0.01, spread: 0.03, lot: 5000, unit: 'oz', step: 0.1, aliases: ['XAG\\s*[/-]?\\s*USD', 'SILVER'] },
  EURUSD: { name: 'Euro / US Dollar', group: 'Forex', yahoo: 'EURUSD=X', pip: 0.0001, spread: 0.00012, lot: 100000, step: 1 },
  GBPUSD: { name: 'Pound / US Dollar', group: 'Forex', yahoo: 'GBPUSD=X', pip: 0.0001, spread: 0.00015, lot: 100000, step: 1 },
  USDJPY: { name: 'US Dollar / Yen', group: 'Forex', yahoo: 'USDJPY=X', pip: 0.01, spread: 0.015, lot: 100000, step: 1 },
  AUDUSD: { name: 'Aussie / US Dollar', group: 'Forex', yahoo: 'AUDUSD=X', pip: 0.0001, spread: 0.00015, lot: 100000, step: 1 },
  USDCAD: { name: 'US Dollar / Loonie', group: 'Forex', yahoo: 'USDCAD=X', pip: 0.0001, spread: 0.0002, lot: 100000, step: 1 },
  USDCHF: { name: 'US Dollar / Franc', group: 'Forex', yahoo: 'USDCHF=X', pip: 0.0001, spread: 0.0002, lot: 100000, step: 1 },
  NZDUSD: { name: 'Kiwi / US Dollar', group: 'Forex', yahoo: 'NZDUSD=X', pip: 0.0001, spread: 0.0002, lot: 100000, step: 1 },
  GBPJPY: { name: 'Pound / Yen', group: 'Forex', yahoo: 'GBPJPY=X', pip: 0.01, spread: 0.03, lot: 100000, step: 1 },
  EURJPY: { name: 'Euro / Yen', group: 'Forex', yahoo: 'EURJPY=X', pip: 0.01, spread: 0.025, lot: 100000, step: 1 },
  USOIL: { name: 'US Oil (WTI)', group: 'Energy', yahoo: 'CL=F', base: 'WTI', quote: 'USD', pip: 0.01, spread: 0.03, lot: 1000, unit: 'bbl', step: 0.1, aliases: ['US\\s*OIL', 'WTI', 'CRUDE'] },
  UKOIL: { name: 'UK Oil (Brent)', group: 'Energy', yahoo: 'BZ=F', base: 'BRENT', quote: 'USD', pip: 0.01, spread: 0.03, lot: 1000, unit: 'bbl', step: 0.1, aliases: ['UK\\s*OIL', 'BRENT'] },
  NAS100: { name: 'Nasdaq 100', group: 'Indices', yahoo: 'NQ=F', base: 'NAS100', quote: 'USD', pip: 1, spread: 1.5, lot: 1, unit: 'contract', step: 0.01, aliases: ['NAS\\s*100', 'US\\s*100', 'USTEC', 'NASDAQ'] },
  US30: { name: 'Dow Jones 30', group: 'Indices', yahoo: 'YM=F', base: 'US30', quote: 'USD', pip: 1, spread: 3, lot: 1, unit: 'contract', step: 0.01, aliases: ['US\\s*30', 'DJ30', 'DOW\\s*JONES', 'WALL\\s*ST(?:REET)?\\s*30'] },
  SPX500: { name: 'S&P 500', group: 'Indices', yahoo: 'ES=F', base: 'SPX500', quote: 'USD', pip: 1, spread: 0.6, lot: 1, unit: 'contract', step: 0.01, aliases: ['SPX\\s*500', 'US\\s*500', 'S&P\\s*500', 'SP500'] },
  DXY: { name: 'US Dollar Index', group: 'Indices', yahoo: 'DX-Y.NYB', base: 'DXY', quote: '', pip: 0.01, spread: 0.03, lot: 1000, unit: 'contract', step: 0.01, aliases: ['DXY'] },
};

export const MT5_SYMBOLS = Object.keys(MT5);
export const instrument = (symbol) => MT5[String(symbol || '').toUpperCase()] || null;
export const isMt5 = (symbol) => !!instrument(symbol);

// Base and quote for display: explicit for metals/energy/indices, first/last three letters for forex.
export const baseOf = (symbol) => { const i = instrument(symbol); return i ? i.base || symbol.slice(0, 3) : null; };
export const quoteOfMt5 = (symbol) => { const i = instrument(symbol); return i ? (i.quote ?? symbol.slice(3)) : null; };

// Which MT5 market a signal text is about (upper-case, normalised text), or null.
export function detectMt5(up) {
  for (const [symbol, i] of Object.entries(MT5)) {
    const pats = i.aliases || [`${symbol.slice(0, 3)}\\s*[/-]?\\s*${symbol.slice(3)}`];
    if (pats.some((p) => new RegExp(`(?:^|[^A-Z])(?:${p})(?![A-Z])`).test(up))) return symbol;
  }
  return null;
}
