import { applyCors, database, ensureSchema, planDefinition, readJSON, safeEqual, send, subscriptionSignature, razorpay, activateSubscription } from './_lib.js';
import { notifyPaidAccess } from './_lib/mailer.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJSON(req);
    const sessionID = String(body.session_id || '').trim();
    const paymentID = String(body.razorpay_payment_id || '').trim();
    const subscriptionID = String(body.razorpay_subscription_id || '').trim();
    const signature = String(body.razorpay_signature || '').trim();
    await ensureSchema();
    const subscription = (await database().query(
      `SELECT s.*, cs.checkout_consumed_at
       FROM cheaty_subscriptions s
       JOIN cheaty_sessions cs ON cs.session_id=s.session_id
       WHERE s.session_id=$1 AND s.razorpay_subscription_id=$2`,
      [sessionID, subscriptionID]
    )).rows[0];
    if (!subscription || !paymentID || !safeEqual(subscriptionSignature(paymentID, subscriptionID), signature)) return send(res, 400, { error: 'Subscription verification failed' });
    const payment = await razorpay(`/payments/${encodeURIComponent(paymentID)}`);
    const plan = planDefinition(subscription.plan_key, subscription.pricing_region || (subscription.currency === 'USD' ? 'INTL' : 'IN'));
    if ((payment.subscription_id && payment.subscription_id !== subscriptionID)
      || Number(payment.amount) !== Number(plan?.amountPaise)
      || String(payment.currency || '').toUpperCase() !== String(plan?.currency || subscription.currency || '').toUpperCase()) {
      return send(res, 400, { error: 'Payment does not match this checkout session' });
    }
    if (payment.status !== 'captured') return send(res, 202, { status: payment.status, message: 'Payment received but is not captured yet' });
    const existingPayment = (await database().query(
      'SELECT subscription_record_id FROM cheaty_payments WHERE razorpay_payment_id=$1',
      [paymentID]
    )).rows[0];
    if (existingPayment) {
      if (existingPayment.subscription_record_id !== subscription.subscription_record_id) return send(res, 409, { error: 'Payment is already linked to another subscription' });
      return send(res, 200, {
        status: 'paid',
        plan_key: subscription.plan_key,
        plan_name: subscription.plan_key === 'annual' ? 'Cheatly Annual' : 'Cheatly Monthly',
        amount: payment.amount,
        currency: payment.currency,
        paid_at: payment.created_at || null,
        payment_id: payment.id || paymentID,
        subscription_id: subscriptionID,
        expires_at: subscription.current_end_at || null,
        message: 'Paid access is active'
      });
    }
    if (subscription.checkout_consumed_at) return send(res, 409, { error: 'This checkout session has already been used' });
    const activation = await activateSubscription(subscriptionID, paymentID, 'checkout.completed', payment);
    try { await notifyPaidAccess({ sessionID, planName: subscription.plan_key === 'annual' ? 'Cheatly Annual' : 'Cheatly Monthly' }); } catch (deliveryError) { console.error('Paid delivery email failed:', deliveryError); }
    return send(res, 200, {
      status: 'paid',
      plan_key: subscription.plan_key,
      plan_name: subscription.plan_key === 'annual' ? 'Cheatly Annual' : 'Cheatly Monthly',
      amount: payment.amount,
      currency: payment.currency,
      paid_at: payment.created_at || null,
      payment_id: payment.id || paymentID,
      subscription_id: subscriptionID,
      expires_at: activation?.paidUntil || null,
      message: 'Paid access is active'
    });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Could not verify subscription' });
  }
}
