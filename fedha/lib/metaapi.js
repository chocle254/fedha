// Thin MetaApi REST client (server only). MetaApi bridges our MT5 accounts (XM, LiteFinance) to plain HTTPS.
// Docs: https://metaapi.cloud/docs/client/
const PROVISIONING = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';

// The accounts Luxe can trade on. Each needs its MetaApi account id in an env var.
export const BROKER_ACCOUNTS = [
  { key: 'xm', name: 'XM', env: 'METAAPI_XM_ACCOUNT_ID' },
  { key: 'litefinance', name: 'LiteFinance', env: 'METAAPI_LITEFINANCE_ACCOUNT_ID' },
];

export function metaapiConfigured() {
  return !!process.env.METAAPI_TOKEN;
}

export function accountId(key) {
  const a = BROKER_ACCOUNTS.find((x) => x.key === key);
  return a ? process.env[a.env] || null : null;
}

const regionCache = new Map();
async function hostFor(id) {
  if (!regionCache.has(id)) {
    let region = process.env.METAAPI_REGION || 'new-york';
    try {
      const acc = await call(`${PROVISIONING}/users/current/accounts/${id}`);
      if (acc?.region) region = acc.region;
    } catch { /* fall back to the default region */ }
    regionCache.set(id, `https://mt-client-api-v1.${region}.agiliumtrade.ai`);
  }
  return regionCache.get(id);
}

async function call(url, { method = 'GET', body, timeout = 20000 } = {}) {
  const r = await fetch(url, {
    method,
    headers: { 'auth-token': process.env.METAAPI_TOKEN, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
    cache: 'no-store',
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!r.ok) {
    const err = new Error(data?.message || `MetaApi HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

async function client(id, path, opts) {
  return call(`${await hostFor(id)}/users/current/accounts/${id}${path}`, opts);
}

export const mt = {
  accountInfo: (id) => client(id, '/account-information'),
  positions: (id) => client(id, '/positions'),
  orders: (id) => client(id, '/orders'),
  symbols: (id) => client(id, '/symbols'),
  spec: (id, symbol) => client(id, `/symbols/${encodeURIComponent(symbol)}/specification`),
  price: (id, symbol) => client(id, `/symbols/${encodeURIComponent(symbol)}/current-price`),
  dealsByPosition: (id, positionId) => client(id, `/history-deals/position/${encodeURIComponent(positionId)}`),
  trade: (id, body) => client(id, '/trade', { method: 'POST', body, timeout: 30000 }),
};

// MetaApi returns HTTP 200 even when MT5 rejects a trade, so check the MT5 return code.
export function tradeOk(res) {
  return res && ['TRADE_RETCODE_DONE', 'TRADE_RETCODE_PLACED', 'TRADE_RETCODE_DONE_PARTIAL'].includes(res.stringCode);
}

// Gold is "GOLD" on XM and "XAUUSD" on most others, sometimes with a suffix (XAUUSDm, GOLD.i).
const symbolCache = new Map();
export async function findSymbol(id, wanted) {
  const key = `${id}:${wanted}`;
  if (symbolCache.has(key)) return symbolCache.get(key);
  const list = (await mt.symbols(id)) || [];
  const names = list.map((s) => (typeof s === 'string' ? s : s.symbol)).filter(Boolean);
  const aliases = wanted === 'XAUUSD' ? ['XAUUSD', 'GOLD'] : [wanted];
  let found = null;
  for (const a of aliases) {
    found = names.find((n) => n.toUpperCase() === a) || names.find((n) => n.toUpperCase().replace(/[^A-Z]/g, '').startsWith(a));
    if (found) break;
  }
  symbolCache.set(key, found || null);
  return found || null;
}
