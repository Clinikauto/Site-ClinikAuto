const Stripe = require('stripe');
const getRawBody = require('raw-body');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let raw;
  try {
    raw = await getRawBody(req);
  } catch (err) {
    console.error('Error reading raw body:', err);
    return res.status(400).end('Invalid request body');
  }

  let event;
  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
    } else {
      event = JSON.parse(raw.toString());
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('Checkout session completed:', session.id);
        // TODO: marquer comme réservé, envoyer confirmation, créer RDV
        break;
      }
      default:
        console.log('Unhandled event type', event.type);
    }
  } catch (err) {
    console.error('Processing webhook error:', err);
  }

  res.json({ received: true });
};
