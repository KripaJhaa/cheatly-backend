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
        razorpay_order_amount_minor INTEGER,
        razorpay_order_currency TEXT NOT NULL DEFAULT 'INR',
        razorpay_payment_id TEXT UNIQUE,
        razorpay_subscription_id TEXT UNIQUE,
        checkout_consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE cheaty_sessions ADD COLUMN IF NOT EXISTS customer_id UUID;
      ALTER TABLE cheaty_sessions ADD COLUMN IF NOT EXISTS mobile TEXT;
      ALTER TABLE cheaty_sessions ADD COLUMN IF NOT EXISTS paid_until TIMESTAMPTZ;
      ALTER TABLE cheaty_sessions ADD COLUMN IF NOT EXISTS plan_key TEXT;
      ALTER TABLE cheaty_sessions ADD COLUMN IF NOT EXISTS razorpay_order_amount_minor INTEGER;
      ALTER TABLE cheaty_sessions ADD COLUMN IF NOT EXISTS razorpay_order_currency TEXT NOT NULL DEFAULT 'INR';
      ALTER TABLE cheaty_sessions ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT UNIQUE;
      ALTER TABLE cheaty_sessions ADD COLUMN IF NOT EXISTS checkout_consumed_at TIMESTAMPTZ;
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
        currency TEXT NOT NULL DEFAULT 'INR',
        pricing_region TEXT NOT NULL DEFAULT 'IN',
        status TEXT NOT NULL DEFAULT 'created',
        current_start_at TIMESTAMPTZ,
        current_end_at TIMESTAMPTZ,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE cheaty_subscriptions ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
      ALTER TABLE cheaty_subscriptions ADD COLUMN IF NOT EXISTS pricing_region TEXT NOT NULL DEFAULT 'IN';
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
      CREATE TABLE IF NOT EXISTS cheaty_download_tokens (
        download_token_id UUID PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        customer_id UUID NOT NULL REFERENCES cheaty_customers(customer_id),
        session_id UUID NOT NULL REFERENCES cheaty_sessions(session_id),
        purpose TEXT NOT NULL DEFAULT 'paid_installer',
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(session_id, purpose)
      );
      CREATE INDEX IF NOT EXISTS cheaty_download_tokens_expiry_idx ON cheaty_download_tokens(expires_at);
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

export function requestCountry(req) {
  const country = req?.headers?.['x-vercel-ip-country'] || req?.headers?.['cf-ipcountry'] || '';
  return /^[A-Za-z]{2}$/.test(country) ? String(country).toUpperCase() : null;
}

export function pricingRegion(req) {
  const forced = String(process.env.PRICING_REGION || '').trim().toUpperCase();
  if (forced === 'IN' || forced === 'INTL') return forced;
  const country = requestCountry(req);
  return country ? (country === 'IN' ? 'IN' : 'INTL') : 'IN';
}

// International prices are fixed USD amounts in cents. Keeping these values
// explicit avoids exposing FX decimals and keeps every price on a $5 step.
const INTERNATIONAL_PRICE_MINOR = Object.freeze({
  monthly: 500,
  annual: 4500,
  lifetime: 3000
});

export function trialDays() {
  const days = Number(process.env.TRIAL_DAYS || 7);
  return Number.isFinite(days) && days > 0 ? Math.min(days, 30) : 7;
}

