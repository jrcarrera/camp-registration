import type { RequestIdentity } from '@camp-registration/auth';
import { createDatabaseClient } from '@camp-registration/database';

import { buildApp, type BuildAppOptions } from './app.js';

const port = Number.parseInt(process.env.API_PORT ?? '3001', 10);
const host = process.env.API_HOST ?? '0.0.0.0';
const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? createDatabaseClient({ connectionString: databaseUrl }) : undefined;
const localAuthEnabled = process.env.LOCAL_AUTH_ENABLED === 'true';
const organizationId = process.env.LOCAL_ORGANIZATION_ID;
const actorId = process.env.LOCAL_ACTOR_ID ?? 'local-camp-admin';
const identity: RequestIdentity | undefined =
  localAuthEnabled && organizationId
    ? {
        email: 'admin@local.camp.test',
        emailVerified: true,
        memberships: [
          {
            campIds: [],
            organizationId,
            roles: ['organization_admin'],
          },
        ],
        mfaVerified: true,
        subject: actorId,
      }
    : undefined;

const appOptions: BuildAppOptions = {
  logger: true,
  ...(database ? { database } : {}),
  ...(identity ? { identity } : {}),
  ...(organizationId ? { organizationId } : {}),
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
