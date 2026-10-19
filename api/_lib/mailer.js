class Mailer {
  async send() {
    throw new Error('Mailer.send must be implemented by a provider');
  }
}

class ResendMailer extends Mailer {
  constructor({ apiKey, from }) {
    super();
    this.apiKey = apiKey;
    this.from = from;
  }

  async send({ to, subject, html, text }) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: this.from, to: [to], subject, html, text })
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
  return provider({ apiKey: required('RESEND_API_KEY'), from: required('EMAIL_FROM') });
}

export async function notifyInterest({ email, mobile }) {
  const mailer = createMailer();
  if (!mailer) return { customerSent: false, adminSent: false, configured: false };

  const safeEmail = escapeHTML(email);
  const safeMobile = escapeHTML(mobile || 'Not provided');
  const subject = process.env.INTEREST_EMAIL_SUBJECT || 'You’re on the Cheatly early-access list';
  const customerMessage = {
    to: email,
    subject,
    text: `Thanks for joining the Cheatly early-access list. We’ll email you when the installer is ready.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172622"><h2>You’re on the Cheatly list.</h2><p>Thanks for your interest. We’ll email <strong>${safeEmail}</strong> when the installer and setup instructions are ready.</p><p>No payment is required right now.</p></div>`
  };
  await mailer.send(customerMessage);

  let adminSent = false;
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim();
  if (adminEmail) {
    await mailer.send({
      to: adminEmail,
      subject: `New Cheatly early-access lead: ${email}`,
      text: `New early-access lead\nEmail: ${email}\nMobile: ${mobile || 'Not provided'}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>New Cheatly early-access lead</h2><p><strong>Email:</strong> ${safeEmail}</p><p><strong>Mobile:</strong> ${safeMobile}</p></div>`
    });
    adminSent = true;
  }
  return { customerSent: true, adminSent, configured: true };
}
