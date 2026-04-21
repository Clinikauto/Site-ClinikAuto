const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {}
  }

  const { productId, amount, currency = 'eur', successUrl, cancelUrl } = body || {};

  if (!productId || !amount) return res.status(400).json({ error: 'productId et amount requis' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency,
          product_data: { name: `Acompte - ${productId}` },
          unit_amount: Math.round(Number(amount) * 100),
        },
        quantity: 1,
      }],
      success_url: successUrl || `${process.env.NEXT_PUBLIC_BASE_URL || ''}/paiement-success.html`,
      cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_BASE_URL || ''}/paiement-cancel.html`,
    });
    return res.status(200).json({ id: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe create session error:', err);
    return res.status(500).json({ error: err.message });
  }
};
