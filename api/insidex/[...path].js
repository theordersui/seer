const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = createProxyMiddleware({
  target: 'https://spot.api.sui-prod.bluefin.io',
  changeOrigin: true,
  pathRewrite: { '^/api/insidex': '/external-api/insidex' },
  on: {
    proxyReq: (proxyReq) => {
      proxyReq.setHeader('x-api-key', process.env.INSIDEX_API_KEY || '');
    },
    error: (err, req, res) => {
      console.error('[insidex proxy error]', err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Proxy error', detail: err.message || 'unknown' }));
    }
  },
  logLevel: 'debug' // Change to 'silent' in prod if you don't want logs.
});