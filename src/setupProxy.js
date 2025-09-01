// src/setupProxy.js
const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Local dev proxy → Bluefin final host (avoids redirect hop & races).
 * Frontend calls: /api/insidex/<path>
 * Upstream hits:  https://spot.api.sui-prod.bluefin.io/external-api/insidex/<path>
 */
module.exports = function (app) {
  app.use(
    '/api/insidex',
    createProxyMiddleware({
      target: 'https://spot.api.sui-prod.bluefin.io',
      changeOrigin: true,
      // /api/insidex/... -> /external-api/insidex/...
      pathRewrite: { '^/api/insidex': '/external-api/insidex' },

      // Set API key BEFORE sending the request (no onProxyReq!)
      headers: {
        'x-api-key': process.env.REACT_APP_INSIDEX_API_KEY || '',
      },

      logLevel: 'debug',
    })
  );
};
