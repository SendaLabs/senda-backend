import { sqliteFilePath } from "./sqlite";

/** Persistencia activa: SQLite (`data/senda.db`). */
export function getPrisma(): never {
  throw new Error(
    `Prisma Client no corre. La base activa es SQLite en ${sqliteFilePath()}`
  );
}
