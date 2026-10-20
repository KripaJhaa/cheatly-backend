import { planDefinitions, send } from './_lib.js';

export default function handler(req, res) {
  send(res, 200, {
    keyID: process.env.RAZORPAY_KEY_ID || '',
    name: 'Cheatly',
    description: 'Cheatly private workspace access',
    plans: planDefinitions().map(({ razorpayPlanID, ...plan }) => plan)
  });
}
