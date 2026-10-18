import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
let pool;
let schemaReady;

export function database() {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!connectionString) throw new Error('POSTGRES_URL or DATABASE_URL is not configured');
    pool = new Pool({ connectionString, max: 3, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = database().query(`
      CREATE TABLE IF NOT EXISTS cheaty_sessions (
        session_id UUID PRIMARY KEY,
        install_id TEXT NOT NULL UNIQUE,
        email TEXT,
        mobile TEXT,
        status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'paid', 'expired')),
        trial_expires_at TIMESTAMPTZ NOT NULL,
        razorpay_order_id TEXT UNIQUE,
        razorpay_payment_id TEXT UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE cheaty_sessions ADD COLUMN IF NOT EXISTS mobile TEXT;
      CREATE INDEX IF NOT EXISTS cheaty_sessions_status_idx ON cheaty_sessions(status);
      CREATE TABLE IF NOT EXISTS cheaty_interest_leads (
        lead_id UUID PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        mobile TEXT,
        source TEXT NOT NULL DEFAULT 'website',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS cheaty_interest_leads_created_idx ON cheaty_interest_leads(created_at DESC);
    `);
  }
  await schemaReady;
}

export function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').end(JSON.stringify(body));
}

export async function readJSON(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export function appURL(path) {
  const base = (process.env.PUBLIC_BASE_URL || `https://${process.env.VERCEL_URL || 'api.cheatly.pro'}`).replace(/\/$/, '');
  return `${base}${path}`;
}

export function checkoutURL(sessionID) {
  const page = process.env.CHECKOUT_PAGE_URL || appURL('/checkout.html');
  return `${page}${page.includes('?') ? '&' : '?'}session_id=${encodeURIComponent(sessionID)}`;
}

export function trialDays() {
  const days = Number(process.env.TRIAL_DAYS || 7);
  return Number.isFinite(days) && days > 0 ? Math.min(days, 30) : 7;
}

export async function getOrCreateSession(installID, email = null, mobile = null) {
  await ensureSchema();
  const existing = await database().query('SELECT * FROM cheaty_sessions WHERE install_id=$1', [installID]);
  if (existing.rows[0]) {
    if (email || mobile) {
      return (await database().query(
        `UPDATE cheaty_sessions SET email=COALESCE($2,email), mobile=COALESCE($3,mobile), updated_at=NOW() WHERE install_id=$1 RETURNING *`,
        [installID, email ? String(email).slice(0, 320) : null, mobile ? String(mobile).slice(0, 32) : null]
      )).rows[0];
    }
    return existing.rows[0];
  }
  const sessionID = crypto.randomUUID();
  const expires = new Date(Date.now() + trialDays() * 86400000);
  try {
    const created = await database().query(
      `INSERT INTO cheaty_sessions(session_id, install_id, email, mobile, trial_expires_at) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [sessionID, installID, email ? String(email).slice(0, 320) : null, mobile ? String(mobile).slice(0, 32) : null, expires]
    );
    return created.rows[0];
  } catch (error) {
    // Two first launches can race; return the session created by the winner.
    if (error.code !== '23505') throw error;
    return (await database().query('SELECT * FROM cheaty_sessions WHERE install_id=$1', [installID])).rows[0];
  }
}

export function pricePaise() {
  const amount = Number(process.env.PRICE_PAISE || 200000);
  return Number.isInteger(amount) && amount > 0 ? amount : 200000;
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function safeEqual(left, right) {
  const a = Buffer.from(left || '');
  const b = Buffer.from(right || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function razorpaySignature(orderID, paymentID) {
  return crypto.createHmac('sha256', requireEnv('RAZORPAY_KEY_SECRET').trim()).update(`${orderID}|${paymentID}`).digest('hex');
}

export function webhookSignature(raw) {
  return crypto.createHmac('sha256', requireEnv('RAZORPAY_WEBHOOK_SECRET').trim()).update(raw).digest('hex');
}

export async function razorpay(path, options = {}) {
  const keyID = requireEnv('RAZORPAY_KEY_ID').trim();
  const keySecret = requireEnv('RAZORPAY_KEY_SECRET').trim();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${keyID}:${keySecret}`).toString('base64')}`, ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.description || `Razorpay request failed (${response.status})`);
  return data;
}

export async function markOrderPaid(orderID, paymentID = null) {
  await ensureSchema();
  const result = await database().query(
    `UPDATE cheaty_sessions SET status='paid', razorpay_payment_id=COALESCE($2, razorpay_payment_id), updated_at=NOW()
     WHERE razorpay_order_id=$1 RETURNING session_id`, [orderID, paymentID]
  );
  return result.rows[0] || null;
}
