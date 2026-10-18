import { database, ensureSchema, readJSON, send, pricePaise, razorpay, checkoutURL } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const { session_id: sessionID } = await readJSON(req);
    await ensureSchema();
    const result = await database().query('SELECT * FROM cheaty_sessions WHERE session_id=$1', [sessionID]);
    const session = result.rows[0];
    if (!session) return send(res, 404, { error: 'Session not found' });
    if (session.status === 'paid') return send(res, 409, { error: 'This session is already paid' });
    if (session.razorpay_order_id) return send(res, 200, { order_id: session.razorpay_order_id, amount: pricePaise(), currency: 'INR', checkout_url: checkoutURL(sessionID) });
    const order = await razorpay('/orders', { method: 'POST', body: JSON.stringify({ amount: pricePaise(), currency: 'INR', receipt: `cheatly_${String(sessionID).replaceAll('-', '').slice(0, 28)}`, notes: { session_id: sessionID, product: 'cheatly_lifetime' } }) });
    await database().query('UPDATE cheaty_sessions SET razorpay_order_id=$1, updated_at=NOW() WHERE session_id=$2', [order.id, sessionID]);
    return send(res, 200, { order_id: order.id, amount: order.amount, currency: order.currency, checkout_url: checkoutURL(sessionID) });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Could not create payment order' });
  }
}
