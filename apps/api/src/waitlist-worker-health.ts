import { createDatabaseClient, WaitlistOperationsStore } from '@camp-registration/database';

function integerSetting(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error('DATABASE_URL is required');

const database = createDatabaseClient({ connectionString, maxConnections: 2 });
const store = new WaitlistOperationsStore(database);

try {
  const staleAfterSeconds = integerSetting('WAITLIST_WORKER_STALE_AFTER_SECONDS', 120, 15, 86_400);
  const organizationIds = await store.listEnabledOrganizationIds();
  const statuses = await Promise.all(
    organizationIds.map((organizationId) => store.getStatus(organizationId, staleAfterSeconds)),
  );
  const unhealthy = statuses.filter(
    (status) =>
      status.health === 'NOT_RUNNING' ||
      status.health === 'STALE' ||
      status.consecutive_failures > 0,
  );
  process.stdout.write(
    `${JSON.stringify({
      organizations: organizationIds.length,
      status: unhealthy.length === 0 ? 'ready' : 'not_ready',
      unhealthy_organizations: unhealthy.length,
    })}\n`,
  );
  process.exitCode = unhealthy.length === 0 ? 0 : 1;
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      error_type: error instanceof Error ? error.name : 'UnknownError',
      status: 'not_ready',
    })}\n`,
  );
  process.exitCode = 1;
} finally {
  await database.close();
}
