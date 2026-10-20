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
