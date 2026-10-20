import { database, ensureSchema, readJSON, safeEqual, send, subscriptionSignature, razorpay, activateSubscription } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJSON(req);
    const sessionID = String(body.session_id || '').trim();
    const paymentID = String(body.razorpay_payment_id || '').trim();
    const subscriptionID = String(body.razorpay_subscription_id || '').trim();
    const signature = String(body.razorpay_signature || '').trim();
    await ensureSchema();
    const subscription = (await database().query(
      'SELECT * FROM cheaty_subscriptions WHERE session_id=$1 AND razorpay_subscription_id=$2',
      [sessionID, subscriptionID]
    )).rows[0];
    if (!subscription || !paymentID || !safeEqual(subscriptionSignature(paymentID, subscriptionID), signature)) return send(res, 400, { error: 'Subscription verification failed' });
    const payment = await razorpay(`/payments/${encodeURIComponent(paymentID)}`);
    if (payment.status !== 'captured') return send(res, 202, { status: payment.status, message: 'Payment received but is not captured yet' });
    const activation = await activateSubscription(subscriptionID, paymentID, 'checkout.completed');
    return send(res, 200, { status: 'paid', expires_at: activation?.paidUntil || null, message: 'Paid access is active' });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Could not verify subscription' });
  }
}
