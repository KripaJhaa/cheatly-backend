import crypto from 'node:crypto';
import { database, ensureSchema, readJSON, send } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJSON(req);
    const email = String(body.email || '').trim().toLowerCase();
    const mobile = String(body.mobile || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return send(res, 400, { error: 'Enter a valid email address' });
    if (mobile && !/^\+?[0-9 ()-]{8,20}$/.test(mobile)) return send(res, 400, { error: 'Enter a valid mobile number' });

    await ensureSchema();
    const result = await database().query(
      `INSERT INTO cheaty_interest_leads(lead_id, email, mobile)
       VALUES($1, $2, $3)
       ON CONFLICT(email) DO UPDATE SET mobile=COALESCE(EXCLUDED.mobile, cheaty_interest_leads.mobile), updated_at=NOW()
       RETURNING lead_id`,
      [crypto.randomUUID(), email.slice(0, 320), mobile ? mobile.slice(0, 32) : null]
    );
    return send(res, 200, { ok: true, lead_id: result.rows[0].lead_id, message: 'You are on the early-access list.' });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Could not save your interest' });
  }
}
