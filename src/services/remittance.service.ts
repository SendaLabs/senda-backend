export function parseUsdAmount(text: string): number | null {
  const normalized = text.replace(",", ".").replace(/[^\d.]/g, "");
  if (!normalized) {
    return null;
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100) / 100;
}
