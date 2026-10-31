import { applyCors, database, ensureSchema, planDefinition, pricingRegion, readJSON, send, razorpay, checkoutURL } from './_lib.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJSON(req);
    const sessionID = String(body.session_id || '').trim();
    const planKey = String(body.plan_key || 'lifetime').trim().toLowerCase();
    const region = pricingRegion(req);
    const plan = planDefinition(planKey, region);
    if (!sessionID || !plan || plan.kind !== 'one_time') return send(res, 400, { error: 'A valid one-time plan is required' });
    await ensureSchema();
    const result = await database().query('SELECT * FROM cheaty_sessions WHERE session_id=$1', [sessionID]);
    const session = result.rows[0];
    if (!session) return send(res, 404, { error: 'Session not found' });
    if (session.status === 'paid') return send(res, 409, { error: 'This session is already paid' });
    const amount = plan.amountPaise;
    const currency = plan.currency;
    const existingAmount = Number(session.razorpay_order_amount_minor || 0);
    const existingCurrency = String(session.razorpay_order_currency || '').toUpperCase();
    if (session.razorpay_order_id && existingAmount === amount && existingCurrency === currency) {
      return send(res, 200, { order_id: session.razorpay_order_id, amount, currency, plan_key: plan.key, checkout_url: checkoutURL(sessionID) });
    }
    const order = await razorpay('/orders', { method: 'POST', body: JSON.stringify({ amount, currency, receipt: `cheatly_${String(sessionID).replaceAll('-', '').slice(0, 28)}`, notes: { session_id: sessionID, plan_key: plan.key, product: 'cheatly', pricing_region: region } }) });
    await database().query('UPDATE cheaty_sessions SET razorpay_order_id=$1, razorpay_order_amount_minor=$2, razorpay_order_currency=$3, updated_at=NOW() WHERE session_id=$4', [order.id, order.amount, order.currency, sessionID]);
    return send(res, 200, { order_id: order.id, amount: order.amount, currency: order.currency, plan_key: plan.key, checkout_url: checkoutURL(sessionID) });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Could not create payment order' });
  }
}
