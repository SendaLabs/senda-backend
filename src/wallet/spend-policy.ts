/** Límites del session signer de Senda. La policy en Privy tiene que copiar estos números. */
export const SENDA_MAX_USDC_PER_TRANSACTION = 500;
export const SENDA_MAX_USDC_PER_DAY = 2000;

export const SENDA_SPEND_POLICY = {
  maxUsdcPerTransaction: SENDA_MAX_USDC_PER_TRANSACTION,
  maxUsdcPerDay: SENDA_MAX_USDC_PER_DAY,
} as const;
