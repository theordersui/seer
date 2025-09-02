// Handles /api/insidex/<anything> without vercel.json rewrites.
// It builds the upstream URL from the dynamic path segments.

export default async function handler(req, res) {
  const { rest = [] } = req.query;                           // ['coins-transfer','addresses-received-from', '0x...']
  const path = Array.isArray(rest) ? rest.join('/') : String(rest || '');

  // Keep original query params (but we also support ?debug=1)
  const urlStr = req.url || '';
  const qs = urlStr.includes('?') ? urlStr.slice(urlStr.indexOf('?') + 1) : '';
  const params = new URLSearchParams(qs);
  const debug = params.get('debug');
  params.delete('debug');
  const qsOut = params.toString();
  const suffix = qsOut ? `?${qsOut}` : '';

  const base =
    process.env.INX_BASEURL ||
    'https://spot.api.sui-prod.bluefin.io/external-api/insidex';

  const targetUrl = `${base.replace(/\/+$/, '')}/${path}${suffix}`;
  const key = process.env.INSIDEX_API_KEY || '';

  if (debug === '1') {
    return res.status(200).json({
      matched: true,
      path,
      targetUrl,
      haveKey: Boolean(key),
      method: req.method,
      base
    });
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: { 'x-api-key': key, 'user-agent': 'vercel-proxy' }
    });
    const body = await upstream.arrayBuffer();
    res.status(upstream.status);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('x-proxy-target', targetUrl);
    const cc = upstream.headers.get('cache-control');
    if (cc) res.setHeader('cache-control', cc);
    return res.send(Buffer.from(body));
  } catch (err) {
    return res.status(502).json({ error: 'bad_gateway', message: err?.message, targetUrl });
  }
}
