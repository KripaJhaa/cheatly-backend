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
