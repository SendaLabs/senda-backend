/** Persistencia activa: `users.repository.ts` (JSON). Prisma queda opcional. */
export function getPrisma(): never {
  throw new Error("Prisma no está activo; usamos data/senda-db.json");
}
