import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';

describe('database client', () => {
  let container: StartedPostgreSqlContainer;
  let database: DatabaseClient;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    database = createDatabaseClient({ connectionString: container.getConnectionUri() });
  });

  afterAll(async () => {
    await database.close();
    await container.stop();
  });

  it('connects to PostgreSQL', async () => {
    await expect(database.check()).resolves.toBeUndefined();
  });
});
