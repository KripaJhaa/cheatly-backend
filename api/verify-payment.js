import { applyCors, database, ensureSchema, readJSON, send, razorpaySignature, safeEqual, razorpay, markOrderPaid } from './_lib.js';
import { notifyPaidAccess } from './_lib/mailer.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJSON(req);
    const sessionID = String(body.session_id || '');
    const orderID = String(body.razorpay_order_id || '');
    const paymentID = String(body.razorpay_payment_id || '');
    const signature = String(body.razorpay_signature || '');
    await ensureSchema();
    const result = await database().query('SELECT * FROM cheaty_sessions WHERE session_id=$1 AND razorpay_order_id=$2', [sessionID, orderID]);
    const session = result.rows[0];
    if (!session || !safeEqual(razorpaySignature(orderID, paymentID), signature)) return send(res, 400, { error: 'Payment verification failed' });
    if (session.checkout_consumed_at && session.razorpay_payment_id !== paymentID) return send(res, 409, { error: 'This checkout session has already been used' });
    const payment = await razorpay(`/payments/${encodeURIComponent(paymentID)}`);
    if (String(payment.order_id || '') !== orderID
      || Number(payment.amount) !== Number(session.razorpay_order_amount_minor)
      || String(payment.currency || '').toUpperCase() !== String(session.razorpay_order_currency || '').toUpperCase()) {
      return send(res, 400, { error: 'Payment does not match this checkout session' });
    }
    if (payment.status !== 'captured') return send(res, 202, { status: payment.status, message: 'Payment received but not captured yet' });
    await markOrderPaid(orderID, paymentID, payment);
    try { await notifyPaidAccess({ sessionID, planName: 'Cheatly Lifetime' }); } catch (deliveryError) { console.error('Paid delivery email failed:', deliveryError); }
    return send(res, 200, {
      status: 'paid',
      plan_key: session.plan_key || 'lifetime',
      plan_name: 'Cheatly Lifetime',
      amount: payment.amount,
      currency: payment.currency,
      paid_at: payment.created_at || null,
      payment_id: payment.id || paymentID,
      order_id: orderID,
      message: 'Lifetime access is active'
    });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Could not verify payment' });
  }
}
