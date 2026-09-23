const MIN_SECRET_LENGTH = 32;

function readRequiredSecret(name: string): string {
  const raw = process.env[name]?.trim();
  if (!raw) {
    throw new Error(`Falta ${name}. No se reutiliza STELLAR_SECRET_KEY.`);
  }
  if (raw.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} debe tener al menos ${MIN_SECRET_LENGTH} caracteres`);
  }
  return raw;
}

export function getCustodyMasterSecret(): string {
  const master = readRequiredSecret("CUSTODY_MASTER_SECRET");
  const ops = process.env.STELLAR_SECRET_KEY?.trim();
  if (ops && master === ops) {
    throw new Error(
      "CUSTODY_MASTER_SECRET no puede ser igual a STELLAR_SECRET_KEY"
    );
  }
  return master;
}

export function getFileVaultSecret(): string {
  const vault = readRequiredSecret("FILE_VAULT_SECRET");
  const master = process.env.CUSTODY_MASTER_SECRET?.trim();
  const ops = process.env.STELLAR_SECRET_KEY?.trim();
  if (vault === master || (ops && vault === ops)) {
    throw new Error(
      "FILE_VAULT_SECRET debe ser distinto de CUSTODY_MASTER_SECRET y STELLAR_SECRET_KEY"
    );
  }
  return vault;
}

export function assertRuntimeSecrets(): void {
  getCustodyMasterSecret();
  getFileVaultSecret();
}