export function planDefinitions(region = 'IN') {
  const international = String(region).toUpperCase() === 'INTL';
  const currency = international ? 'USD' : 'INR';
  const monthlyINR = Number(process.env.MONTHLY_PRICE_PAISE || 29900);
  const annualINR = Number(process.env.ANNUAL_PRICE_PAISE || 299000);
  const lifetimeINR = Number(process.env.LIFETIME_PRICE_PAISE || process.env.PRICE_PAISE || 200000);
  const amount = (planKey, inrPaise) => international ? INTERNATIONAL_PRICE_MINOR[planKey] : inrPaise;
  const plans = [
    {
      key: 'monthly',
      name: 'Cheatly Monthly',
      description: 'Private workspace access, billed monthly.',
      interval: 'monthly',
      amountPaise: amount('monthly', monthlyINR),
      currency,
      pricingRegion: international ? 'INTL' : 'IN',
      razorpayPlanID: international ? process.env.RAZORPAY_PLAN_MONTHLY_USD || '' : process.env.RAZORPAY_PLAN_MONTHLY || ''
    },
    {
      key: 'annual',
      name: 'Cheatly Annual',
      description: 'Private workspace access, billed yearly.',
      interval: 'annual',
      kind: 'subscription',
      amountPaise: amount('annual', annualINR),
      currency,
      pricingRegion: international ? 'INTL' : 'IN',
      razorpayPlanID: international ? process.env.RAZORPAY_PLAN_ANNUAL_USD || '' : process.env.RAZORPAY_PLAN_ANNUAL || ''
    }
  ];
  plans[0].kind = 'subscription';
  const lifetime = {
    key: 'lifetime',
    name: 'Cheatly Lifetime',
    description: 'One-time purchase with lifetime access.',
    interval: 'lifetime',
    kind: 'one_time',
    amountPaise: amount('lifetime', lifetimeINR),
    currency,
    pricingRegion: international ? 'INTL' : 'IN',
    razorpayPlanID: ''
  };
  const recurring = plans.filter((plan) => plan.razorpayPlanID && Number.isInteger(plan.amountPaise) && plan.amountPaise > 0);
  const lifetimeEnabled = process.env.LIFETIME_ENABLED !== 'false' && Number.isInteger(lifetime.amountPaise) && lifetime.amountPaise > 0;
  return lifetimeEnabled ? [...recurring, lifetime] : recurring;
}

export function planDefinition(planKey, region = 'IN') {
  return planDefinitions(region).find((plan) => plan.key === String(planKey || '').trim().toLowerCase()) || null;
}

export function subscriptionSignature(paymentID, subscriptionID) {
  return crypto.createHmac('sha256', requireEnv('RAZORPAY_KEY_SECRET').trim()).update(`${paymentID}|${subscriptionID}`).digest('hex');
}

export function addPlanInterval(date, interval) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + (interval === 'annual' ? 365 : 30));
  return result;
}

export function downloadTokenTTLHours() {
  const hours = Number(process.env.DOWNLOAD_LINK_TTL_HOURS || 72);
  return Number.isFinite(hours) && hours > 0 ? Math.min(hours, 168) : 72;
}

export function downloadTokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function downloadURL(token, purpose = 'paid_installer') {
  const suffix = purpose === 'paid_installer' ? '' : `&purpose=${encodeURIComponent(purpose)}`;
  return appURL(`/api/download?token=${encodeURIComponent(token)}${suffix}`);
}

export async function issueDownloadToken(sessionID, purpose = 'paid_installer') {
  await ensureSchema();
  const session = (await database().query(
    `SELECT s.*, c.email, c.customer_id AS linked_customer_id FROM cheaty_sessions s
     JOIN cheaty_customers c ON c.customer_id=s.customer_id WHERE s.session_id=$1`, [sessionID]
  )).rows[0];
  const provider = String(process.env.ARTIFACT_PROVIDER || 'r2').trim().toLowerCase();
  const artifactConfigured = provider === 'static'
    ? Boolean(process.env.CHEATLY_ARTIFACT_URL)
    : Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET && process.env.R2_OBJECT_KEY && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
  if (!session || !session.email || !artifactConfigured) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + downloadTokenTTLHours() * 3600000);
  const inserted = await database().query(
    `INSERT INTO cheaty_download_tokens(download_token_id, token_hash, customer_id, session_id, purpose, expires_at)
     VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(session_id, purpose) DO NOTHING RETURNING download_token_id`,
    [crypto.randomUUID(), downloadTokenHash(token), session.customer_id, session.session_id, purpose, expiresAt]
  );
  if (!inserted.rows[0]) return null;
  return { token, expiresAt, session };
}

