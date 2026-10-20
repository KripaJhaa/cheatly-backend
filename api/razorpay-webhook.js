import { readRaw, send, safeEqual, webhookSignature, markOrderPaid, activateSubscription, markSubscriptionStatus } from './_lib.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const raw = await readRaw(req);
    const signature = req.headers['x-razorpay-signature'];
    if (!signature || !safeEqual(webhookSignature(raw), signature)) return send(res, 400, { error: 'Invalid webhook signature' });
    const event = JSON.parse(raw.toString('utf8'));
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const orderID = event.payload?.payment?.entity?.order_id || event.payload?.order?.entity?.id;
      const paymentID = event.payload?.payment?.entity?.id || null;
      if (orderID) await markOrderPaid(orderID, paymentID);
    }
    if (event.event === 'subscription.charged') {
      const subscriptionID = event.payload?.subscription?.entity?.id;
      const paymentID = event.payload?.payment?.entity?.id || null;
      if (subscriptionID) await activateSubscription(subscriptionID, paymentID, event.event);
    }
    if (event.event === 'subscription.authenticated') {
      const subscriptionID = event.payload?.subscription?.entity?.id;
      if (subscriptionID) await markSubscriptionStatus(subscriptionID, 'authenticated');
    }
    if (event.event === 'subscription.cancelled') {
      const subscriptionID = event.payload?.subscription?.entity?.id;
      if (subscriptionID) await markSubscriptionStatus(subscriptionID, 'active', true);
    }
    if (event.event === 'subscription.halted' || event.event === 'subscription.completed') {
      const subscriptionID = event.payload?.subscription?.entity?.id;
      if (subscriptionID) await markSubscriptionStatus(subscriptionID, event.event.replace('subscription.', ''));
    }
    return send(res, 200, { received: true });
  } catch (error) {
    console.error(error);
    return send(res, 400, { error: 'Invalid webhook' });
  }
}
