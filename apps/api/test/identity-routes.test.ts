import type { AuthSession } from '@camp-registration/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { IdentityService } from '../src/identity/service.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const session: AuthSession = {
  account_id: 'account-1',
  active_organization_id: organizationId,
  authentication_method: 'EMAIL_OTP',
  email: 'parent@example.test',
  email_verified: true,
  expires_at: '2026-08-01T00:00:00.000Z',
  mfa_verified: false,
  organizations: [
    {
      name: 'Test Camp',
      organization_id: organizationId,
      roles: ['parent_guardian'],
      slug: 'test-camp',
    },
  ],
  platform_role: null,
  requires_mfa_setup: false,
};

function fakeIdentityService(): IdentityService {
  return {
    resolveRequest: vi.fn().mockResolvedValue(undefined),
    respondToAuthentication: vi.fn().mockResolvedValue({
      challenge: {
        challenge_id: 'c'.repeat(43),
        expires_at: session.expires_at,
        next_step: 'AUTHENTICATED',
      },
      cookieToken: 'opaque-cookie-token',
      session,
    }),
    startAuthentication: vi.fn().mockResolvedValue({
      challenge_id: 'c'.repeat(43),
      expires_at: session.expires_at,
      next_step: 'EMAIL_OTP',
    }),
  } as unknown as IdentityService;
}

describe('identity routes', () => {
  const applications: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((app) => app.close()));
  });

  it('returns authentication_required when an application session is absent', async () => {
    const app = await buildApp({ identityService: fakeIdentityService() });
    applications.push(app);
    const response = await app.inject({ method: 'GET', url: '/v1/auth/session' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'authentication_required' });
  });

  it('rejects a cross-origin state-changing authentication request', async () => {
    const app = await buildApp({ identityService: fakeIdentityService() });
    applications.push(app);
    const response = await app.inject({
      headers: { host: 'camp.example', origin: 'https://attacker.example' },
      method: 'POST',
      payload: { email: 'parent@example.test', intent: 'SIGN_IN' },
      url: '/v1/auth/challenges',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'origin_not_allowed' });
  });

  it('sets an HttpOnly SameSite application session cookie', async () => {
    const app = await buildApp({ identityService: fakeIdentityService() });
    applications.push(app);
    const response = await app.inject({
      method: 'POST',
      payload: { response: '123456', step: 'EMAIL_OTP' },
      url: `/v1/auth/challenges/${'c'.repeat(43)}/respond`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toContain('camp_session=opaque-cookie-token');
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('SameSite=Lax');
  });
});
