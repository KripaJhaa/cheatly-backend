import { database, ensureSchema, readJSON, send, razorpaySignature, safeEqual, razorpay, markOrderPaid } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJSON(req);
    const sessionID = String(body.session_id || '');
    const orderID = String(body.razorpay_order_id || '');
    const paymentID = String(body.razorpay_payment_id || '');
    const signature = String(body.razorpay_signature || '');
    await ensureSchema();
    const result = await database().query('SELECT * FROM cheaty_sessions WHERE session_id=$1 AND razorpay_order_id=$2', [sessionID, orderID]);
    if (!result.rows[0] || !safeEqual(razorpaySignature(orderID, paymentID), signature)) return send(res, 400, { error: 'Payment verification failed' });
    const payment = await razorpay(`/payments/${encodeURIComponent(paymentID)}`);
    if (payment.status !== 'captured') return send(res, 202, { status: payment.status, message: 'Payment received but not captured yet' });
    await markOrderPaid(orderID, paymentID);
    return send(res, 200, { status: 'paid', message: 'Lifetime access is active' });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Could not verify payment' });
  }
}
