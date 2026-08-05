import { createHash, randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import { IdentityNotFoundError, IdentityStore } from './identity-store.js';
import { runMigrations } from './migrate.js';
import { seedCatalog } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const familyId = '675f5af1-a754-4212-8e3f-2a0d1e63c08f';
const adultId = 'c434ac34-5dcb-4a52-aabc-c501e1ff0db4';

describe('identity store', () => {
  let container: StartedPostgreSqlContainer;
  let migrationUrl: string;
  let runtimeDatabase: DatabaseClient;
  let store: IdentityStore;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    migrationUrl = container.getConnectionUri();
    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(`CREATE ROLE camp_app LOGIN PASSWORD 'camp-app-test' NOBYPASSRLS`);
    await admin.end();
    await runMigrations(migrationUrl);
    await seedCatalog(migrationUrl);

    const fixture = new Pool({ connectionString: migrationUrl });
    await fixture.query(
      `INSERT INTO families (id, organization_id, family_name)
       VALUES ($1, $2, 'Invite Family')`,
      [familyId, organizationId],
    );
    await fixture.query(
      `INSERT INTO adults (
         id, organization_id, family_id, first_name, last_name, email, email_normalized,
         account_owner, can_manage_family, can_register, can_make_payments,
         emergency_contact, authorized_pickup, receives_operational_communication
       ) VALUES (
         $1, $2, $3, 'Morgan', 'Invite', 'invitee@example.test', 'invitee@example.test',
         false, true, true, false, false, false, true
       )`,
      [adultId, organizationId, familyId],
    );
    await fixture.end();

    const runtimeUrl = new URL(migrationUrl);
    runtimeUrl.username = 'camp_app';
    runtimeUrl.password = 'camp-app-test';
    runtimeDatabase = createDatabaseClient({ connectionString: runtimeUrl.toString() });
    store = new IdentityStore(runtimeDatabase);
  });

  afterAll(async () => {
    await runtimeDatabase.close();
    await container.stop();
  });

  it('prevents ordinary runtime enumeration of global identity tables', async () => {
    const accounts = await runtimeDatabase.pool.query('SELECT id FROM user_accounts');
    const sessions = await runtimeDatabase.pool.query('SELECT id FROM auth_sessions');
    expect(accounts.rows).toEqual([]);
    expect(sessions.rows).toEqual([]);
  });

  it('returns only the enabled tenant public-catalog projection through its narrow function', async () => {
    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(
      `UPDATE organizations
       SET public_catalog_enabled = true,
           public_tagline = 'A fictional public camp catalog',
           public_description = 'Public presentation text only.',
           public_contact_email = 'catalog@example.test'
       WHERE id = $1`,
      [organizationId],
    );

    const catalog = await store.getPublicCatalog('test-camp');
    const preview = await store.getPublicCatalogPreview(organizationId, 'test-camp');
    const crossTenantPreview = await store.getPublicCatalogPreview(
      'd193b5ee-818c-43e0-969d-26ea651ac38c',
      'test-camp',
    );
    const missing = await store.getPublicCatalog('missing-camp');
    const privileges = await admin.query<{
      camp_app_can_execute: boolean;
      public_can_execute: boolean;
    }>(
      `SELECT
         has_function_privilege('camp_app', 'get_public_catalog(text)', 'EXECUTE') AS camp_app_can_execute,
         has_function_privilege('public', 'get_public_catalog(text)', 'EXECUTE') AS public_can_execute`,
    );
    await admin.end();

    expect(missing).toBeNull();
    expect(preview?.organization.slug).toBe('test-camp');
    expect(crossTenantPreview).toBeNull();
    expect(catalog).toMatchObject({
      organization: {
        name: 'Test Camp',
        public_contact_email: 'catalog@example.test',
        slug: 'test-camp',
        tagline: 'A fictional public camp catalog',
      },
    });
    expect(catalog?.sessions.length).toBeGreaterThan(0);
    expect(catalog?.sessions[0]).not.toHaveProperty('organization_id');
    expect(catalog?.sessions[0]).not.toHaveProperty('registered_count');
    expect(privileges.rows).toEqual([{ camp_app_can_execute: true, public_can_execute: false }]);
  });

  it('accepts a single-use email-matched family invitation', async () => {
    const account = await store.upsertProviderAccount({
      accountId: 'invite-account',
      email: 'invitee@example.test',
      emailNormalized: 'invitee@example.test',
      emailVerified: true,
      externalIdentityId: randomUUID(),
      issuer: 'camp-registration-local',
      provider: 'local',
      providerSubject: 'invite-provider-subject',
    });
    const rawToken = 'a'.repeat(43);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const invitation = await store.createInvitation(
      {
        actorId: 'integration-admin',
        organizationId,
        requestId: 'identity-invitation-test',
      },
      {
        adultId,
        email: 'invitee@example.test',
        expiresAt: new Date(Date.now() + 60_000),
        familyId,
        id: randomUUID(),
        invitationType: 'FAMILY_ADULT',
        roles: [],
        tokenHash,
      },
    );

    expect(invitation.email_hint).toBe('i***@example.test');
    await expect(store.acceptInvitation(account, tokenHash, 'accept-test')).resolves.toBe(
      organizationId,
    );
    await expect(store.acceptInvitation(account, tokenHash, 'replay-test')).rejects.toBeInstanceOf(
      IdentityNotFoundError,
    );

    const admin = new Pool({ connectionString: migrationUrl });
    const linked = await admin.query<{ identity_subject: string | null }>(
      'SELECT identity_subject FROM adults WHERE id = $1',
      [adultId],
    );
    await admin.end();
    expect(linked.rows[0]?.identity_subject).toBe(account.id);
  });

  it('rejects expired sessions while preserving hashed opaque tokens', async () => {
    const token = 'session-secret-that-is-never-stored';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await store.createSession({
      absoluteExpiresAt: new Date(Date.now() - 1_000),
      accountId: 'invite-account',
      activeOrganizationId: organizationId,
      authenticationMethod: 'EMAIL_OTP',
      id: randomUUID(),
      idleExpiresAt: new Date(Date.now() - 1_000),
      mfaVerified: false,
      requiresMfaSetup: false,
      tokenHash,
    });
    await expect(store.resolveSession(tokenHash)).resolves.toBeNull();

    const admin = new Pool({ connectionString: migrationUrl });
    const persisted = await admin.query<{ token_hash: string }>(
      'SELECT token_hash FROM auth_sessions WHERE token_hash = $1',
      [tokenHash],
    );
    await admin.end();
    expect(persisted.rows[0]?.token_hash).toBe(tokenHash);
    expect(persisted.rows[0]?.token_hash).not.toContain(token);
  });
});
