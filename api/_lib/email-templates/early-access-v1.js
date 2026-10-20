import { escapeHTML, layout } from './shared.js';

export function customer({ email, siteURL, installURL, downloadURL, purchaseURL, tncURL, logoURL }) {
  const safeEmail = escapeHTML(email);
  const safeSiteURL = escapeHTML(siteURL);
  const safeInstallURL = escapeHTML(installURL || `${siteURL}/install/`);
  const safePurchaseURL = escapeHTML(purchaseURL || `${siteURL}/#access`);
  const safeDownloadURL = escapeHTML(downloadURL || '');
  const safeTncURL = escapeHTML(tncURL);
  const deliveryBlock = downloadURL
    ? `<div style="margin:0 0 18px;padding:18px 20px;border-radius:10px;background:#edf4e9"><p style="margin:0 0 8px;color:#458067;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Your 7-day trial is ready</p><p style="margin:0;color:#5f7068;font-size:14px;line-height:1.65">This private installer link is intended for ${safeEmail} and can be used once.</p></div><a href="${safeDownloadURL}" style="display:inline-block;padding:13px 18px;border-radius:7px;background:#458067;color:#fff;text-decoration:none;font-size:13px;font-weight:700">Download Cheatly →</a>`
    : `<p style="margin:0;color:#5f7068;font-size:14px;line-height:1.65">Your installer link will be added here once delivery is enabled.</p>`;
  return {
    subject: process.env.INTEREST_EMAIL_SUBJECT || 'You’re on the list — Cheatly early access',
    text: `Your Cheatly trial is ready. Download the installer: ${downloadURL || 'The installer link will be sent separately.'} Install guide: ${installURL}. Choose a plan when you are ready: ${purchaseURL}.`,
    html: layout({
      preheader: 'Your Cheatly trial is ready.',
      eyebrow: 'Cheatly early access',
      title: 'Your trial is ready.',
      body: `<p style="margin:0 0 22px;color:#5f7068;font-size:16px;line-height:1.65">Your Cheatly installer is ready for <strong style="color:#172622">${safeEmail}</strong>.</p>
        ${deliveryBlock}
        <p style="margin:18px 0 0"><a href="${safeInstallURL}" style="display:inline-block;padding:13px 18px;border-radius:7px;border:1px solid #458067;color:#458067;text-decoration:none;font-size:13px;font-weight:700">How to install →</a><span style="display:inline-block;width:8px"></span><a href="${safePurchaseURL}" style="display:inline-block;padding:13px 18px;border-radius:7px;background:#172622;color:#fffdf8;text-decoration:none;font-size:13px;font-weight:700">Choose a plan →</a></p>`,
      footer: `This private download link can be used once.<br><br><a href="${safeSiteURL}" style="color:#458067">cheatly.pro</a> · <a href="${safeTncURL}" style="color:#458067">Terms &amp; Conditions</a>`,
      logoURL
    })
  };
}

export function admin({ email, mobile, siteURL, tncURL, logoURL }) {
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
      footer: `This is an internal notification from the Cheatly early-access form. <a href="${escapeHTML(tncURL)}" style="color:#458067">Terms &amp; Conditions</a>`,
      logoURL
    })
  };
}
