# Cheatly licensing backend for Vercel

This is an independent Vercel project. It creates a trial session, creates a Razorpay order for that session, verifies payments, receives Razorpay webhooks, and returns the entitlement used by the macOS app.

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
npx vercel --prod
```

Recommended values:

```text
PUBLIC_BASE_URL=https://api.cheatly.pro
CHECKOUT_PAGE_URL=https://api.cheatly.pro/checkout.html
TRIAL_DAYS=7
PRICE_PAISE=200000
```

Connect a Vercel Postgres/Neon database and use its `POSTGRES_URL`. The schema is created automatically on the first request; `schema.sql` is also included for manual setup.

## Razorpay webhook

In Razorpay Dashboard, add:

```text
https://api.cheatly.pro/api/razorpay-webhook
```

Subscribe to `payment.captured` and `order.paid`. Use the same secret in Razorpay and `RAZORPAY_WEBHOOK_SECRET`.

## API contract

The macOS app calls `POST /api/entitlement` with `{ "install_id": "..." }`. The response is compatible with the app's entitlement client: `status` is `trial`, `paid`, or `expired`; `expiresAt` is the trial expiry; and `checkoutURL` points to the session-specific checkout page.

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
