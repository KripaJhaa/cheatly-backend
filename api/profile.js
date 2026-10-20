import { applyCors, database, ensureSchema, send } from './_lib.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  try {
    const sessionID = String(req.query?.session_id || '').trim();
    if (!sessionID) return send(res, 400, { error: 'session_id is required' });
    await ensureSchema();
    const customer = (await database().query(
      `SELECT c.customer_id, c.email, c.mobile, s.session_id, s.status, s.plan_key, s.trial_expires_at, s.paid_until
       FROM cheaty_sessions s LEFT JOIN cheaty_customers c ON c.customer_id=s.customer_id WHERE s.session_id=$1`, [sessionID]
    )).rows[0];
    if (!customer) return send(res, 404, { error: 'Profile not found' });
    const payments = (await database().query(
      `SELECT razorpay_payment_id, amount_paise, currency, status, event_name, created_at
       FROM cheaty_payments WHERE session_id=$1 ORDER BY created_at DESC`, [sessionID]
    )).rows;
    return send(res, 200, { customer, payments });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Could not load profile' });
  }
}
