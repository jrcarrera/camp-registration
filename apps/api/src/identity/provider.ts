export type ProviderStep = 'EMAIL_OTP' | 'PASSWORD' | 'TOTP';

export interface ProviderIdentity {
  email: string;
  emailVerified: boolean;
  issuer: string;
  provider: string;
  subject: string;
}

export interface ProviderChallenge {
  nextStep: ProviderStep;
  state: string;
}

export interface ProviderChallengeResult {
  accessToken?: string;
  identity?: ProviderIdentity;
  nextStep?: ProviderStep;
  state?: string;
}

export interface IdentityProvider {
  readonly issuer: string;
  readonly name: string;
  beginTotpEnrollment(accessToken: string): Promise<{ secret: string; state: string }>;
  completePasswordRecovery(
    email: string,
    state: string,
    code: string,
    password: string,
  ): Promise<void>;
  disableUser(email: string): Promise<void>;
  enableUser(email: string): Promise<void>;
  ensureUser(email: string): Promise<void>;
  globalSignOut(email: string): Promise<void>;
  resetMfa(email: string): Promise<void>;
  setInitialPassword(email: string, password: string): Promise<void>;
  setEmail(email: string, nextEmail: string): Promise<void>;
  startPasswordRecovery(email: string): Promise<{ state: string }>;
  start(email: string, preferredStep: 'EMAIL_OTP' | 'PASSWORD'): Promise<ProviderChallenge>;
  respond(input: {
    email: string;
    response: string;
    state: string;
    step: ProviderStep;
  }): Promise<ProviderChallengeResult>;
  verifyTotpEnrollment(accessToken: string, code: string, state: string): Promise<void>;
}
