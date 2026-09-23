import { loadAnchorToml } from "./sep10";

export interface Sep24WithdrawStart {
  id: string;
  url: string;
}

export interface Sep24Transaction {
  id: string;
  status: string;
  amount_in?: string;
  withdraw_anchor_account?: string;
  withdraw_memo?: string;
  withdraw_memo_type?: string;
}

async function sep24BaseUrl(): Promise<string> {
  const toml = await loadAnchorToml();
  const base = toml.TRANSFER_SERVER_SEP0024;
  if (!base) {
    throw new Error("El ancla no publica TRANSFER_SERVER_SEP0024");
  }
  return base.replace(/\/$/, "");
}

export async function startWithdraw(
  walletAddress: string,
  jwt: string,
  amount: number
): Promise<Sep24WithdrawStart> {
  const base = await sep24BaseUrl();
  const response = await fetch(`${base}/transactions/withdraw/interactive`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      asset_code: process.env.USDC_CODE?.trim() || "USDC",
      account: walletAddress,
      amount: String(amount),
      lang: "es",
    }),
  });

  if (!response.ok) {
    throw new Error(`SEP-24 no inició el retiro (${response.status})`);
  }

  const body = (await response.json()) as {
    id?: string;
    url?: string;
    type?: string;
  };
  if (!body.id || !body.url) {
    throw new Error("SEP-24 no devolvió url o id");
  }
  return { id: body.id, url: body.url };
}

export async function pollTransactionStatus(
  jwt: string,
  transactionId: string
): Promise<Sep24Transaction> {
  const base = await sep24BaseUrl();
  const url = new URL(`${base}/transaction`);
  url.searchParams.set("id", transactionId);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!response.ok) {
    throw new Error(`SEP-24 no consultó la transacción (${response.status})`);
  }
  const body = (await response.json()) as { transaction?: Sep24Transaction };
  if (!body.transaction) {
    throw new Error("SEP-24 no devolvió la transacción");
  }
  return body.transaction;
}
