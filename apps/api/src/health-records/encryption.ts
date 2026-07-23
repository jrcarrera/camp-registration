import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedPayload {
  authenticationTag: Buffer;
  ciphertext: Buffer;
  keyVersion: number;
  nonce: Buffer;
}

export interface HealthEncryptionProvider {
  decrypt<T>(organizationId: string, camperId: string, payload: EncryptedPayload): T;
  encrypt<T>(organizationId: string, camperId: string, value: T): EncryptedPayload;
}

function associatedData(organizationId: string, camperId: string): Buffer {
  return Buffer.from(`camp-health:v1:${organizationId}:${camperId}`, 'utf8');
}

export class AesGcmHealthEncryptionProvider implements HealthEncryptionProvider {
  constructor(
    private readonly keys: ReadonlyMap<number, Buffer>,
    private readonly activeKeyVersion: number,
  ) {
    const activeKey = keys.get(activeKeyVersion);
    if (!activeKey) throw new Error('The active health encryption key is not configured');
    for (const key of keys.values()) {
      if (key.length !== 32) throw new Error('Health encryption keys must be 32 bytes');
    }
  }

  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env) {
    const raw = environment.HEALTH_DATA_ENCRYPTION_KEYS;
    const active = Number.parseInt(environment.HEALTH_DATA_ACTIVE_KEY_VERSION ?? '1', 10);
    if (!raw) throw new Error('HEALTH_DATA_ENCRYPTION_KEYS is required');
    let configured: unknown;
    try {
      configured = JSON.parse(raw);
    } catch {
      throw new Error('HEALTH_DATA_ENCRYPTION_KEYS must be a JSON keyring');
    }
    if (!configured || Array.isArray(configured) || typeof configured !== 'object') {
      throw new Error('HEALTH_DATA_ENCRYPTION_KEYS must be a JSON keyring');
    }
    const keys = new Map<number, Buffer>();
    for (const [version, encoded] of Object.entries(configured)) {
      if (typeof encoded !== 'string' || !/^[1-9]\d*$/.test(version)) {
        throw new Error('Health encryption keyring entries are invalid');
      }
      keys.set(Number(version), Buffer.from(encoded, 'base64'));
    }
    return new AesGcmHealthEncryptionProvider(keys, active);
  }

  encrypt<T>(organizationId: string, camperId: string, value: T): EncryptedPayload {
    const key = this.keys.get(this.activeKeyVersion)!;
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(associatedData(organizationId, camperId));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return {
      authenticationTag: cipher.getAuthTag(),
      ciphertext,
      keyVersion: this.activeKeyVersion,
      nonce,
    };
  }

  decrypt<T>(organizationId: string, camperId: string, payload: EncryptedPayload): T {
    const key = this.keys.get(payload.keyVersion);
    if (!key) throw new Error('The health record encryption key version is unavailable');
    const decipher = createDecipheriv('aes-256-gcm', key, payload.nonce);
    decipher.setAAD(associatedData(organizationId, camperId));
    decipher.setAuthTag(payload.authenticationTag);
    const plaintext = Buffer.concat([
      decipher.update(payload.ciphertext),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as T;
  }
}
