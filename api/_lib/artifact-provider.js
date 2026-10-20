import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

class ArtifactProvider {
  async sourceURL() {
    throw new Error('ArtifactProvider.sourceURL must be implemented');
  }
}

class StaticArtifactProvider extends ArtifactProvider {
  async sourceURL() {
    const value = String(process.env.CHEATLY_ARTIFACT_URL || '').trim();
    if (!value) throw new Error('CHEATLY_ARTIFACT_URL is not configured');
    return value;
  }
}

class R2ArtifactProvider extends ArtifactProvider {
  constructor() {
    super();
    const accountID = required('R2_ACCOUNT_ID');
    this.bucket = required('R2_BUCKET');
    this.objectKey = required('R2_OBJECT_KEY');
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required('R2_ACCESS_KEY_ID'),
        secretAccessKey: required('R2_SECRET_ACCESS_KEY')
      }
    });
  }

  async sourceURL() {
    const requested = Number(process.env.R2_SIGNED_URL_TTL_SECONDS || 900);
    const expiresIn = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 604800) : 900;
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.objectKey,
      ResponseContentDisposition: `attachment; filename="${String(process.env.CHEATLY_ARTIFACT_FILENAME || 'Cheatly.dmg').replace(/["\r\n]/g, '')}"`,
      ResponseContentType: 'application/octet-stream'
    }), { expiresIn });
  }
}

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

const providers = Object.freeze({
  r2: () => new R2ArtifactProvider(),
  static: () => new StaticArtifactProvider()
});

export function createArtifactProvider() {
  const name = String(process.env.ARTIFACT_PROVIDER || 'r2').trim().toLowerCase();
  const factory = providers[name];
  if (!factory) throw new Error(`Unsupported ARTIFACT_PROVIDER: ${name}`);
  return factory();
}

export async function artifactSourceURL() {
  return createArtifactProvider().sourceURL();
}
