import { Pool, type PoolClient } from "pg";
import { SCHEMA, closeDb as closeSqlite, getDb } from "./sqlite";

type SqlParam = string | number | bigint | null;

function sqliteArgs(params: SqlParam[]): never[] {
  return params as never[];
}

export function postgresUrl(): string {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    ""
  );
}

export function usesPostgres(): boolean {
  const url = postgresUrl();
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

function toPg(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

let pool: Pool | null = null;
let ready: Promise<void> | null = null;

function getPool(): Pool {
  if (pool) {
    return pool;
  }
  const connectionString = postgresUrl();
  const local = /localhost|127\.0\.0\.1/.test(connectionString);
  pool = new Pool({
    connectionString,
    max: 5,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  return pool;
}

async function ensurePostgres(): Promise<void> {
  const client = await getPool().connect();
  try {
    const statements = SCHEMA.split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await client.query(statement);
    }
  } finally {
    client.release();
  }
}

export async function ensureDatabase(): Promise<void> {
  if (ready) {
    return ready;
  }
  ready = (async () => {
    if (usesPostgres()) {
      await ensurePostgres();
      return;
    }
    getDb();
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export async function dbGet<T>(
  sql: string,
  ...params: SqlParam[]
): Promise<T | undefined> {
  await ensureDatabase();
  if (usesPostgres()) {
    const result = await getPool().query(toPg(sql), params);
    return result.rows[0] as T | undefined;
  }
  return getDb().prepare(sql).get(...sqliteArgs(params)) as T | undefined;
}

export async function dbAll<T>(
  sql: string,
  ...params: SqlParam[]
): Promise<T[]> {
  await ensureDatabase();
  if (usesPostgres()) {
    const result = await getPool().query(toPg(sql), params);
    return result.rows as T[];
  }
  return getDb().prepare(sql).all(...sqliteArgs(params)) as T[];
}

export async function dbRun(
  sql: string,
  ...params: SqlParam[]
): Promise<void> {
  await ensureDatabase();
  if (usesPostgres()) {
    await getPool().query(toPg(sql), params);
    return;
  }
  getDb().prepare(sql).run(...sqliteArgs(params));
}

export async function dbTransaction<T>(
  fn: (query: (sql: string, ...params: SqlParam[]) => Promise<unknown>) => Promise<T>
): Promise<T> {
  await ensureDatabase();
  if (usesPostgres()) {
    const client: PoolClient = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await fn(async (sql, ...params) => {
        const res = await client.query(toPg(sql), params);
        return res.rows;
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return fn(async (sql, ...params) =>
    getDb().prepare(sql).all(...sqliteArgs(params))
  );
}

export async function closeDb(): Promise<void> {
  closeSqlite();
  if (pool) {
    await pool.end();
    pool = null;
  }
  ready = null;
}

export function persistLabel(): string {
  return usesPostgres() ? "supabase" : "sqlite";
}
