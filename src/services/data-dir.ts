import path from "path";

export function getDataDir(): string {
  const override = process.env.SENDA_DATA_DIR?.trim();
  return override || path.join(process.cwd(), "data");
}
