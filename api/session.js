import crypto from 'node:crypto';
import { database, ensureSchema, readJSON, send, trialDays, checkoutURL } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJSON(req);
    const installID = String(body.install_id || body.installID || '').trim();
    if (installID.length < 8 || installID.length > 180) return send(res, 400, { error: 'A valid install_id is required' });
    await ensureSchema();
    const existing = await database().query('SELECT * FROM cheaty_sessions WHERE install_id=$1', [installID]);
    let row = existing.rows[0];
    if (!row) {
      const sessionID = crypto.randomUUID();
      const expires = new Date(Date.now() + trialDays() * 86400000);
      const created = await database().query(
        `INSERT INTO cheaty_sessions(session_id, install_id, email, trial_expires_at) VALUES($1,$2,$3,$4) RETURNING *`,
        [sessionID, installID, body.email ? String(body.email).slice(0, 320) : null, expires]
      );
      row = created.rows[0];
    }
    return send(res, 200, { session_id: row.session_id, status: row.status, expires_at: row.trial_expires_at, checkout_url: checkoutURL(row.session_id) });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Could not create session' });
  }
}
