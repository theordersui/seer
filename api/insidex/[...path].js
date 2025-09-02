// Vercel Serverless Function (Next.js API route style)
// Proxies to Bluefin's final host and injects x-api-key.
// Env var must be set in Vercel as INSIDEX_API_KEY (Server-side only).

export const config = {
  api: { bodyParser: false }, // we stream the body for non-GETs
};

export default async function handler(req, res) {
  try {
    const { method, query } = req;

    // Join catch-all path segments, preserve query string
    const segments = Array.isArray(query.path) ? query.path : [];
    const upstreamPath = segments.join('/');

    // IMPORTANT: go straight to final host (avoid redirect that drops headers)
    const upstreamUrl = new URL(
      `https://spot.api.sui-prod.bluefin.io/external-api/insidex/${upstreamPath}`
    );

    // If client sent ?foo=bar, keep it
    for (const [k, v] of Object.entries(req.query || {})) {
      if (k === 'path') continue; // not part of upstream query
      if (Array.isArray(v)) v.forEach(val => upstreamUrl.searchParams.append(k, val));
      else if (v != null) upstreamUrl.searchParams.set(k, v);
    }

    const headers = new Headers();
    headers.set('x-api-key', process.env.INSIDEX_API_KEY || '');

    // forward content-type if present (useful for POST/PUT)
    const ct = req.headers['content-type'];
    if (ct) headers.set('content-type', ct);

    const init = { method, headers };

    // stream body for non-GET/HEAD
    if (!['GET', 'HEAD'].includes(method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      init.body = Buffer.concat(chunks);
    }

    const r = await fetch(upstreamUrl.toString(), init);

    // mirror status + content-type
    const contentType = r.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await r.arrayBuffer());

    res.status(r.status);
    res.setHeader('Content-Type', contentType);
    // Optional: surface upstream cache headers if present
    const cacheControl = r.headers.get('cache-control');
    if (cacheControl) res.setHeader('Cache-Control', cacheControl);

    res.send(buf);
  } catch (e) {
    console.error('[insidex proxy]', e);
    res.status(500).json({ error: 'Proxy error', detail: e?.message || 'unknown' });
  }
}
