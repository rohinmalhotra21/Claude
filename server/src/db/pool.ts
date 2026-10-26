import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '../env.js';

/**
 * Managed Postgres (Render, Fly, Neon …) requires TLS, so production defaults
 * to it. `sslmode=disable` in the URL, or PGSSLMODE=disable, opts out — needed
 * for a self-hosted database on a private network, or for running a production
 * build against a local server.
 */
function sslConfig(): { rejectUnauthorized: boolean } | undefined {
  const disabled =
    /[?&]sslmode=disable\b/.test(env.databaseUrl) || process.env.PGSSLMODE === 'disable';
  if (disabled) return undefined;
  // Managed providers terminate TLS with certificates this process has no
  // chain for, so verification is off while encryption stays on.
  return env.isProduction ? { rejectUnauthorized: false } : undefined;
}

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  ssl: sslConfig(),
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

/** Runs `fn` inside a transaction, rolling back if it throws. */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
