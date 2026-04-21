const fetch = require('node-fetch');

module.exports = async (req, res) => {
  const KEY = process.env.GOOGLE_PLACES_KEY;
  if (!KEY) return res.status(400).json({ error: 'GOOGLE_PLACES_KEY manquant' });

  const placeId = process.env.PLACE_ID || req.query.place_id;
  if (!placeId) return res.status(400).json({ error: 'place_id requis (ou définissez PLACE_ID)' });

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,rating,reviews&key=${KEY}`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    return res.status(200).json(data.result || {});
  } catch (err) {
    console.error('Google Places error:', err);
    return res.status(500).json({ error: err.message });
  }
};
