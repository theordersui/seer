export default async function handler(req, res) {
  // Only GET/HEAD for now
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Catch-all segments after /api/insidex/
  const { path = [], debug } = req.query;
  // Keep the original querystring for real calls (but strip debug flag)
  const urlStr = req.url || '';
  const qs = urlStr.includes('?') ? urlStr.slice(urlStr.indexOf('?')) : '';
  const qsClean = qs.replace(/([?&])debug=1(&|$)/, (m, a, b) => (a === '?' && b ? '?' : a === '?' ? '' : b));

  const base =
    process.env.INX_BASEURL ||
    'https://spot.api.sui-prod.bluefin.io/external-api/insidex';

  const slug = Array.isArray(path) ? path.join('/') : String(path || '');
  const targetUrl = `${base.replace(/\/+$/, '')}/${slug}${qsClean}`;

  const haveKey = !!process.env.INSIDEX_API_KEY;

  // --- DEBUG SHORT-CIRCUIT ---
  if (debug === '1') {
    return res.status(200).json({
      matched: true,
      path,
      targetUrl,
      haveKey,
      method: req.method,
      base
    });
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'x-api-key': process.env.INSIDEX_API_KEY || '',
        'user-agent': req.headers['user-agent'] || 'vercel-proxy'
      }
    });

    // Always return upstream body so 4xx/5xx include the message
    const text = await upstream.text();

    res.status(upstream.status);
    res.setHeader('x-proxy-target', targetUrl);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'text/plain');

    const cache = upstream.headers.get('cache-control');
    if (cache) res.setHeader('cache-control', cache);

    return res.send(text);
  } catch (err) {
    return res.status(502).json({
      error: 'bad_gateway',
      message: err?.message || 'fetch failed',
      targetUrl,
      haveKey
    });
  }
}
