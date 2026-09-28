import dns from "node:dns";
import { Pool, type PoolClient } from "pg";
import { SCHEMA, closeDb as closeSqlite, getDb } from "./sqlite";

// Render free cannot open outbound IPv6 to Supabase direct hosts (ENETUNREACH).
dns.setDefaultResultOrder("ipv4first");

type SqlParam = string | number | bigint | null;

function sqliteArgs(params: SqlParam[]): never[] {
  return params as never[];
}

/**
 * Supabase direct db.*.supabase.co often resolves to IPv6-only; Render free
 * cannot reach it. Rewrite to the session pooler (IPv4) when needed.
 */
export function normalizePostgresUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(trimmed);
    const direct = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (!direct) {
      return trimmed;
    }
    const projectRef = direct[1];
    const region =
      process.env.SUPABASE_REGION?.trim() ||
      process.env.SUPABASE_POOLER_REGION?.trim() ||
      "sa-east-1";
    url.hostname = `aws-0-${region}.pooler.supabase.com`;
    // Pooler expects username as "role.projectRef".
    if (url.username && !url.username.includes(".")) {
      url.username = `${decodeURIComponent(url.username)}.${projectRef}`;
    }
    // Session mode (5432) keeps DDL used by ensurePostgres working.
    if (!url.port || url.port === "5432") {
      url.port = "5432";
    }
    if (!url.searchParams.has("sslmode")) {
      url.searchParams.set("sslmode", "require");
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

export function postgresUrl(): string {
  const raw =
    process.env.DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    "";
  return normalizePostgresUrl(raw);
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
  const db = getDb();
  db.exec("BEGIN");
  try {
    const result = await fn(async (sql, ...params) =>
      db.prepare(sql).all(...sqliteArgs(params))
    );
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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
