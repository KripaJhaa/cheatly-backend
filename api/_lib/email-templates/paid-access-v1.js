import { escapeHTML, layout } from './shared.js';

export function customer({ email, downloadURL, expiresAt, planName, siteURL, tncURL, logoURL }) {
  const safeEmail = escapeHTML(email);
  const safeDownloadURL = escapeHTML(downloadURL);
  const safePlanName = escapeHTML(planName || 'Cheatly access');
  const safeSiteURL = escapeHTML(siteURL);
  const safeTncURL = escapeHTML(tncURL);
  const expiry = new Date(expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  return {
    subject: process.env.PAID_ACCESS_EMAIL_SUBJECT || 'Your Cheatly installer is ready',
    text: `Your Cheatly access is ready. Download the installer here: ${downloadURL}. This private link expires on ${expiry} and can be used once. Plan: ${planName || 'Cheatly access'}. The link is intended for ${email}. Terms: ${tncURL}.`,
    html: layout({
      preheader: 'Your Cheatly installer is ready for download.',
      eyebrow: 'Access approved',
      title: 'Your installer is ready.',
      body: `<p style="margin:0 0 22px;color:#5f7068;font-size:16px;line-height:1.65">Your Cheatly access for <strong style="color:#172622">${safeEmail}</strong> is ready.</p>
        <div style="margin:0 0 24px;padding:18px 20px;border-radius:10px;background:#edf4e9"><p style="margin:0 0 10px;color:#458067;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">${safePlanName}</p><p style="margin:0;color:#5f7068;font-size:14px;line-height:1.65">This private download link is intended for you, expires on <strong style="color:#172622">${escapeHTML(expiry)}</strong>, and can be used once.</p></div>
        <a href="${safeDownloadURL}" style="display:inline-block;padding:14px 20px;border-radius:7px;background:#458067;color:#fff;text-decoration:none;font-size:13px;font-weight:700">Download Cheatly →</a>
        <p style="margin:22px 0 0;color:#718078;font-size:12px;line-height:1.6">After downloading, open the installer and follow the included setup instructions. If the link expires or you have an installation issue, contact Cheatly support.</p>
        <p style="margin:22px 0 0"><a href="${safeSiteURL}" style="color:#458067;font-size:13px;font-weight:700">Visit Cheatly →</a></p>`,
      footer: `This delivery link was created for ${safeEmail}. Please do not forward it.<br><br><a href="${safeTncURL}" style="color:#458067">Terms &amp; Conditions</a>`,
      logoURL
    })
  };
}
