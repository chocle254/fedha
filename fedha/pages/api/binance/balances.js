import crypto from 'crypto';

export const config = { runtime: 'nodejs' };

function json(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) {
    return json(res, 503, {
      configured: false,
      error: 'Binance is not connected yet. Add the Binance API credentials in your Vercel environment variables.'
    });
  }

  try {
    const params = new URLSearchParams({
      timestamp: String(Date.now()),
      recvWindow: '5000'
    });
    const signature = crypto.createHmac('sha256', apiSecret).update(params.toString()).digest('hex');
    const accountUrl = `https://api.binance.com/api/v3/account?${params.toString()}&signature=${signature}`;
    const accountResponse = await fetch(accountUrl, {
      headers: { 'X-MBX-APIKEY': apiKey },
      cache: 'no-store'
    });

    if (!accountResponse.ok) {
      const status = accountResponse.status;
      return json(res, status === 401 || status === 403 ? 502 : 502, {
        configured: true,
        error: 'Binance did not accept the connection. Check the API key permissions, IP restrictions, and system clock.'
      });
    }

    const account = await accountResponse.json();
    const priceResponse = await fetch('https://api.binance.com/api/v3/ticker/price', { cache: 'no-store' });
    if (!priceResponse.ok) throw new Error('Unable to retrieve market prices');
    const prices = await priceResponse.json();
    const priceMap = Object.fromEntries(prices.map((p) => [p.symbol, Number(p.price)]));

    const assets = (account.balances || [])
      .map((item) => {
        const free = Number(item.free) || 0;
        const locked = Number(item.locked) || 0;
        const total = free + locked;
        if (total <= 0) return null;
        const asset = item.asset;
        let usdtValue = null;
        if (asset === 'USDT') usdtValue = total;
        else if (priceMap[`${asset}USDT`]) usdtValue = total * priceMap[`${asset}USDT`];
        else if (priceMap[`USDT${asset}`] && priceMap[`USDT${asset}`] > 0) usdtValue = total / priceMap[`USDT${asset}`];
        return { asset, free, locked, total, usdtValue };
      })
      .filter(Boolean)
      .sort((a, b) => (b.usdtValue ?? -1) - (a.usdtValue ?? -1));

    const pricedAssets = assets.filter((a) => a.usdtValue != null);
    const totalUsdt = pricedAssets.reduce((sum, a) => sum + a.usdtValue, 0);
    return json(res, 200, {
      configured: true,
      accountType: 'Spot',
      fetchedAt: new Date().toISOString(),
      totalUsdt,
      unpricedAssetCount: assets.length - pricedAssets.length,
      assets
    });
  } catch (error) {
    return json(res, 502, {
      configured: true,
      error: 'Could not load Binance balances right now. Please try again.'
    });
  }
}
