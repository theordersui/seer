export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  try {
    const { method, query } = req;

    // Join catch-all path segments and preserve querystring
    const segments = Array.isArray(query.path) ? query.path : [];
    const upstreamPath = segments.join('/');

    // IMPORTANT: final host (no redirect that could drop headers)
    const upstream = new URL(
      `https://spot.api.sui-prod.bluefin.io/external-api/insidex/${upstreamPath}`
    );

    // forward any additional query params
    for (const [k, v] of Object.entries(req.query || {})) {
      if (k === 'path') continue;
      if (Array.isArray(v)) v.forEach(val => upstream.searchParams.append(k, val));
      else if (v != null) upstream.searchParams.set(k, v);
    }

    const headers = new Headers();
    headers.set('x-api-key', process.env.INSIDEX_API_KEY || '');
    const ct = req.headers['content-type'];
    if (ct) headers.set('content-type', ct);

    const init = { method, headers };

    if (!['GET', 'HEAD'].includes(method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      init.body = Buffer.concat(chunks);
    }

    const r = await fetch(upstream.toString(), init);

    const contentType = r.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await r.arrayBuffer());

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
