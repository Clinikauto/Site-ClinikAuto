const Stripe = require('stripe');
const getRawBody = require('raw-body');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY non configuré.');
}
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * IMPORTANT:
 * - Cette route nécessite le RAW body pour vérifier la signature Stripe.
 * - Si vous utilisez Next.js, la config en bas du fichier désactive le bodyParser pour cette route.
 */

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  // Vérifier la configuration
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY manquant.');
    return res.status(500).send('Server misconfigured');
  }
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET non configuré.');
    return res.status(500).send('Webhook not configured');
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    console.error('Stripe signature header missing');
    return res.status(400).send('Missing stripe-signature header');
  }

  let raw;
  try {
    // limiter la taille à 1mb pour sécurité
    raw = await getRawBody(req, {
      length: req.headers['content-length'],
      limit: '1mb'
    });
  } catch (err) {
    console.error('Error reading raw body:', err);
    return res.status(400).end('Invalid request body');
  }

  let event;
  try {
    // constructEvent lance une erreur si la signature ne correspond pas
    event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err && err.message ? err.message : err);
    return res.status(400).send(`Webhook Error: ${err && err.message ? err.message : 'Invalid signature'}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('Checkout session completed:', session.id);
        // TODO: marquer commande/réservation comme payée, envoyer confirmation, créer RDV
        break;
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        console.log('PaymentIntent succeeded:', pi.id);
        // TODO: gérer traitement si nécessaire
        break;
      }
      default:
        console.log('Unhandled event type', event.type);
    }
  } catch (err) {
    console.error('Processing webhook error:', err);
    // Ne renvoyer pas d'erreur 500 si on veut que Stripe réessaie — mais loguer l'erreur.
  }

  // Répondre 200 pour confirmer la réception
  res.status(200).json({ received: true });
};

// Si vous utilisez Next.js, désactivez le body parser pour cette route
// (module.exports.config fonctionne en CommonJS)
module.exports.config = {
  api: {
    bodyParser: false
  }
};