import { applyCors, database, ensureSchema, readJSON, send, pricePaise, pricingRegion, razorpay, checkoutURL } from './_lib.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const { session_id: sessionID } = await readJSON(req);
    await ensureSchema();
    const result = await database().query('SELECT * FROM cheaty_sessions WHERE session_id=$1', [sessionID]);
    const session = result.rows[0];
    if (!session) return send(res, 404, { error: 'Session not found' });
    if (session.status === 'paid') return send(res, 409, { error: 'This session is already paid' });
    if (session.razorpay_order_id) return send(res, 200, { order_id: session.razorpay_order_id, amount: session.razorpay_order_amount_minor || pricePaise(session.razorpay_order_currency === 'USD' ? 'INTL' : 'IN'), currency: session.razorpay_order_currency || 'INR', checkout_url: checkoutURL(sessionID) });
    const region = pricingRegion(req);
    const amount = pricePaise(region);
    const currency = region === 'INTL' ? 'USD' : 'INR';
    const order = await razorpay('/orders', { method: 'POST', body: JSON.stringify({ amount, currency, receipt: `cheatly_${String(sessionID).replaceAll('-', '').slice(0, 28)}`, notes: { session_id: sessionID, product: 'cheatly_lifetime', pricing_region: region } }) });
    await database().query('UPDATE cheaty_sessions SET razorpay_order_id=$1, razorpay_order_amount_minor=$2, razorpay_order_currency=$3, updated_at=NOW() WHERE session_id=$4', [order.id, order.amount, order.currency, sessionID]);
    return send(res, 200, { order_id: order.id, amount: order.amount, currency: order.currency, checkout_url: checkoutURL(sessionID) });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Could not create payment order' });
  }
}
