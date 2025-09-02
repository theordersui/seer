export default async function handler(req, res) {
  const { address } = req.query;

  const base =
    process.env.INX_BASEURL || 'https://api-ex.insidex.trade';
  const targetUrl = `${base.replace(/\/+$/, '')}/coins-transfer/addresses-sent-to/${address}`;

  const key = process.env.INSIDEX_API_KEY || '';

  if ((req.query.debug || '') === '1') {
    return res.status(200).json({
      matched: true,
      targetUrl,
      haveKey: Boolean(key),
      method: req.method
    });
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'x-api-key': key, 'user-agent': 'vercel-proxy' }
    });
    const body = await upstream.arrayBuffer();
    res.status(upstream.status);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('x-proxy-target', targetUrl);
    return res.send(Buffer.from(body));
  } catch (err) {
    return res.status(502).json({ error: 'bad_gateway', message: err?.message, targetUrl });
  }
}
