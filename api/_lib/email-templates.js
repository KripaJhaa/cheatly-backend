function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function layout({ preheader, eyebrow, title, body, footer }) {
  return `<!doctype html><html><body style="margin:0;background:#f7f6f0;color:#172622;font-family:Arial,Helvetica,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f6f0;padding:36px 16px">
      <tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf8;border:1px solid #dce1d9;border-radius:16px;overflow:hidden">
        <tr><td style="padding:26px 30px;background:#172622;color:#f7f6f0;font-size:18px;font-weight:800;letter-spacing:-.04em">Cheatly<span style="color:#c1e681">.</span></td></tr>
        <tr><td style="padding:40px 30px 34px"><p style="margin:0 0 14px;color:#458067;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${eyebrow}</p><h1 style="margin:0 0 18px;font-size:36px;line-height:1.05;letter-spacing:-1.5px">${title}</h1>${body}</td></tr>
        <tr><td style="padding:20px 30px;border-top:1px solid #dce1d9;color:#718078;font-size:12px;line-height:1.6">${footer}</td></tr>
      </table></td></tr>
    </table>
  </body></html>`;
}

export function interestConfirmation({ email, siteURL }) {
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
      footer: `You received this because you joined the Cheatly early-access list. We’ll only use this address for access updates and delivery communication.`
    })
  };
}

export function interestAdminNotification({ email, mobile, siteURL }) {
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
