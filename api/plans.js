import { applyCors, planDefinitions, send } from './_lib.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  return send(res, 200, {
    plans: planDefinitions().map(({ razorpayPlanID, ...plan }) => plan)
  });
}
