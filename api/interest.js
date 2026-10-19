import crypto from 'node:crypto';
import { applyCors, database, ensureSchema, readJSON, send } from './_lib.js';
import { notifyInterest } from './_lib/mailer.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
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
    let emailStatus = { customerSent: false, adminSent: false, configured: false };
    try {
      emailStatus = await notifyInterest({ email, mobile });
    } catch (emailError) {
      // Keep the lead even if a provider is temporarily unavailable; it can be resent later.
      console.error('Interest email failed:', emailError);
      emailStatus = { customerSent: false, adminSent: false, configured: true };
    }
    return send(res, 200, {
      ok: true,
      lead_id: result.rows[0].lead_id,
      email_sent: emailStatus.customerSent,
      message: emailStatus.customerSent
        ? 'You are on the early-access list. Check your email for confirmation.'
        : 'You are on the early-access list. We will email you when access is ready.'
    });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Could not save your interest' });
  }
}
