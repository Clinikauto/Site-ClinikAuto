const Stripe = require('stripe');
const metrics = require('../utils/metrics');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY non configuré.');
}
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// simple rate limiter per IP
if (!global.__stripe_rate) global.__stripe_rate = {};
const stripeRate = global.__stripe_rate;
const STRIPE_RATE_PER_MIN = parseInt(process.env.STRIPE_RATE_PER_MIN || '10', 10);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe non configuré' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const { productId, amount, currency = 'eur', successUrl, cancelUrl } = body || {};

  // Validation minimale
  if (!productId) return res.status(400).json({ error: 'productId requis' });

  // Montant contrôlé côté serveur : si possible, mappez productId->price côté serveur.
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > 100000) {
    return res.status(400).json({ error: 'Montant invalide' });
  }

  const unit_amount = Math.round(amountNum * 100);

  // rate limit by IP
  const ip = (req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const windowStart = now - 60 * 1000;
  stripeRate[ip] = stripeRate[ip] || [];
  // keep only timestamps in current window
  stripeRate[ip] = stripeRate[ip].filter(t => t > windowStart);
  if (stripeRate[ip].length >= STRIPE_RATE_PER_MIN) {
    metrics.increment('stripe_session_rate_limited');
    return res.status(429).json({ error: 'Too many requests' });
  }
  stripeRate[ip].push(now);
  metrics.increment('stripe_session_requests');

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency,
          product_data: { name: `Acompte - ${productId}` },
          unit_amount,
        },
        quantity: 1,
      }],
      success_url: String(successUrl || `${process.env.NEXT_PUBLIC_BASE_URL || ''}/paiement-success.html`),
      cancel_url: String(cancelUrl || `${process.env.NEXT_PUBLIC_BASE_URL || ''}/paiement-cancel.html`),
    });
    return res.status(200).json({ id: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe create session error:', err);
    metrics.increment('stripe_session_errors');
    return res.status(500).json({ error: err && err.message ? err.message : 'Stripe error' });
  }
};