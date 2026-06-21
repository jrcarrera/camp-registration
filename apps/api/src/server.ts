import { createDatabaseClient } from '@camp-registration/database';

import { buildApp, type BuildAppOptions } from './app.js';

const port = Number.parseInt(process.env.API_PORT ?? '3001', 10);
const host = process.env.API_HOST ?? '0.0.0.0';
const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? createDatabaseClient({ connectionString: databaseUrl }) : undefined;

const appOptions: BuildAppOptions = {
  logger: true,
  ...(database ? { database } : {}),
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
