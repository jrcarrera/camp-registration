import {
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminSetUserMFAPreferenceCommand,
  AdminUpdateUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  AssociateSoftwareTokenCommand,
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand,
  GetUserCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  SetUserMFAPreferenceCommand,
  UsernameExistsException,
  VerifySoftwareTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';

import type {
  IdentityProvider,
  ProviderChallenge,
  ProviderChallengeResult,
  ProviderIdentity,
  ProviderStep,
} from './provider.js';

interface CognitoState {
  session?: string;
  username: string;
}

function encode(state: CognitoState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

function decode(value: string): CognitoState {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as CognitoState;
}

function stateFor(username: string, session: string | undefined): CognitoState {
  return session ? { session, username } : { username };
}

function stepFromChallenge(challenge: string | undefined): ProviderStep | undefined {
  if (challenge === 'EMAIL_OTP') return 'EMAIL_OTP';
  if (challenge === 'PASSWORD' || challenge === 'NEW_PASSWORD_REQUIRED') return 'PASSWORD';
  if (challenge === 'SOFTWARE_TOKEN_MFA') return 'TOTP';
  return undefined;
}

export class CognitoIdentityProvider implements IdentityProvider {
  readonly issuer: string;
  readonly name = 'cognito';
  private readonly client: CognitoIdentityProviderClient;

  constructor(
    private readonly clientId: string,
    private readonly userPoolId: string,
    region: string,
  ) {
    this.client = new CognitoIdentityProviderClient({ region });
    this.issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  }

  async ensureUser(email: string): Promise<void> {
    try {
      await this.client.send(
        new AdminCreateUserCommand({
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
          UserPoolId: this.userPoolId,
          Username: email,
        }),
      );
    } catch (error) {
      if (!(error instanceof UsernameExistsException)) throw error;
    }
  }

  async beginTotpEnrollment(accessToken: string): Promise<{ secret: string; state: string }> {
    const result = await this.client.send(
      new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
    );
    if (!result.SecretCode) throw new Error('The identity provider did not return a TOTP secret');
    return { secret: result.SecretCode, state: result.Session ?? '' };
  }

  async start(email: string, preferredStep: 'EMAIL_OTP' | 'PASSWORD'): Promise<ProviderChallenge> {
    const result = await this.client.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_AUTH',
        AuthParameters: {
          PREFERRED_CHALLENGE: preferredStep,
          USERNAME: email,
        },
        ClientId: this.clientId,
      }),
    );
    const nextStep = stepFromChallenge(result.ChallengeName);
    if (!nextStep) throw new Error('The identity provider returned an unsupported challenge');
    return {
      nextStep,
      state: encode(stateFor(email, result.Session)),
    };
  }

  async respond(input: {
    email: string;
    response: string;
    state: string;
    step: ProviderStep;
  }): Promise<ProviderChallengeResult> {
    const state = decode(input.state);
    const challengeName =
      input.step === 'EMAIL_OTP'
        ? 'EMAIL_OTP'
        : input.step === 'TOTP'
          ? 'SOFTWARE_TOKEN_MFA'
          : 'PASSWORD';
    const responseKey =
      input.step === 'EMAIL_OTP'
        ? 'EMAIL_OTP_CODE'
        : input.step === 'TOTP'
          ? 'SOFTWARE_TOKEN_MFA_CODE'
          : 'PASSWORD';
    const result = await this.client.send(
      new RespondToAuthChallengeCommand({
        ChallengeName: challengeName,
        ChallengeResponses: {
          [responseKey]: input.response,
          USERNAME: state.username,
        },
        ClientId: this.clientId,
        Session: state.session,
      }),
    );
    const nextStep = stepFromChallenge(result.ChallengeName);
    if (nextStep) {
      return {
        nextStep,
        state: encode(stateFor(state.username, result.Session)),
      };
    }
    const accessToken = result.AuthenticationResult?.AccessToken;
    if (!accessToken) throw new Error('The identity provider did not complete authentication');
    return { accessToken, identity: await this.identityFromAccessToken(accessToken) };
  }

  async disableUser(email: string): Promise<void> {
    await this.client.send(
      new AdminDisableUserCommand({ UserPoolId: this.userPoolId, Username: email }),
    );
  }

  async completePasswordRecovery(
    email: string,
    _state: string,
    code: string,
    password: string,
  ): Promise<void> {
    await this.client.send(
      new ConfirmForgotPasswordCommand({
        ClientId: this.clientId,
        ConfirmationCode: code,
        Password: password,
        Username: email,
      }),
    );
  }

  async enableUser(email: string): Promise<void> {
    await this.client.send(
      new AdminEnableUserCommand({ UserPoolId: this.userPoolId, Username: email }),
    );
  }

  async globalSignOut(email: string): Promise<void> {
    await this.client.send(
      new AdminUserGlobalSignOutCommand({ UserPoolId: this.userPoolId, Username: email }),
    );
  }

  async resetMfa(email: string): Promise<void> {
    await this.client.send(
      new AdminSetUserMFAPreferenceCommand({
        SoftwareTokenMfaSettings: { Enabled: false, PreferredMfa: false },
        UserPoolId: this.userPoolId,
        Username: email,
      }),
    );
  }

  async setInitialPassword(email: string, password: string): Promise<void> {
    await this.client.send(
      new AdminSetUserPasswordCommand({
        Password: password,
        Permanent: true,
        UserPoolId: this.userPoolId,
        Username: email,
      }),
    );
  }

  async setEmail(email: string, nextEmail: string): Promise<void> {
    await this.client.send(
      new AdminUpdateUserAttributesCommand({
        UserAttributes: [
          { Name: 'email', Value: nextEmail },
          { Name: 'email_verified', Value: 'false' },
        ],
        UserPoolId: this.userPoolId,
        Username: email,
      }),
    );
  }

  async startPasswordRecovery(email: string): Promise<{ state: string }> {
    await this.client.send(new ForgotPasswordCommand({ ClientId: this.clientId, Username: email }));
    return { state: encode({ username: email }) };
  }

  async verifyTotpEnrollment(accessToken: string, code: string, state: string): Promise<void> {
    await this.client.send(
      new VerifySoftwareTokenCommand({
        AccessToken: state ? undefined : accessToken,
        Session: state || undefined,
        UserCode: code,
      }),
    );
    await this.client.send(
      new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    );
  }

  private async identityFromAccessToken(accessToken: string): Promise<ProviderIdentity> {
    const result = await this.client.send(new GetUserCommand({ AccessToken: accessToken }));
    const attributes = Object.fromEntries(
      (result.UserAttributes ?? []).map((attribute) => [attribute.Name, attribute.Value]),
    );
    return {
      email: attributes.email ?? result.Username ?? '',
      emailVerified: attributes.email_verified === 'true',
      issuer: this.issuer,
      provider: this.name,
      subject: attributes.sub ?? result.Username ?? '',
    };
  }

  async accountExists(email: string): Promise<boolean> {
    try {
      await this.client.send(
        new AdminGetUserCommand({ UserPoolId: this.userPoolId, Username: email }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