export async function revokeDownloadToken(token) {
  await ensureSchema();
  await database().query('DELETE FROM cheaty_download_tokens WHERE token_hash=$1 AND used_at IS NULL', [downloadTokenHash(token)]);
}

export async function consumeDownloadToken(token, purpose = 'paid_installer') {
  await ensureSchema();
  const db = database();
  await db.query('BEGIN');
  try {
    const result = await db.query(
      `SELECT d.*, s.email, s.install_id FROM cheaty_download_tokens d
       JOIN cheaty_sessions s ON s.session_id=d.session_id
       WHERE d.token_hash=$1 AND d.purpose=$2 AND d.used_at IS NULL AND d.expires_at>NOW()
       FOR UPDATE`, [downloadTokenHash(token), purpose]
    );
    const delivery = result.rows[0];
    if (!delivery) {
      await db.query('ROLLBACK');
      return null;
    }
    await db.query('UPDATE cheaty_download_tokens SET used_at=NOW() WHERE download_token_id=$1', [delivery.download_token_id]);
    await db.query('COMMIT');
    return delivery;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
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
  // A new install ID must not restart a customer's trial. Reinstalling the
  // app or downloading it on another Mac creates a new session, but access is
  // inherited from the customer's existing server-side entitlement.
  const prior = customer
    ? (await database().query(
      `SELECT status, trial_expires_at, paid_until, plan_key
       FROM cheaty_sessions WHERE customer_id=$1 ORDER BY created_at ASC LIMIT 1`,
      [customer.customer_id]
    )).rows[0]
    : null;
  const sessionID = crypto.randomUUID();
  const expires = prior?.trial_expires_at ? new Date(prior.trial_expires_at) : new Date(Date.now() + trialDays() * 86400000);
  const paidActive = prior?.status === 'paid' && (!prior.paid_until || new Date(prior.paid_until) > new Date());
  const status = paidActive ? 'paid' : expires <= new Date() ? 'expired' : 'trial';
  try {
    const created = await database().query(
      `INSERT INTO cheaty_sessions(session_id, install_id, customer_id, email, mobile, status, trial_expires_at, paid_until, plan_key)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [sessionID, installID, customer?.customer_id || null, email ? String(email).slice(0, 320) : null, mobile ? String(mobile).slice(0, 32) : null, status, expires, paidActive ? prior.paid_until : null, paidActive ? prior.plan_key : null]
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
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [crypto.randomUUID(), session.customer_id, session.session_id, session.install_id, session.status, session.trial_expires_at]
  );
  if (session.paid_until) {
    await database().query('UPDATE cheaty_licenses SET paid_until=$2, updated_at=NOW() WHERE license_id=$1', [created.rows[0].license_id, session.paid_until]);
    created.rows[0].paid_until = session.paid_until;
  }
  return created.rows[0];
}

export function pricePaise(region = 'IN') {
  const amount = Number(process.env.LIFETIME_PRICE_PAISE || process.env.PRICE_PAISE || 200000);
  const base = Number.isInteger(amount) && amount > 0 ? amount : 200000;
  return String(region).toUpperCase() === 'INTL' ? INTERNATIONAL_PRICE_MINOR.lifetime : base;
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

export async function markOrderPaid(orderID, paymentID = null, providerPayment = null) {
  await ensureSchema();
  const db = database();
  const session = (await db.query('SELECT * FROM cheaty_sessions WHERE razorpay_order_id=$1', [orderID])).rows[0];
  if (!session) return null;
  const amountMinor = Number(providerPayment?.amount || session.razorpay_order_amount_minor || pricePaise(session.razorpay_order_currency === 'USD' ? 'INTL' : 'IN'));
  const currency = String(providerPayment?.currency || session.razorpay_order_currency || 'INR').toUpperCase();
  await db.query('BEGIN');
  try {
    await db.query(
      `UPDATE cheaty_sessions SET status='paid', paid_until=NULL, plan_key='lifetime', checkout_consumed_at=COALESCE(checkout_consumed_at, NOW()),
         razorpay_payment_id=CASE WHEN session_id=$1 THEN COALESCE($2, razorpay_payment_id) ELSE razorpay_payment_id END,
         updated_at=NOW() WHERE customer_id=$3`, [session.session_id, paymentID, session.customer_id]
    );
    await db.query(
      `UPDATE cheaty_licenses SET status='paid', paid_until=NULL, updated_at=NOW() WHERE session_id=$1`, [session.session_id]
    );
    if (paymentID && session.customer_id) {
      await db.query(
        `INSERT INTO cheaty_payments(payment_record_id, customer_id, session_id, razorpay_payment_id, razorpay_order_id, amount_paise, currency, status, event_name)
         VALUES($1,$2,$3,$4,$5,$6,$7,'captured','payment.captured') ON CONFLICT(razorpay_payment_id) DO NOTHING`,
        [crypto.randomUUID(), session.customer_id, session.session_id, paymentID, orderID, amountMinor, currency]
      );
    }
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
  return { sessionID: session.session_id };
}

export async function activateSubscription(subscriptionID, paymentID = null, eventName = 'subscription.charged', providerPayment = null) {
  await ensureSchema();
  const subscription = (await database().query(
    `SELECT s.*, c.email, c.mobile FROM cheaty_subscriptions s JOIN cheaty_customers c ON c.customer_id=s.customer_id WHERE s.razorpay_subscription_id=$1`,
    [subscriptionID]
  )).rows[0];
  if (!subscription) return null;
  if (paymentID) {
    const existingPayment = (await database().query(
      'SELECT subscription_record_id FROM cheaty_payments WHERE razorpay_payment_id=$1',
      [paymentID]
    )).rows[0];
    if (existingPayment) {
      if (existingPayment.subscription_record_id !== subscription.subscription_record_id) throw new Error('Payment is already linked to another subscription');
      return { sessionID: subscription.session_id, paidUntil: subscription.current_end_at, alreadyProcessed: true };
    }
  }
  const plan = planDefinition(subscription.plan_key, subscription.pricing_region || (subscription.currency === 'USD' ? 'INTL' : 'IN'));
  const amountMinor = Number(providerPayment?.amount || plan?.amountPaise || 0) || null;
  const currency = String(providerPayment?.currency || subscription.currency || plan?.currency || 'INR').toUpperCase();
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
      `UPDATE cheaty_sessions SET status='paid', paid_until=$2, plan_key=$3, checkout_consumed_at=COALESCE(checkout_consumed_at, NOW()),
       razorpay_subscription_id=CASE WHEN session_id=$1 THEN $4 ELSE razorpay_subscription_id END,
       updated_at=NOW() WHERE customer_id=$5`,
      [subscription.session_id, paidUntil, subscription.plan_key, subscriptionID, subscription.customer_id]
    );
    await db.query(
      `UPDATE cheaty_licenses SET status='paid', paid_until=$2, updated_at=NOW() WHERE customer_id=$1`,
      [subscription.customer_id, paidUntil]
    );
    if (paymentID) {
      await db.query(
        `INSERT INTO cheaty_payments(payment_record_id, customer_id, subscription_record_id, session_id, razorpay_payment_id, razorpay_subscription_id, amount_paise, currency, status, event_name)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'captured',$9) ON CONFLICT(razorpay_payment_id) DO NOTHING`,
        [crypto.randomUUID(), subscription.customer_id, subscription.subscription_record_id, subscription.session_id, paymentID, subscriptionID, amountMinor, currency, eventName]
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
