import { database, ensureSchema, send } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  try {
    await ensureSchema();
    await database().query('SELECT 1');
    return send(res, 200, {
      ok: true,
      database: 'connected',
      razorpayKey: Boolean(process.env.RAZORPAY_KEY_ID),
      razorpaySecret: Boolean(process.env.RAZORPAY_KEY_SECRET),
      webhookSecret: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
      checkoutURL: Boolean(process.env.CHECKOUT_PAGE_URL)
    });
  } catch (error) {
    console.error(error);
    return send(res, 503, { ok: false, error: 'Backend configuration or database check failed' });
  }
}
