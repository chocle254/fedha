// lib/exchange.js
// Free exchange-rate source — no API key, no credit card.
// Returns an object like { USD: 0.0077, EUR: 0.0071, ... } where each value
// means "1 unit of base currency = X units of that currency".

export async function fetchRates(base = 'KES') {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    const data = await res.json();
    if (data && data.result === 'success' && data.rates) {
      return data.rates;
    }
  } catch (e) {
    console.warn('[fedha] FX fetch failed, using cached/fallback rates:', e?.message);
  }
  return null;
}
