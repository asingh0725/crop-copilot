import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from './store';

let runtimePool: Pool | null = null;

export function getRuntimePool(): Pool {
  if (!runtimePool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    runtimePool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 6),
      ssl: resolvePoolSslConfig(),
    });
  }

  return runtimePool;
}

export function setRuntimePool(pool: Pool | null): void {
  runtimePool = pool;
}
