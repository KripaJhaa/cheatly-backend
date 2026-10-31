import { applyCors, planDefinitions, pricingRegion, requestCountry, send } from './_lib.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const region = pricingRegion(req);
  return send(res, 200, {
    keyID: process.env.RAZORPAY_KEY_ID || '',
    name: 'Cheatly',
    description: 'Cheatly private workspace access',
    country: requestCountry(req),
    region,
    currency: region === 'INTL' ? 'USD' : 'INR',
    plans: planDefinitions(region).map(({ razorpayPlanID, ...plan }) => plan)
  });
}
