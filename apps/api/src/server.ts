import { platformRoles, type PlatformRole, type RequestIdentity } from '@camp-registration/auth';
import { createDatabaseClient } from '@camp-registration/database';

import { buildApp, type BuildAppOptions } from './app.js';

const port = Number.parseInt(process.env.API_PORT ?? '3001', 10);
const host = process.env.API_HOST ?? '0.0.0.0';
const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? createDatabaseClient({ connectionString: databaseUrl }) : undefined;
const localAuthEnabled = process.env.LOCAL_AUTH_ENABLED === 'true';
const organizationId = process.env.LOCAL_ORGANIZATION_ID;
const actorId = process.env.LOCAL_ACTOR_ID ?? 'local-camp-admin';
const defaultRoles = rolesFrom(process.env.LOCAL_ROLES ?? 'organization_admin');

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function rolesFrom(value: string): PlatformRole[] {
  const roles = value
    .split(',')
    .map((role) => role.trim())
    .filter((role): role is PlatformRole => platformRoles.includes(role as PlatformRole));
  return roles.length > 0 ? roles : ['organization_admin'];
}

const localRequestContext: BuildAppOptions['requestContext'] | undefined =
  localAuthEnabled && organizationId
    ? (request) => {
        const activeOrganizationId =
          headerValue(request.headers['x-local-organization-id']) ?? organizationId;
        const identity: RequestIdentity = {
          email: headerValue(request.headers['x-local-email']) ?? 'admin@local.camp.test',
          emailVerified: headerValue(request.headers['x-local-email-verified']) !== 'false',
          memberships: [
            {
              campIds: [],
              organizationId: activeOrganizationId,
              roles: rolesFrom(
                headerValue(request.headers['x-local-roles']) ?? defaultRoles.join(','),
              ),
            },
          ],
          mfaVerified: headerValue(request.headers['x-local-mfa-verified']) !== 'false',
          subject: headerValue(request.headers['x-local-actor-id']) ?? actorId,
        };
        return { identity, organizationId: activeOrganizationId };
      }
    : undefined;

const appOptions: BuildAppOptions = {
  logger: true,
  ...(database ? { database } : {}),
  ...(localRequestContext ? { requestContext: localRequestContext } : {}),
};
const app = await buildApp(appOptions);

if (database) {
  app.addHook('onClose', async () => {
    await database.close();
  });
}

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
