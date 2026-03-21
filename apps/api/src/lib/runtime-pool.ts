import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from './store';

let runtimePool: Pool | null = null;

function attachPoolErrorLogging(pool: Pool, scope: string): void {
  pool.on('error', (error) => {
    console.error(`[${scope}] PostgreSQL pool error`, {
      message: error.message,
      code: (error as NodeJS.ErrnoException).code,
    });
  });
}

export function getRuntimePool(): Pool {
  if (!runtimePool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    runtimePool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 6),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30_000),
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 10_000),
      keepAlive: true,
      ssl: resolvePoolSslConfig(),
    });
    attachPoolErrorLogging(runtimePool, 'runtime-pool');
  }

  return runtimePool;
}

export function setRuntimePool(pool: Pool | null): void {
  runtimePool = pool;
}
