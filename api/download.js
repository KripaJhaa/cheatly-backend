import { consumeDownloadToken, send } from './_lib.js';
import { artifactSourceURL } from './_lib/artifact-provider.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  const token = String(req.query?.token || '').trim();
  const purpose = String(req.query?.purpose || 'paid_installer').trim();
  if (!['paid_installer', 'trial_installer'].includes(purpose)) return send(res, 404, { error: 'Download link is invalid or expired' });
  if (!token || token.length < 40) return send(res, 404, { error: 'Download link is invalid or expired' });
  try {
    // Resolve the private source before consuming the customer token. A bad
    // storage configuration should not burn a valid customer delivery link.
    const artifactURL = await artifactSourceURL();
    const delivery = await consumeDownloadToken(token, purpose);
    if (!delivery) return send(res, 410, { error: 'This download link has already been used or expired' });
    const upstream = await fetch(artifactURL, { redirect: 'follow' });
    if (!upstream.ok || !upstream.body) return send(res, 502, { error: 'Installer could not be retrieved' });
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${String(process.env.CHEATLY_ARTIFACT_FILENAME || 'Cheatly.dmg').replace(/["\r\n]/g, '')}"`);
    if (upstream.headers.get('content-length')) res.setHeader('Content-Length', upstream.headers.get('content-length'));
    for await (const chunk of upstream.body) res.write(chunk);
    return res.end();
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Download could not be completed' });
  }
}
