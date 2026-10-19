import { escapeHTML, layout } from './shared.js';

export function customer({ email, siteURL }) {
  const safeEmail = escapeHTML(email);
  const safeSiteURL = escapeHTML(siteURL);
  return {
    subject: process.env.INTEREST_EMAIL_SUBJECT || 'You’re on the list — Cheatly early access',
    text: `You’re on the Cheatly early-access list. Thanks for your interest. We’ll email ${email} when the installer and setup instructions are ready. No payment is required right now. Visit ${siteURL} to learn more.`,
    html: layout({
      preheader: 'Your Cheatly early-access request is confirmed.',
      eyebrow: 'Early access confirmed',
      title: 'You’re on the list.',
      body: `<p style="margin:0 0 22px;color:#5f7068;font-size:16px;line-height:1.65">Thanks for your interest in Cheatly. We’ve saved <strong style="color:#172622">${safeEmail}</strong> for early access.</p>
        <div style="margin:0 0 24px;padding:18px 20px;border-radius:10px;background:#edf4e9"><p style="margin:0 0 10px;color:#458067;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">What happens next</p><p style="margin:0;color:#5f7068;font-size:14px;line-height:1.65">We’ll review the early release, then email you the installer and setup instructions when your access is ready. <strong style="color:#172622">No payment is required right now.</strong></p></div>
        <a href="${safeSiteURL}" style="display:inline-block;padding:13px 18px;border-radius:7px;background:#458067;color:#fff;text-decoration:none;font-size:13px;font-weight:700">Explore Cheatly →</a>`,
      footer: 'You received this because you joined the Cheatly early-access list. We’ll only use this address for access updates and delivery communication.'
    })
  };
}

export function admin({ email, mobile, siteURL }) {
  const safeEmail = escapeHTML(email);
  const safeMobile = escapeHTML(mobile || 'Not provided');
  const safeSiteURL = escapeHTML(siteURL);
  return {
    subject: process.env.INTEREST_ADMIN_SUBJECT || 'New Cheatly early-access signup',
    text: `New Cheatly early-access signup\nEmail: ${email}\nMobile: ${mobile || 'Not provided'}\nWebsite: ${siteURL}`,
    html: layout({
      preheader: 'A new visitor joined the Cheatly early-access list.',
      eyebrow: 'New signup',
      title: 'Someone wants early access.',
      body: `<p style="margin:0 0 18px;color:#5f7068;font-size:15px;line-height:1.65">A new visitor joined the Cheatly list.</p><table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;font-size:14px;line-height:1.8"><tr><td style="color:#718078">Email</td><td style="color:#172622;font-weight:700">${safeEmail}</td></tr><tr><td style="color:#718078">Mobile</td><td style="color:#172622;font-weight:700">${safeMobile}</td></tr></table><p style="margin:22px 0 0"><a href="${safeSiteURL}" style="color:#458067;font-size:13px;font-weight:700">Open Cheatly website →</a></p>`,
      footer: 'This is an internal notification from the Cheatly early-access form.'
    })
  };
}
