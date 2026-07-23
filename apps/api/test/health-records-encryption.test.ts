import { describe, expect, it } from 'vitest';

import { AesGcmHealthEncryptionProvider } from '../src/health-records/encryption.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const camperId = '0c3e5be4-2ff0-46d4-b58d-1f01f46e87bf';

describe('restricted health encryption', () => {
  it('round trips JSON with authenticated encryption and no plaintext ciphertext', () => {
    const provider = new AesGcmHealthEncryptionProvider(
      new Map([
        [1, Buffer.alloc(32, 1)],
        [2, Buffer.alloc(32, 2)],
      ]),
      2,
    );
    const plaintext = { allergies: ['Peanuts'], emergency_instructions: 'Use epinephrine' };

    const encrypted = provider.encrypt(organizationId, camperId, plaintext);

    expect(encrypted.keyVersion).toBe(2);
    expect(encrypted.nonce).toHaveLength(12);
    expect(encrypted.authenticationTag).toHaveLength(16);
    expect(encrypted.ciphertext.toString('utf8')).not.toContain('Peanuts');
    expect(provider.decrypt(organizationId, camperId, encrypted)).toEqual(plaintext);
  });

  it('rejects ciphertext tampering and tenant or camper substitution', () => {
    const provider = new AesGcmHealthEncryptionProvider(new Map([[1, Buffer.alloc(32, 3)]]), 1);
    const encrypted = provider.encrypt(organizationId, camperId, { allergies: ['Latex'] });
    const tampered = {
      ...encrypted,
      ciphertext: Buffer.from(encrypted.ciphertext),
    };
    tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 1;

    expect(() => provider.decrypt(organizationId, camperId, tampered)).toThrow();
    expect(() =>
      provider.decrypt('d193b5ee-818c-43e0-969d-26ea651ac38c', camperId, encrypted),
    ).toThrow();
  });

  it('loads a versioned base64 keyring from the environment', () => {
    const provider = AesGcmHealthEncryptionProvider.fromEnvironment({
      HEALTH_DATA_ACTIVE_KEY_VERSION: '4',
      HEALTH_DATA_ENCRYPTION_KEYS: JSON.stringify({
        3: Buffer.alloc(32, 3).toString('base64'),
        4: Buffer.alloc(32, 4).toString('base64'),
      }),
    });

    expect(provider.encrypt(organizationId, camperId, { ok: true }).keyVersion).toBe(4);
  });
});
