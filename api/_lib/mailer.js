import { getEmailTemplates } from './email-templates/index.js';

class Mailer {
  async send() {
    throw new Error('Mailer.send must be implemented by a provider');
  }
}

class ResendMailer extends Mailer {
  constructor({ apiKey, from, replyTo }) {
    super();
    this.apiKey = apiKey;
    this.from = from;
    this.replyTo = replyTo;
  }

  async send({ to, subject, html, text }) {
    const payload = { from: this.from, to: [to], subject, html, text };
    if (this.replyTo) payload.reply_to = this.replyTo;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message || data?.name || `Email provider failed (${response.status})`);
    return data;
  }
}

const providers = Object.freeze({
  resend: (config) => new ResendMailer(config)
});

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

export function createMailer() {
  const providerName = String(process.env.MAIL_PROVIDER || '').trim().toLowerCase();
  if (!providerName) return null;
  const provider = providers[providerName];
  if (!provider) throw new Error(`Unsupported MAIL_PROVIDER: ${providerName}`);
  return provider({ apiKey: required('RESEND_API_KEY'), from: required('EMAIL_FROM'), replyTo: process.env.EMAIL_REPLY_TO });
}

export async function notifyInterest({ email, mobile }) {
  const mailer = createMailer();
  if (!mailer) return { customerSent: false, adminSent: false, configured: false };

  const siteURL = process.env.CHEATLY_SITE_URL || 'https://cheatly.pro';
  const templates = getEmailTemplates();
  const customerMessage = { to: email, ...templates.customer({ email, siteURL }) };
  await mailer.send(customerMessage);

  let adminSent = false;
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim();
  if (adminEmail) {
    await mailer.send({
      to: adminEmail,
      ...templates.admin({ email, mobile, siteURL })
    });
    adminSent = true;
  }
  return { customerSent: true, adminSent, configured: true };
}
