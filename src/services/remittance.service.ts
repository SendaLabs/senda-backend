import { extractUsdAmount } from "./intent.service";

export function parseUsdAmount(text: string): number | null {
  return extractUsdAmount(text);
}
