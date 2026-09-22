import { Keypair } from "@stellar/stellar-sdk";
import { getOrCreateUserAccount } from "./stellar.service";
import {
  ensureUsdcTrustline,
  fromUsdcStroops,
  getUsdcBalance,
  toUsdcStroops,
  transferUsdcFromWallet,
} from "./usdc.service";
import {
  createPartnerWithdrawal,
  extractPartner,
  listPartnerLabels,
  partnerPrompt,
} from "./offramp.partners";
import {
  getLatestPendingOrder,
  saveOfframpOrder,
  type OfframpOrder,
  type OfframpPartnerId,
} from "./offramp.store";

export class OfframpInsufficientFundsError extends Error {
  readonly available: string;
  readonly requested: number;

  constructor(available: string, requested: number) {
    super("insufficient funds for offramp");
    this.name = "OfframpInsufficientFundsError";
    this.available = available;
    this.requested = requested;
  }
}

export { extractPartner, listPartnerLabels, partnerPrompt };
export type { OfframpPartnerId };

function getOfframpVaultPublicKey(): string {
  const configured = process.env.STELLAR_OFFRAMP_PUBLIC_KEY?.trim();
  if (configured) {
    return configured;
  }

  const secret = process.env.STELLAR_SECRET_KEY?.trim();
  if (!secret) {
    throw new Error("Falta STELLAR_OFFRAMP_PUBLIC_KEY o STELLAR_SECRET_KEY");
  }
  return Keypair.fromSecret(secret).publicKey();
}

export async function createCashWithdrawal(
  phone: string,
  amount: number,
  partner: OfframpPartnerId
): Promise<OfframpOrder> {
  const user = await getOrCreateUserAccount(phone);
  await ensureUsdcTrustline(user);

  const available = await getUsdcBalance(user.publicKey);
  const needed = toUsdcStroops(amount);
  if (available < needed) {
    throw new OfframpInsufficientFundsError(fromUsdcStroops(available), amount);
  }

  const quote = await createPartnerWithdrawal(partner, amount, phone);
  const vault = getOfframpVaultPublicKey();
  const transfer = await transferUsdcFromWallet(user, vault, amount);

  return saveOfframpOrder({
    id: quote.reference,
    phone,
    amountUsdc: transfer.amountUsdc,
    partner,
    partnerLabel: quote.label,
    pickupCode: quote.pickupCode,
    locationHint: quote.locationHint,
    expiresAt: quote.expiresAt,
    status: "pending_pickup",
    txHash: transfer.txHash,
    createdAt: new Date().toISOString(),
  });
}

export function getOpenCashWithdrawal(phone: string): OfframpOrder | undefined {
  return getLatestPendingOrder(phone);
}

export async function getSpendableUsdc(phone: string): Promise<string> {
  const user = await getOrCreateUserAccount(phone);
  const balance = await getUsdcBalance(user.publicKey);
  return fromUsdcStroops(balance);
}
