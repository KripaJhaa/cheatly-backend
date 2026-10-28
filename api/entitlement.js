import { applyCors, database, ensureSchema, readJSON, send, checkoutURL, getOrCreateSession, ensureLicenseForSession } from './_lib.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJSON(req);
    const installID = String(body.install_id || body.installID || '').trim();
    if (installID.length < 8 || installID.length > 180) return send(res, 400, { error: 'A valid install_id is required' });
    await ensureSchema();
    let row = await getOrCreateSession(installID);
    await ensureLicenseForSession(row);
    const paidExpired = row.status === 'paid' && row.paid_until && new Date(row.paid_until) <= new Date();
    const expired = row.status !== 'paid' && new Date(row.trial_expires_at) <= new Date();
    if (paidExpired && row.status !== 'expired') {
      row = (await database().query(`UPDATE cheaty_sessions SET status='expired', updated_at=NOW() WHERE session_id=$1 RETURNING *`, [row.session_id])).rows[0];
    }
    if (expired && row.status !== 'expired') {
      row = (await database().query(`UPDATE cheaty_sessions SET status='expired', updated_at=NOW() WHERE session_id=$1 RETURNING *`, [row.session_id])).rows[0];
    }
    const status = row.status === 'paid' && (!row.paid_until || new Date(row.paid_until) > new Date()) ? 'paid' : (expired || row.status === 'expired' || paidExpired ? 'expired' : 'trial');
    const expiresAt = status === 'paid' ? row.paid_until : row.trial_expires_at;
    return send(res, 200, { status, expiresAt, registrationRequired: !row.email || !row.mobile, plan: row.plan_key || null, message: status === 'trial' ? 'Free trial active' : status === 'paid' ? 'Paid access active' : 'Your trial has ended. Choose a plan to continue.', checkoutURL: checkoutURL(row.session_id) });
  } catch (error) {
    console.error(error);
    return send(res, 503, { error: 'Access could not be verified' });
  }
}
