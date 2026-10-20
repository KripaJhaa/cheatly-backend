import crypto from 'node:crypto';
import { database, ensureSchema, planDefinition, readJSON, requireEnv, send, razorpay } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJSON(req);
    const sessionID = String(body.session_id || '').trim();
    const planKey = String(body.plan_key || 'monthly').trim().toLowerCase();
    const plan = planDefinition(planKey);
    if (!sessionID || !plan) return send(res, 400, { error: 'A valid session and configured plan are required' });
    await ensureSchema();
    const session = (await database().query('SELECT * FROM cheaty_sessions WHERE session_id=$1', [sessionID])).rows[0];
    if (!session) return send(res, 404, { error: 'Session not found' });
    if (!session.customer_id || !session.email) return send(res, 400, { error: 'Complete registration before choosing a plan' });
    if (session.status === 'paid' && session.paid_until && new Date(session.paid_until) > new Date()) return send(res, 409, { error: 'This session already has active paid access' });
    const existing = (await database().query(
      `SELECT * FROM cheaty_subscriptions WHERE session_id=$1 AND plan_key=$2 AND status IN ('created','authenticated','active') ORDER BY created_at DESC LIMIT 1`,
      [sessionID, planKey]
    )).rows[0];
    if (existing) return send(res, 200, { subscription_id: existing.razorpay_subscription_id, plan_key: plan.key, key_id: requireEnv('RAZORPAY_KEY_ID') });
    const subscription = await razorpay('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: plan.razorpayPlanID,
        total_count: Number(process.env.SUBSCRIPTION_TOTAL_COUNT || 120),
        customer_notify: 1,
        notes: { session_id: sessionID, customer_id: session.customer_id, plan_key: plan.key, product: 'cheatly' }
      })
    });
    await database().query(
      `INSERT INTO cheaty_subscriptions(subscription_record_id, customer_id, session_id, plan_key, razorpay_subscription_id, status)
       VALUES($1,$2,$3,$4,$5,'created')`,
      [crypto.randomUUID(), session.customer_id, session.session_id, plan.key, subscription.id]
    );
    await database().query('UPDATE cheaty_sessions SET plan_key=$1, razorpay_subscription_id=$2, updated_at=NOW() WHERE session_id=$3', [plan.key, subscription.id, sessionID]);
    return send(res, 200, { subscription_id: subscription.id, plan_key: plan.key, key_id: requireEnv('RAZORPAY_KEY_ID'), name: plan.name, amount: plan.amountPaise, currency: 'INR' });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Could not create subscription' });
  }
}
