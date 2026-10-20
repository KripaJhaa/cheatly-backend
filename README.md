# Cheatly licensing backend for Vercel

This is an independent Vercel project. It creates a trial session, creates Razorpay subscriptions for that session, verifies payments, receives Razorpay webhooks, and returns the entitlement used by the macOS app. The one-time order endpoints remain available for compatibility while subscriptions are rolled out.

## Endpoints

### Early-access interest

`POST /api/interest` stores an email and optional mobile number in `cheaty_interest_leads`. It is intended for the public website while the installer is distributed manually by email. Submitting the same email again updates the existing lead instead of creating a duplicate.

The endpoint reads its browser allowlist from the `CORS_ORIGINS` environment variable. Use comma-separated exact origins; do not put this list in frontend code. Configure it separately for each Vercel environment.

Example body:

```json
{"email":"person@example.com","mobile":"+91 98765 43210"}
```

### Email notifications

The interest endpoint uses a provider adapter selected by `MAIL_PROVIDER`. Resend is currently implemented; the endpoint does not contain provider-specific calls. Configure these Vercel environment variables to send a confirmation to the customer and, optionally, a notification to the owner:

```text
MAIL_PROVIDER=resend
RESEND_API_KEY=your-server-side-key
EMAIL_FROM=Cheatly <hello@cheatly.pro>
EMAIL_REPLY_TO=owner@example.com
ADMIN_EMAIL=owner@example.com
INTEREST_EMAIL_SUBJECT=You’re on the Cheatly early-access list
INTEREST_ADMIN_SUBJECT=New Cheatly early-access signup
CHEATLY_SITE_URL=https://cheatly.pro
CHEATLY_TNC_URL=https://cheatly.pro/tnc
CHEATLY_DOWNLOAD_URL=https://your-download-host.example/cheatly-installer.zip
CHEATLY_LOGO_URL=https://cheatly.pro/cheatly.png
INTEREST_CUSTOMER_TEMPLATE=early-access-v1
INTEREST_ADMIN_TEMPLATE=early-access-v1
```

Email copy is versioned under `api/_lib/email-templates/`. To introduce a new customer communication tomorrow, add a new file such as `early-access-v2.js`, export `customer` and `admin` functions, register it in `api/_lib/email-templates/index.js`, and change the corresponding Vercel template variable. The endpoint and mail provider do not need to change.

If email configuration is absent or temporarily fails, the lead is still saved and the API response reports `email_sent: false`. This prevents a mail-provider outage from losing an interested customer.

### Trials, plans, and profiles

The first paid version has a server-controlled trial and subscription model:

- `POST /api/session` registers an email/mobile pair against an installation and starts or resumes its trial.
- `POST /api/entitlement` is the macOS app's authoritative access check. `TRIAL_DAYS` controls the default trial length.
- `GET /api/plans` returns the configured monthly and annual plans without exposing Razorpay secrets.
- `POST /api/create-subscription` creates a Razorpay Subscription for a session and plan.
- `POST /api/verify-subscription` verifies the checkout callback. The webhook remains the source of truth.
- `GET /api/profile?session_id=...` returns the current customer view and payment history for the first profile implementation.

The hosted profile view is available at `/profile.html?session_id=...`. The session ID is intentionally scoped to the customer session and should be replaced with a magic-link token before exposing profile links broadly.

Configure Razorpay Plans in the dashboard and put their IDs in Vercel:

```text
RAZORPAY_PLAN_MONTHLY=plan_...
RAZORPAY_PLAN_ANNUAL=plan_...
MONTHLY_PRICE_PAISE=29900
ANNUAL_PRICE_PAISE=299000
SUBSCRIPTION_TOTAL_COUNT=120
TRIAL_DAYS=7
```

The database automatically creates customer, subscription, payment, and license records. Razorpay webhook events activate paid access and record recurring payments. Do not activate paid access based only on a browser redirect.

## Deploy

From this directory:

