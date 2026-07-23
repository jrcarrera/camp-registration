import { createHash } from 'node:crypto';

import type { IdentityProvider, ProviderChallenge, ProviderChallengeResult } from './provider.js';

interface LocalState {
  email: string;
  flow: 'EMAIL_OTP' | 'PASSWORD' | 'RECOVERY_CODE' | 'TOTP';
}

function encode(state: LocalState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

function decode(value: string): LocalState {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as LocalState;
}

function localSubject(email: string): string {
  return `local-${createHash('sha256').update(email).digest('hex').slice(0, 32)}`;
}

export class LocalIdentityProvider implements IdentityProvider {
  readonly issuer = 'camp-registration-local';
  readonly name = 'local';

  constructor(private readonly enabled: boolean) {
    if (!enabled) throw new Error('The local identity provider is disabled');
  }

  async disableUser(email: string): Promise<void> {
    void email;
  }
  async completePasswordRecovery(
    email: string,
    stateValue: string,
    code: string,
    password: string,
  ): Promise<void> {
    const state = decode(stateValue);
    if (state.email !== email || state.flow !== 'RECOVERY_CODE' || code !== '123456') {
      throw new Error('Recovery code is invalid');
    }
    if (password.length < 12) throw new Error('Password must be at least 12 characters');
  }
  async beginTotpEnrollment(accessToken: string): Promise<{ secret: string; state: string }> {
    void accessToken;
    return { secret: 'JBSWY3DPEHPK3PXP', state: 'local-totp-enrollment' };
  }
  async enableUser(email: string): Promise<void> {
    void email;
  }
  async ensureUser(email: string): Promise<void> {
    void email;
  }
  async globalSignOut(email: string): Promise<void> {
    void email;
  }
  async resetMfa(email: string): Promise<void> {
    void email;
  }
  async setInitialPassword(email: string, password: string): Promise<void> {
    void email;
    if (password.length < 12) throw new Error('Password must be at least 12 characters');
  }
  async setEmail(email: string, nextEmail: string): Promise<void> {
    void email;
    void nextEmail;
  }
  async startPasswordRecovery(email: string): Promise<{ state: string }> {
    return { state: encode({ email, flow: 'RECOVERY_CODE' }) };
  }
  async verifyTotpEnrollment(accessToken: string, code: string, state: string): Promise<void> {
    void accessToken;
    void state;
    if (code !== '654321') throw new Error('Authenticator code is invalid');
  }

  async start(email: string, preferredStep: 'EMAIL_OTP' | 'PASSWORD'): Promise<ProviderChallenge> {
    return { nextStep: preferredStep, state: encode({ email, flow: preferredStep }) };
  }

  async respond(input: {
    email: string;
    response: string;
    state: string;
    step: 'EMAIL_OTP' | 'PASSWORD' | 'TOTP';
  }): Promise<ProviderChallengeResult> {
    const state = decode(input.state);
    if (state.email !== input.email || state.flow !== input.step) {
      throw new Error('Authentication challenge is invalid');
    }
    if (input.step === 'EMAIL_OTP') {
      if (input.response !== '123456') throw new Error('Verification code is invalid');
      return {
        accessToken: `local-access:${input.email}`,
        identity: {
          email: input.email,
          emailVerified: true,
          issuer: this.issuer,
          provider: this.name,
          subject: localSubject(input.email),
        },
      };
    }
    if (input.step === 'PASSWORD') {
      if (input.response !== 'CampLocal!123') throw new Error('Sign-in details are invalid');
      return { nextStep: 'TOTP', state: encode({ email: input.email, flow: 'TOTP' }) };
    }
    if (input.response !== '654321') throw new Error('Authenticator code is invalid');
    return {
      accessToken: `local-access:${input.email}`,
      identity: {
        email: input.email,
        emailVerified: true,
        issuer: this.issuer,
        provider: this.name,
        subject: localSubject(input.email),
      },
    };
  }
}
