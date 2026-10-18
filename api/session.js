import { readJSON, send, checkoutURL, getOrCreateSession } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJSON(req);
    const installID = String(body.install_id || body.installID || '').trim();
    if (installID.length < 8 || installID.length > 180) return send(res, 400, { error: 'A valid install_id is required' });
    const row = await getOrCreateSession(installID, body.email);
    return send(res, 200, { session_id: row.session_id, status: row.status, expires_at: row.trial_expires_at, checkout_url: checkoutURL(row.session_id) });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Could not create session' });
  }
}