```bash
npm install
npx vercel login
npx vercel link
npx vercel env add POSTGRES_URL production
npx vercel env add RAZORPAY_KEY_ID production
npx vercel env add RAZORPAY_KEY_SECRET production
npx vercel env add RAZORPAY_WEBHOOK_SECRET production
npx vercel env add PUBLIC_BASE_URL production
npx vercel env add CHECKOUT_PAGE_URL production
npx vercel env add RAZORPAY_PLAN_MONTHLY production
npx vercel env add RAZORPAY_PLAN_ANNUAL production
npx vercel env add CORS_ORIGINS production
npx vercel --prod
```

Recommended values:

```text
PUBLIC_BASE_URL=https://api.cheatly.pro
CHECKOUT_PAGE_URL=https://api.cheatly.pro/checkout.html
CORS_ORIGINS=https://cheatly.pro,https://www.cheatly.pro
TRIAL_DAYS=7
MONTHLY_PRICE_PAISE=29900
ANNUAL_PRICE_PAISE=299000
RAZORPAY_PLAN_MONTHLY=plan_your_monthly_plan_id
RAZORPAY_PLAN_ANNUAL=plan_your_annual_plan_id
SUBSCRIPTION_TOTAL_COUNT=120
```

For Vercel Development, use the exact port where your local website runs, for example:

```text
CORS_ORIGINS=http://localhost:3000,http://localhost:8080,http://127.0.0.1:3000,http://127.0.0.1:8080
```

For a Vercel Preview deployment, add its preview URL as another exact origin in the Preview value. After changing an environment variable, redeploy; existing deployments do not automatically receive new environment values.

Connect a Vercel Postgres/Neon database and use its `POSTGRES_URL`. The schema is created automatically on the first request; `schema.sql` is also included for manual setup.

## Razorpay webhook

In Razorpay Dashboard, add:

```text
https://api.cheatly.pro/api/razorpay-webhook
```

Subscribe to `payment.captured`, `order.paid`, `subscription.authenticated`, and `subscription.charged`. Also add subscription cancellation/completion events when you are ready to expose subscription management. Use the same secret in Razorpay and `RAZORPAY_WEBHOOK_SECRET`.

## API contract

The macOS app calls `POST /api/entitlement` with `{ "install_id": "..." }`. The response is compatible with the app's entitlement client: `status` is `trial`, `paid`, or `expired`; `expiresAt` is the trial expiry; `registrationRequired` indicates whether email and mobile registration is incomplete; and `checkoutURL` points to the session-specific checkout page. Registration is submitted to `POST /api/session` with `install_id`, `email`, and `mobile`.

## Run the backend locally

Link this directory to the Vercel project and pull Development variables into the ignored local file:

```bash
npx vercel link
npx vercel env pull .env.local
npx vercel dev
```

The local API runs at `http://localhost:3000`. The macOS app can use it for an end-to-end local check:

```bash
CHEATLY_API_BASE_URL=http://localhost:3000 \
  swift run Cheatly
```

For local payment testing, use Razorpay Test Mode credentials in the Vercel Development environment. Do not use Live credentials against a local test session.

## Validate the deployment

After deploying, open `GET /api/health`. A healthy response looks like:

```json
{
  "ok": true,
  "database": "connected",
  "razorpayKey": true,
  "razorpaySecret": true,
  "webhookSecret": true,
  "checkoutURL": true
}
```

Then send a test entitlement request:

```bash
curl -i -X POST https://api.cheatly.pro/api/entitlement \
  -H 'content-type: application/json' \
  -d '{"install_id":"local-test-install-001"}'
```

The first request should return `status: "trial"` and a session-specific `checkoutURL`. Repeating it with the same install ID should return the same trial session. Use Razorpay Test Mode before testing a real payment.

Never put `RAZORPAY_KEY_SECRET`, the webhook secret, or database credentials in the website or macOS app. The public Razorpay key ID is the only payment credential exposed to checkout.js.
