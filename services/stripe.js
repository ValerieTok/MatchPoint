const Stripe = require('stripe');

const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

const ensureStripe = () => {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }
  return stripe;
};

const createCheckoutSession = async ({
  amount,
  currency = 'sgd',
  successUrl,
  cancelUrl,
  description
}) => {
  const stripeClient = ensureStripe();
  const amountCents = Math.round(Number(amount || 0) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error('Invalid Stripe amount');
  }

  return stripeClient.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: {
            name: description || 'MatchPoint Payment'
          }
        }
      }
    ],
    success_url: successUrl,
    cancel_url: cancelUrl
  });
};

const retrieveSession = async (sessionId) => {
  const stripeClient = ensureStripe();
  return stripeClient.checkout.sessions.retrieve(sessionId);
};

module.exports = { createCheckoutSession, retrieveSession };
