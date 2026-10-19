# Cheatly licensing backend for Vercel

This is an independent Vercel project. It creates a trial session, creates a Razorpay order for that session, verifies payments, receives Razorpay webhooks, and returns the entitlement used by the macOS app.

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
ADMIN_EMAIL=owner@example.com
INTEREST_EMAIL_SUBJECT=You’re on the Cheatly early-access list
```

If email configuration is absent or temporarily fails, the lead is still saved and the API response reports `email_sent: false`. This prevents a mail-provider outage from losing an interested customer.

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
npx vercel env add CORS_ORIGINS production
npx vercel --prod
```

Recommended values:

```text
PUBLIC_BASE_URL=https://api.cheatly.pro
CHECKOUT_PAGE_URL=https://api.cheatly.pro/checkout.html
CORS_ORIGINS=https://cheatly.pro,https://www.cheatly.pro
TRIAL_DAYS=7
PRICE_PAISE=200000
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

Subscribe to `payment.captured` and `order.paid`. Use the same secret in Razorpay and `RAZORPAY_WEBHOOK_SECRET`.

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
