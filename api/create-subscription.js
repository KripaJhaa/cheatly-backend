import crypto from 'node:crypto';
import { applyCors, database, ensureSchema, planDefinition, pricingRegion, readJSON, requireEnv, send, razorpay } from './_lib.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJSON(req);
    const sessionID = String(body.session_id || '').trim();
    const planKey = String(body.plan_key || 'monthly').trim().toLowerCase();
    const region = pricingRegion(req);
    const plan = planDefinition(planKey, region);
    if (!sessionID || !plan || plan.kind !== 'subscription') return send(res, 400, { error: 'A valid subscription plan is required' });
    await ensureSchema();
    const session = (await database().query('SELECT * FROM cheaty_sessions WHERE session_id=$1', [sessionID])).rows[0];
    if (!session) return send(res, 404, { error: 'Session not found' });
    if (!session.customer_id || !session.email) return send(res, 400, { error: 'Complete registration before choosing a plan' });
    if (session.status === 'paid' && session.paid_until && new Date(session.paid_until) > new Date()) return send(res, 409, { error: 'This session already has active paid access' });
    const providerPlan = await razorpay(`/plans/${encodeURIComponent(plan.razorpayPlanID)}`);
    const providerAmount = Number(providerPlan?.item?.amount || 0);
    const providerCurrency = String(providerPlan?.item?.currency || '').toUpperCase();
    if (providerAmount !== plan.amountPaise || providerCurrency !== plan.currency) {
      return send(res, 409, { error: 'This plan is temporarily unavailable. Please try again later.' });
    }
    const existing = (await database().query(
      `SELECT * FROM cheaty_subscriptions WHERE session_id=$1 AND plan_key=$2 AND pricing_region=$3 AND status IN ('created','authenticated','active') ORDER BY created_at DESC LIMIT 1`,
      [sessionID, planKey, region]
    )).rows[0];
    if (existing) {
      let existingProviderSubscription = null;
      try {
        existingProviderSubscription = await razorpay(`/subscriptions/${encodeURIComponent(existing.razorpay_subscription_id)}`);
      } catch (lookupError) {
        console.error('Could not inspect existing Razorpay subscription:', lookupError);
      }
      const samePlan = existingProviderSubscription?.plan_id === plan.razorpayPlanID;
      const reusableStatus = ['created', 'authenticated', 'active'].includes(String(existingProviderSubscription?.status || '').toLowerCase());
      if (samePlan && reusableStatus) return send(res, 200, { subscription_id: existing.razorpay_subscription_id, plan_key: plan.key, key_id: requireEnv('RAZORPAY_KEY_ID'), amount: plan.amountPaise, currency: plan.currency });
    }
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
      `INSERT INTO cheaty_subscriptions(subscription_record_id, customer_id, session_id, plan_key, razorpay_subscription_id, currency, pricing_region, status)
       VALUES($1,$2,$3,$4,$5,$6,$7,'created')`,
      [crypto.randomUUID(), session.customer_id, session.session_id, plan.key, subscription.id, plan.currency, region]
    );
    await database().query('UPDATE cheaty_sessions SET plan_key=$1, razorpay_subscription_id=$2, updated_at=NOW() WHERE session_id=$3', [plan.key, subscription.id, sessionID]);
    return send(res, 200, { subscription_id: subscription.id, plan_key: plan.key, key_id: requireEnv('RAZORPAY_KEY_ID'), name: plan.name, amount: plan.amountPaise, currency: plan.currency });
  } catch (error) {
    console.error(error);
    return send(res, 502, { error: error instanceof Error && error.message ? error.message : 'Could not create subscription' });
  }
}
