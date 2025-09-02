export default async function handler(req, res) {
  const targetUrl = "https://api-ex.insidex.trade/coins-transfer/addresses-sent-to/0x4a81a450d6cbb3c373c80b542c20523f7eab8c39c346ef521c54526e61d2baa6";
  const key = process.env.INSIDEX_API_KEY || "";

  if ((req.query.debug || "") === "1") {
    return res.status(200).json({ matched: true, targetUrl, haveKey: Boolean(key) });
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: { "x-api-key": key, "user-agent": "vercel-proxy" },
      method: "GET",
    });
    const body = await upstream.arrayBuffer();
    res.status(upstream.status);
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("x-proxy-target", targetUrl);
    return res.send(Buffer.from(body));
  } catch (err) {
    return res.status(502).json({ error: "bad_gateway", message: err?.message, targetUrl });
  }
}
