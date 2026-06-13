// lib/exchange.js
// open.er-api.com is free and needs no API key. rates[X] means "1 BASE = X of X".
export async function fetchRates(base = 'KES') {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    const data = await res.json();
    if (data && data.result === 'success' && data.rates) return data.rates;
  } catch (e) {
    console.warn('[fedha] FX fetch failed, using cached/fallback rates:', e?.message);
  }
  return null;
}
