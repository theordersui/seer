export const config = { api: { bodyParser: false } };

// Optional override so we can A/B test base hosts without code changes
// Set in Vercel if you want to try another base:
// INX_BASE=https://spot.api.sui-prod.bluefin.io/external-api/insidex
const DEFAULT_BASE = 'https://spot.api.sui-prod.bluefin.io/external-api/insidex';

export default async function handler(req, res) {
  try {
    const { method, query } = req;
    const segments = Array.isArray(query.path) ? query.path : [];
    const upstreamPath = segments.join('/');

    const base = process.env.INX_BASE || DEFAULT_BASE;
    const upstream = new URL(`${base}/${upstreamPath}`);

    // Preserve query string (except the catch-all route param and our debug flag)
    for (const [k, v] of Object.entries(req.query || {})) {
      if (k === 'path' || k === '__debug') continue;
      if (Array.isArray(v)) v.forEach(val => upstream.searchParams.append(k, val));
      else if (v != null) upstream.searchParams.set(k, v);
    }

    const headers = new Headers();
    headers.set('x-api-key', process.env.REACT_APP_INSIDEX_API_KEY || '');
    const ct = req.headers['content-type'];
    if (ct) headers.set('content-type', ct);

    const init = { method, headers };

    if (!['GET', 'HEAD'].includes(method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      init.body = Buffer.concat(chunks);
    }

    const r = await fetch(upstream.toString(), init);
    const buf = Buffer.from(await r.arrayBuffer());
    const contentType = r.headers.get('content-type') || 'application/octet-stream';

    // DEBUG MODE: hit ?__debug=1 to see what we called and what came back
    if (req.query.__debug === '1') {
      res.status(200).json({
        called: upstream.toString(),
        sentHeaders: { 'x-api-key': process.env.INSIDEX_API_KEY ? '[present]' : '[MISSING]' },
        upstream: {
          status: r.status,
          contentType,
          // show up to 400 chars of body for quick inspection
          bodyPreview: buf.toString('utf8').slice(0, 400),
        },
      });
      return;
    }

    res.status(r.status);
    res.setHeader('Content-Type', contentType);
    const cacheControl = r.headers.get('cache-control');
    if (cacheControl) res.setHeader('Cache-Control', cacheControl);
    res.send(buf);
  } catch (e) {
    console.error('[insidex proxy]', e);
    res.status(500).json({ error: 'Proxy error', detail: e?.message || 'unknown' });
  }
}
