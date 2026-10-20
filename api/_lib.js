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
        customer_id UUID,
        email TEXT,
        mobile TEXT,
        status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'paid', 'expired')),
        trial_expires_at TIMESTAMPTZ NOT NULL,
        paid_until TIMESTAMPTZ,
        plan_key TEXT,
        razorpay_order_id TEXT UNIQUE,
        razorpay_payment_id TEXT UNIQUE,
        razorpay_subscription_id TEXT UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE cheaty_sessions ADD COLUMN IF NOT EXISTS customer_id UUID;
      ALTER TABLE cheaty_sessions ADD COLUMN IF NOT EXISTS mobile TEXT;
      ALTER TABLE cheaty_sessions ADD COLUMN IF NOT EXISTS paid_until TIMESTAMPTZ;
      ALTER TABLE cheaty_sessions ADD COLUMN IF NOT EXISTS plan_key TEXT;
      ALTER TABLE cheaty_sessions ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT UNIQUE;
      CREATE INDEX IF NOT EXISTS cheaty_sessions_status_idx ON cheaty_sessions(status);
      CREATE TABLE IF NOT EXISTS cheaty_customers (
        customer_id UUID PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        mobile TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS cheaty_subscriptions (
        subscription_record_id UUID PRIMARY KEY,
        customer_id UUID NOT NULL REFERENCES cheaty_customers(customer_id),
        session_id UUID REFERENCES cheaty_sessions(session_id),
        plan_key TEXT NOT NULL,
        razorpay_subscription_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'created',
        current_start_at TIMESTAMPTZ,
        current_end_at TIMESTAMPTZ,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS cheaty_subscriptions_customer_idx ON cheaty_subscriptions(customer_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS cheaty_payments (
        payment_record_id UUID PRIMARY KEY,
        customer_id UUID NOT NULL REFERENCES cheaty_customers(customer_id),
        subscription_record_id UUID REFERENCES cheaty_subscriptions(subscription_record_id),
        session_id UUID REFERENCES cheaty_sessions(session_id),
        razorpay_payment_id TEXT NOT NULL UNIQUE,
        razorpay_order_id TEXT,
        razorpay_subscription_id TEXT,
        amount_paise INTEGER,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL,
        event_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS cheaty_payments_customer_idx ON cheaty_payments(customer_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS cheaty_licenses (
        license_id UUID PRIMARY KEY,
        customer_id UUID NOT NULL REFERENCES cheaty_customers(customer_id),
        session_id UUID REFERENCES cheaty_sessions(session_id),
        install_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'paid', 'expired', 'revoked')),
        trial_expires_at TIMESTAMPTZ NOT NULL,
        paid_until TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS cheaty_licenses_customer_idx ON cheaty_licenses(customer_id);
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

export function applyCors(req, res) {
  const origin = String(req.headers.origin || '');
  const configured = String(process.env.CORS_ORIGINS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (configured.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
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

export function planDefinitions() {
  const plans = [
    {
      key: 'monthly',
      name: 'Cheatly Monthly',
      description: 'Private workspace access, billed monthly.',
      interval: 'monthly',
      amountPaise: Number(process.env.MONTHLY_PRICE_PAISE || 29900),
      razorpayPlanID: process.env.RAZORPAY_PLAN_MONTHLY || ''
    },
    {
      key: 'annual',
      name: 'Cheatly Annual',
      description: 'Private workspace access, billed yearly.',
      interval: 'annual',
      amountPaise: Number(process.env.ANNUAL_PRICE_PAISE || 299000),
      razorpayPlanID: process.env.RAZORPAY_PLAN_ANNUAL || ''
    }
  ];
  return plans.filter((plan) => plan.razorpayPlanID && Number.isInteger(plan.amountPaise) && plan.amountPaise > 0);
}

export function planDefinition(planKey) {
  return planDefinitions().find((plan) => plan.key === String(planKey || '').trim().toLowerCase()) || null;
}

export function subscriptionSignature(paymentID, subscriptionID) {
  return crypto.createHmac('sha256', requireEnv('RAZORPAY_KEY_SECRET').trim()).update(`${paymentID}|${subscriptionID}`).digest('hex');
}

export function addPlanInterval(date, interval) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + (interval === 'annual' ? 365 : 30));
  return result;
}

export async function getOrCreateCustomer(email, mobile = null) {
  await ensureSchema();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('A customer email is required');
  const result = await database().query(
    `INSERT INTO cheaty_customers(customer_id, email, mobile) VALUES($1,$2,$3)
     ON CONFLICT(email) DO UPDATE SET mobile=COALESCE(EXCLUDED.mobile, cheaty_customers.mobile), updated_at=NOW()
     RETURNING *`,
    [crypto.randomUUID(), normalizedEmail, mobile ? String(mobile).slice(0, 32) : null]
  );
  return result.rows[0];
}

export async function getOrCreateSession(installID, email = null, mobile = null) {
  await ensureSchema();
  const customer = email ? await getOrCreateCustomer(email, mobile) : null;
  const existing = await database().query('SELECT * FROM cheaty_sessions WHERE install_id=$1', [installID]);
  if (existing.rows[0]) {
    if (email || mobile || customer) {
      return (await database().query(
        `UPDATE cheaty_sessions SET customer_id=COALESCE($2,customer_id), email=COALESCE($3,email), mobile=COALESCE($4,mobile), updated_at=NOW() WHERE install_id=$1 RETURNING *`,
        [installID, customer?.customer_id || null, email ? String(email).slice(0, 320) : null, mobile ? String(mobile).slice(0, 32) : null]
      )).rows[0];
    }
    return existing.rows[0];
  }
  const sessionID = crypto.randomUUID();
  const expires = new Date(Date.now() + trialDays() * 86400000);
  try {
    const created = await database().query(
      `INSERT INTO cheaty_sessions(session_id, install_id, customer_id, email, mobile, trial_expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [sessionID, installID, customer?.customer_id || null, email ? String(email).slice(0, 320) : null, mobile ? String(mobile).slice(0, 32) : null, expires]
    );
    return created.rows[0];
  } catch (error) {
    // Two first launches can race; return the session created by the winner.
    if (error.code !== '23505') throw error;
    return (await database().query('SELECT * FROM cheaty_sessions WHERE install_id=$1', [installID])).rows[0];
  }
}

export async function ensureLicenseForSession(session) {
  if (!session.customer_id) return null;
  const existing = await database().query('SELECT * FROM cheaty_licenses WHERE install_id=$1', [session.install_id]);
  if (existing.rows[0]) return existing.rows[0];
  const created = await database().query(
    `INSERT INTO cheaty_licenses(license_id, customer_id, session_id, install_id, status, trial_expires_at)
     VALUES($1,$2,$3,$4,'trial',$5) RETURNING *`,
    [crypto.randomUUID(), session.customer_id, session.session_id, session.install_id, session.trial_expires_at]
  );
  return created.rows[0];
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
    `UPDATE cheaty_sessions SET status='paid', paid_until=NULL, razorpay_payment_id=COALESCE($2, razorpay_payment_id), updated_at=NOW()
     WHERE razorpay_order_id=$1 RETURNING session_id`, [orderID, paymentID]
  );
  return result.rows[0] || null;
}

export async function activateSubscription(subscriptionID, paymentID = null, eventName = 'subscription.charged') {
  await ensureSchema();
  const subscription = (await database().query(
    `SELECT s.*, c.email, c.mobile FROM cheaty_subscriptions s JOIN cheaty_customers c ON c.customer_id=s.customer_id WHERE s.razorpay_subscription_id=$1`,
    [subscriptionID]
  )).rows[0];
  if (!subscription) return null;
  const plan = planDefinition(subscription.plan_key);
  const currentEnd = subscription.current_end_at && new Date(subscription.current_end_at) > new Date()
    ? new Date(subscription.current_end_at)
    : new Date();
  const paidUntil = addPlanInterval(currentEnd, plan?.interval || 'monthly');
  const db = database();
  await db.query('BEGIN');
  try {
    await db.query(
      `UPDATE cheaty_subscriptions SET status='active', current_start_at=NOW(), current_end_at=$2, updated_at=NOW() WHERE subscription_record_id=$1`,
      [subscription.subscription_record_id, paidUntil]
    );
    await db.query(
      `UPDATE cheaty_sessions SET status='paid', paid_until=$2, plan_key=$3, razorpay_subscription_id=$4, updated_at=NOW()
       WHERE session_id=$1`, [subscription.session_id, paidUntil, subscription.plan_key, subscriptionID]
    );
    await db.query(
      `UPDATE cheaty_licenses SET status='paid', paid_until=$2, updated_at=NOW() WHERE customer_id=$1`,
      [subscription.customer_id, paidUntil]
    );
    if (paymentID) {
      await db.query(
        `INSERT INTO cheaty_payments(payment_record_id, customer_id, subscription_record_id, session_id, razorpay_payment_id, razorpay_subscription_id, amount_paise, status, event_name)
         VALUES($1,$2,$3,$4,$5,$6,$7,'captured',$8) ON CONFLICT(razorpay_payment_id) DO NOTHING`,
        [crypto.randomUUID(), subscription.customer_id, subscription.subscription_record_id, subscription.session_id, paymentID, subscriptionID, plan?.amountPaise || null, eventName]
      );
    }
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
  return { sessionID: subscription.session_id, paidUntil };
}

export async function markSubscriptionStatus(subscriptionID, status, cancelAtPeriodEnd = false) {
  await ensureSchema();
  const result = await database().query(
    `UPDATE cheaty_subscriptions SET status=$2, cancel_at_period_end=$3, updated_at=NOW()
     WHERE razorpay_subscription_id=$1 RETURNING session_id`,
    [subscriptionID, status, cancelAtPeriodEnd]
  );
  return result.rows[0] || null;
}
