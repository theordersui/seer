export default function handler(req, res) {
  console.log('Insidex handler hit for URL:', req.url);
  res.status(200).send(`Handler hit! Original path: ${req.url}`);
}