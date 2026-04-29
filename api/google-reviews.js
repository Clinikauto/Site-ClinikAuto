const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Simple cache en mémoire (attention : serverless = éphémère)
if (!global.__google_reviews_cache) global.__google_reviews_cache = {};
const cache = global.__google_reviews_cache;

// Optional disk cache file (useful for local tests)
const CACHE_FILE = process.env.GOOGLE_REVIEWS_CACHE_FILE || path.resolve(__dirname, '../backups/google_reviews_cache.json');
try {
  if (fs.existsSync(CACHE_FILE)) {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const obj = JSON.parse(raw);
    Object.keys(obj).forEach(k => { cache[k] = obj[k]; });
  }
} catch (e) {
  console.warn('Impossible de charger le cache disque Google Reviews:', e && e.message);
}

async function persistCacheSafe() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), { encoding: 'utf8' });
  } catch (e) {
    console.warn('Échec écriture cache disque Google Reviews:', e && e.message);
  }
}

// Helpers: simple retry with exponential backoff
async function fetchWithRetry(url, opts = {}, retries = 3) {
  let attempt = 0;
  while (true) {
    try {
      const r = await fetch(url, opts);
      if (r.status === 429 || r.status >= 500) {
        throw new Error(`HTTP ${r.status}`);
      }
      return r;
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      const wait = Math.pow(2, attempt) * 250; // 250ms, 500ms, 1000ms
      await new Promise(res => setTimeout(res, wait));
    }
  }
}

module.exports = async (req, res) => {
  const KEY = process.env.GOOGLE_PLACES_KEY;
  if (!KEY) return res.status(400).json({ error: 'GOOGLE_PLACES_KEY manquant' });

  const placeId = process.env.PLACE_ID || req.query.place_id;
  if (!placeId) return res.status(400).json({ error: 'place_id requis (ou définissez PLACE_ID)' });

  const cacheKey = `reviews_${placeId}`;
  // TTL configurable via env (default 12 heures)
  const maxAge = parseInt(process.env.GOOGLE_REVIEWS_TTL_MS || String(12 * 60 * 60 * 1000), 10);

  // Return cache if fresh
  if (cache[cacheKey] && (Date.now() - cache[cacheKey].ts) < maxAge && cache[cacheKey].data) {
    return res.status(200).json(cache[cacheKey].data);
  }

  // If a request for same key is in-flight, await it (coalescing)
  if (cache[cacheKey] && cache[cacheKey].promise) {
    try {
      const data = await cache[cacheKey].promise;
      return res.status(200).json(data);
    } catch (err) {
      console.error('Google Places coalesced request failed:', err && err.message);
      // fallthrough to attempt new request
    }
  }

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,rating,reviews&key=${KEY}`;

  // Make the request with retry/backoff and coalescing
  const p = (async () => {
    try {
      const r = await fetchWithRetry(url, { timeout: 5000 });
      const data = await r.json();
      const result = data.result || {};
      cache[cacheKey] = { ts: Date.now(), data: result };
      // persist cache in background (non-blocking)
      setImmediate(persistCacheSafe);
      return result;
    } catch (err) {
      throw err;
    } finally {
      if (cache[cacheKey] && cache[cacheKey].promise) delete cache[cacheKey].promise;
    }
  })();

  // store promise for coalescing
  cache[cacheKey] = cache[cacheKey] || {};
  cache[cacheKey].promise = p;

  try {
    const result = await p;
    return res.status(200).json(result);
  } catch (err) {
    console.error('Google Places error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: err && err.message ? err.message : 'Google Places error' });
  }
};