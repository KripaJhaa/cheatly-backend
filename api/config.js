import { send, pricePaise } from './_lib.js';

export default function handler(req, res) {
  send(res, 200, {
    keyID: process.env.RAZORPAY_KEY_ID || '',
    amount: pricePaise(),
    currency: 'INR',
    name: 'Cheatly',
    description: 'Cheatly lifetime access'
  });
}
