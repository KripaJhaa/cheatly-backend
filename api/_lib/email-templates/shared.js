export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

export function layout({ preheader, eyebrow, title, body, footer, logoURL }) {
  const safeLogoURL = String(logoURL || '').replace(/["<>]/g, '');
  const brand = safeLogoURL
    ? `<img src="${safeLogoURL}" width="38" height="38" alt="Cheatly" style="display:block;width:38px;height:38px;border-radius:9px;object-fit:cover"><span style="font-size:18px;font-weight:800;letter-spacing:-.04em">Cheatly<span style="color:#c1e681">.</span></span>`
    : '<span style="font-size:18px;font-weight:800;letter-spacing:-.04em">Cheatly<span style="color:#c1e681">.</span></span>';
  return `<!doctype html><html><body style="margin:0;background:#f7f6f0;color:#172622;font-family:Arial,Helvetica,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f6f0;padding:36px 16px">
      <tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf8;border:1px solid #dce1d9;border-radius:16px;overflow:hidden">
        <tr><td style="padding:22px 30px;background:#172622;color:#f7f6f0"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="padding-right:10px;vertical-align:middle">${brand}</td></tr></table></td></tr>
        <tr><td style="padding:40px 30px 34px"><p style="margin:0 0 14px;color:#458067;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${eyebrow}</p><h1 style="margin:0 0 18px;font-size:36px;line-height:1.05;letter-spacing:-1.5px">${title}</h1>${body}</td></tr>
        <tr><td style="padding:20px 30px;border-top:1px solid #dce1d9;color:#718078;font-size:12px;line-height:1.6">${footer}</td></tr>
      </table></td></tr>
    </table>
  </body></html>`;
}
