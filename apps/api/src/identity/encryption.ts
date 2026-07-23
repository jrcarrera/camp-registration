import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class AuthStateCipher {
  constructor(
    private readonly activeVersion: number,
    private readonly keys: Map<number, Buffer>,
  ) {
    if (!keys.has(activeVersion)) throw new Error('Active auth encryption key is missing');
  }

  static fromEnvironment(): AuthStateCipher {
    const activeVersion = Number.parseInt(process.env.AUTH_TOKEN_ACTIVE_KEY_VERSION ?? '', 10);
    const raw = process.env.AUTH_TOKEN_ENCRYPTION_KEYS;
    if (!Number.isInteger(activeVersion) || !raw) {
      throw new Error('AUTH_TOKEN_ACTIVE_KEY_VERSION and AUTH_TOKEN_ENCRYPTION_KEYS are required');
    }
    const parsed = JSON.parse(raw) as Record<string, string>;
    const keys = new Map(
      Object.entries(parsed).map(([version, key]) => [
        Number.parseInt(version, 10),
        Buffer.from(key, 'base64'),
      ]),
    );
    for (const key of keys.values()) {
      if (key.length !== 32) throw new Error('Auth encryption keys must be 32 bytes');
    }
    return new AuthStateCipher(activeVersion, keys);
  }

  static forDevelopment(): AuthStateCipher {
    return new AuthStateCipher(1, new Map([[1, Buffer.alloc(32, 41)]]));
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.activeVersion)!, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      this.activeVersion,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(value: string): string {
    const [versionText, ivText, tagText, ciphertextText] = value.split('.');
    const key = this.keys.get(Number.parseInt(versionText ?? '', 10));
    if (!key || !ivText || !tagText || !ciphertextText) {
      throw new Error('Auth state is invalid');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
