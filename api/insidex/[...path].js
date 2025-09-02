export default function handler(req, res) {
  // Extract catch-all segments (Vercel populates this for [...path])
  const pathSegments = req.query.path ? (Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path) : '';
  const fullPath = `/api/insidex/${pathSegments}`.replace(/\/$/, ''); // Reconstruct for logging

  console.log('Handler hit! Full original path:', fullPath, 'Query:', req.query);

  res.status(200).send(`Handler hit! Original path: ${fullPath}`);
}