export default function handler(req, res) {
  const fullPath = req.url || '/api/insidex'; // Fallback for base
  console.log('Handler hit! Full original path:', fullPath, 'Query:', req.query, 'Headers:', req.headers);

  res.status(200).send(`Handler hit! Original path: ${fullPath}`);
}