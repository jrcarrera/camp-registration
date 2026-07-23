import { describe, expect, it } from 'vitest';

import { AuthStateCipher } from '../src/identity/encryption.js';
import { validateIdentityRuntime } from '../src/identity/config.js';
import { LocalIdentityProvider } from '../src/identity/local-provider.js';

describe('local identity provider', () => {
  const provider = new LocalIdentityProvider(true);

  it('exercises parent email OTP without AWS resources', async () => {
    const challenge = await provider.start('parent@example.test', 'EMAIL_OTP');
    expect(challenge.nextStep).toBe('EMAIL_OTP');
    await expect(
      provider.respond({
        email: 'parent@example.test',
        response: '000000',
        state: challenge.state,
        step: 'EMAIL_OTP',
      }),
    ).rejects.toThrow('Verification code is invalid');
    await expect(
      provider.respond({
        email: 'parent@example.test',
        response: '123456',
        state: challenge.state,
        step: 'EMAIL_OTP',
      }),
    ).resolves.toMatchObject({
      identity: { email: 'parent@example.test', emailVerified: true },
    });
  });

  it('requires password and TOTP for the workforce flow', async () => {
    const password = await provider.start('staff@example.test', 'PASSWORD');
    const totp = await provider.respond({
      email: 'staff@example.test',
      response: 'CampLocal!123',
      state: password.state,
      step: 'PASSWORD',
    });
    expect(totp.nextStep).toBe('TOTP');
    await expect(
      provider.respond({
        email: 'staff@example.test',
        response: '654321',
        state: totp.state!,
        step: 'TOTP',
      }),
    ).resolves.toMatchObject({
      identity: { email: 'staff@example.test', emailVerified: true },
    });
  });

  it('runs the self-service recovery challenge', async () => {
    const recovery = await provider.startPasswordRecovery('staff@example.test');
    await expect(
      provider.completePasswordRecovery(
        'staff@example.test',
        recovery.state,
        '123456',
        'A-new-local-password',
      ),
    ).resolves.toBeUndefined();
  });
});

describe('auth state encryption', () => {
  it('round trips state without storing its plaintext', () => {
    const cipher = AuthStateCipher.forDevelopment();
    const plaintext = JSON.stringify({ accessToken: 'provider-secret', code: '123456' });
    const encrypted = cipher.encrypt(plaintext);
    expect(encrypted).not.toContain('provider-secret');
    expect(encrypted).not.toContain('123456');
    expect(cipher.decrypt(encrypted)).toBe(plaintext);
  });
});

describe('production identity configuration', () => {
  it('rejects local authentication and missing encryption configuration', () => {
    expect(() =>
      validateIdentityRuntime({
        cognitoClientId: undefined,
        cognitoRegion: undefined,
        cognitoUserPoolId: undefined,
        hasEncryptionKeyring: false,
        localAuthEnabled: true,
        nodeEnvironment: 'production',
        providerName: 'local',
      }),
    ).toThrow('LOCAL_AUTH_ENABLED');
    expect(() =>
      validateIdentityRuntime({
        cognitoClientId: 'client',
        cognitoRegion: 'us-east-1',
        cognitoUserPoolId: 'pool',
        hasEncryptionKeyring: false,
        localAuthEnabled: false,
        nodeEnvironment: 'production',
        providerName: 'cognito',
      }),
    ).toThrow('AUTH_TOKEN_ACTIVE_KEY_VERSION');
  });
});
