import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

export interface DatabaseOptions {
  connectionString: string;
  maxConnections?: number;
}

export function createDatabaseClient(options: DatabaseOptions) {
  const poolConfig: PoolConfig = {
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
  };
  const pool = new Pool(poolConfig);
  const orm = drizzle(pool);

  return {
    orm,
    pool,
    async check(): Promise<void> {
      await pool.query('SELECT 1');
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
