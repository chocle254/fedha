import crypto from 'crypto';
import { requireUser } from '../../../lib/require-user';

export const config = { runtime: 'nodejs' };

function json(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const user = await requireUser(req, res);
  if (!user) return;

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
      let binanceError = {};
      try {
        binanceError = await accountResponse.json();
      } catch {
        // Do not log response bodies that could contain unexpected data.
      }
      // Log only Binance's numeric error code and HTTP status. Never log credentials,
      // signatures, request URLs, or account/balance data.
      console.error('[Binance balances] account request rejected', {
        httpStatus: status,
        binanceCode: Number.isFinite(Number(binanceError.code)) ? Number(binanceError.code) : null,
        binanceMessage: typeof binanceError.msg === 'string' ? binanceError.msg.slice(0, 160) : null
      });
      if (status === 451) {
        return json(res, 502, {
          configured: true,
          error: 'Binance blocked this server location. Set a supported Vercel function region in vercel.json.'
        });
      }
      return json(res, 502, {
        configured: true,
        error: 'Binance did not accept the connection. Check the API key permissions, IP restrictions, and system clock.'
      });
    }

    const account = await accountResponse.json();
    const priceResponse = await fetch('https://api.binance.com/api/v3/ticker/price', { cache: 'no-store' });
    if (!priceResponse.ok) {
      console.error('[Binance balances] market price request failed', { httpStatus: priceResponse.status });
      throw new Error('Unable to retrieve market prices');
    }
    const prices = await priceResponse.json();
    const priceMap = Object.fromEntries(prices.map((p) => [p.symbol, Number(p.price)]));

    // Binance Simple Earn positions show up as LD-prefixed tokens (LDUSDC = USDC in Earn).
    // They have no USDT pair, so map them to the underlying asset and merge. A token like
    // LDO (Lido DAO) has its own LDOUSDT pair, so it is left alone.
    const hasPrice = (a) => a === 'USDT' || priceMap[`${a}USDT`] > 0 || priceMap[`USDT${a}`] > 0;
    const underlying = (asset) => {
      if (asset.startsWith('LD') && asset.length > 2 && !hasPrice(asset)) {
        const base = asset.slice(2);
        if (hasPrice(base)) return base;
      }
      return asset;
    };

    const merged = {};
    for (const item of account.balances || []) {
      const free = Number(item.free) || 0;
      const locked = Number(item.locked) || 0;
      const total = free + locked;
      if (total <= 0) continue;
      const asset = underlying(item.asset);
      const isEarn = asset !== item.asset;
      const row = merged[asset] || (merged[asset] = { asset, free: 0, locked: 0, earn: 0, total: 0 });
      row.free += isEarn ? 0 : free;
      row.locked += isEarn ? 0 : locked;
      row.earn += isEarn ? total : 0;
      row.total += total;
    }

    const assets = Object.values(merged)
      .map((row) => {
        const { asset, total } = row;
        let usdtValue = null;
        if (asset === 'USDT') usdtValue = total;
        else if (priceMap[`${asset}USDT`]) usdtValue = total * priceMap[`${asset}USDT`];
        else if (priceMap[`USDT${asset}`] && priceMap[`USDT${asset}`] > 0) usdtValue = total / priceMap[`USDT${asset}`];
        return { ...row, usdtValue };
      })
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
    // Log only a generic error name, never the message or request URL.
    console.error('[Binance balances] request failed', {
      errorName: error && typeof error.name === 'string' ? error.name : 'Error'
    });
    return json(res, 502, {
      configured: true,
      error: 'Could not load Binance balances right now. Please try again.'
    });
  }
}
