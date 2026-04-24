const fetch = require('node-fetch');

// Simple cache en mémoire (attention : serverless = éphémère)
if (!global.__google_reviews_cache) global.__google_reviews_cache = {};
const cache = global.__google_reviews_cache;

module.exports = async (req, res) => {
  const KEY = process.env.GOOGLE_PLACES_KEY;
  if (!KEY) return res.status(400).json({ error: 'GOOGLE_PLACES_KEY manquant' });

  const placeId = process.env.PLACE_ID || req.query.place_id;
  if (!placeId) return res.status(400).json({ error: 'place_id requis (ou définissez PLACE_ID)' });

  const cacheKey = `reviews_${placeId}`;
  const maxAge = 5 * 60 * 1000; // 5 minutes

  if (cache[cacheKey] && (Date.now() - cache[cacheKey].ts) < maxAge) {
    return res.status(200).json(cache[cacheKey].data);
  }

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,rating,reviews&key=${KEY}`;

  try {
    const r = await fetch(url, { timeout: 5000 });
    const data = await r.json();
    const result = data.result || {};
    // Stocker dans le cache
    cache[cacheKey] = { ts: Date.now(), data: result };
    return res.status(200).json(result);
  } catch (err) {
    console.error('Google Places error:', err);
    return res.status(500).json({ error: err && err.message ? err.message : 'Google Places error' });
  }
};