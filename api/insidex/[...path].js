// api/insidex/[...path].js
export default async function handler(req, res) {
  try {
    const { method, query } = req;

    // Join catch-all path segments
    const upstreamPath = Array.isArray(query.path) ? query.path.join('/') : '';
    const upstreamUrl = `https://api-ex.insidex.trade/${upstreamPath}`;

    const headers = new Headers();
    headers.set('x-api-key', process.env.INSIDEX_API_KEY);

    // Forward content-type if present (useful for POST)
    const ct = req.headers['content-type'];
    if (ct) headers.set('content-type', ct);

    const init = { method, headers, redirect: 'follow' };

    // Forward body for non-GET/HEAD
    if (!['GET', 'HEAD'].includes(method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      init.body = Buffer.concat(chunks);
    }

    const r = await fetch(upstreamUrl, init);
    const contentType = r.headers.get('content-type') || 'application/json';
    const buf = Buffer.from(await r.arrayBuffer());

    res.status(r.status);
    res.setHeader('Content-Type', contentType);
    res.send(buf);
  } catch (e) {
    console.error('[insidex proxy]', e);
    res.status(500).json({ error: 'Proxy error', detail: e?.message });
  }
}
