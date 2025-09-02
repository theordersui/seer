export const config = { runtime: 'edge' };

export default async function handler(req) {
  // Rewrite /api/insidex/... -> /external-api/insidex/...
  const inUrl = new URL(req.url);
  const upstreamPath = inUrl.pathname.replace(
    /^\/api\/insidex/,
    '/external-api/insidex'
  );
  const upstream = new URL(upstreamPath + inUrl.search, 'https://spot.api.sui-prod.bluefin.io');

  // Clone incoming headers and inject API key; don't forward 'host'
  const headers = new Headers(req.headers);
  headers.set('x-api-key', process.env.INSIDEX_API_KEY || '');
  headers.delete('host');

  // CORS (usually not needed since same origin, but safe for preflight)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': inUrl.origin,
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
    });
  }

  const resp = await fetch(upstream, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    redirect: 'manual',
  });

  // Return upstream response as-is
  return new Response(resp.body, {
    status: resp.status,
    headers: resp.headers,
  });
}
