const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY non configuré.');
}
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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
    return res.status(500).json({ error: err && err.message ? err.message : 'Stripe error' });
  }
};