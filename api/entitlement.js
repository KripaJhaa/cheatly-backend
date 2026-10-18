import { database, ensureSchema, readJSON, send, checkoutURL, getOrCreateSession } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJSON(req);
    const installID = String(body.install_id || body.installID || '').trim();
    if (installID.length < 8 || installID.length > 180) return send(res, 400, { error: 'A valid install_id is required' });
    await ensureSchema();
    let row = await getOrCreateSession(installID);
    const expired = row.status !== 'paid' && new Date(row.trial_expires_at) <= new Date();
    if (expired && row.status !== 'expired') {
      row = (await database().query(`UPDATE cheaty_sessions SET status='expired', updated_at=NOW() WHERE session_id=$1 RETURNING *`, [row.session_id])).rows[0];
    }
    const status = row.status === 'paid' ? 'paid' : (expired || row.status === 'expired' ? 'expired' : 'trial');
    return send(res, 200, { status, expiresAt: row.trial_expires_at, message: status === 'trial' ? 'Free trial active' : status === 'paid' ? 'Lifetime access active' : 'Your trial has ended. Purchase lifetime access.', checkoutURL: checkoutURL(row.session_id) });
  } catch (error) {
    console.error(error);
    return send(res, 503, { error: 'Access could not be verified' });
  }
}
