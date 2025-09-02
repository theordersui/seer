// Serverless proxy for production on Vercel.
// Maps:  /api/insidex/<anything>  →  https://spot.api.sui-prod.bluefin.io/external-api/insidex/<anything>
// Adds:  x-api-key from env (server-side, never exposed to the browser)

export default async function handler(req, res) {
  try {
    // Only proxy GET by default (your endpoints are GET). Add others if you need them.
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    // Capture the dynamic rest of the path and any query string
    const { path = [] } = req.query; // array from [...path]
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

    // Base to avoid the redirect hop, same as your dev comment
    const base =
      process.env.INX_BASEURL ||
      'https://spot.api.sui-prod.bluefin.io/external-api/insidex';

    const targetUrl = `${base}/${Array.isArray(path) ? path.join('/') : path}${qs}`;

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'x-api-key': process.env.INSIDEX_API_KEY || '',
        // optional: forward UA for debugging
        'user-agent': req.headers['user-agent'] || 'vercel-proxy',
        // don't forward host/origin; upstream decides CORS, but we are server-side anyway
      },
    });

    // Mirror upstream status & body
    const contentType = upstream.headers.get('content-type') || 'application/json';
    res.status(upstream.status);
    res.setHeader('content-type', contentType);

    // You can forward cache headers if provided:
    const cache = upstream.headers.get('cache-control');
    if (cache) res.setHeader('cache-control', cache);

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (err) {
    return res.status(500).json({
      error: 'proxy_failed',
      message: err?.message || 'Internal proxy error',
    });
  }
}
