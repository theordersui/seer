// Serverless proxy using a rewrite: /api/insidex/<rest>
// → /api/insidex?path=<rest>
export default async function handler(req, res) {
  // path comes from vercel.json rewrite
  const rest = (req.query.path || '').toString();

  // Keep original query params (minus our own "path")
  const urlStr = req.url || '';
  const qs = urlStr.includes('?') ? urlStr.slice(urlStr.indexOf('?') + 1) : '';
  const params = new URLSearchParams(qs);
  params.delete('path'); // we only use it to route internally
  const qsOut = params.toString();
  const suffix = qsOut ? `?${qsOut}` : '';

  const base =
    process.env.INX_BASEURL ||
    'https://spot.api.sui-prod.bluefin.io/external-api/insidex';

  const targetUrl = `${base.replace(/\/+$/, '')}/${rest}${suffix}`;
  const key = process.env.INSIDEX_API_KEY || '';

  // Optional debug: /api/insidex?path=...&debug=1
  if (params.get('debug') === '1') {
    return res.status(200).json({
      matched: true,
      rest,
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
