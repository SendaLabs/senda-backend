import QRCode from "qrcode";
import { getUsdcAsset } from "../services/usdc.service";

export interface Sep7PayRequest {
  destination: string;
  amount?: string;
  assetCode?: string;
  assetIssuer?: string;
  memo?: string;
  msg?: string;
}

export function buildSep7PayUri(input: Sep7PayRequest): string {
  const params = new URLSearchParams();
  params.set("destination", input.destination);
  if (input.amount) {
    params.set("amount", input.amount);
  }
  if (input.assetCode) {
    params.set("asset_code", input.assetCode);
  }
  if (input.assetIssuer) {
    params.set("asset_issuer", input.assetIssuer);
  }
  if (input.memo) {
    params.set("memo", input.memo.slice(0, 28));
  }
  if (input.msg) {
    params.set("msg", input.msg);
  }
  return `web+stellar:pay?${params.toString()}`;
}

export function buildSendaCobroUri(
  destination: string,
  amount?: number
): string {
  const asset = getUsdcAsset();
  return buildSep7PayUri({
    destination,
    amount: amount !== undefined ? String(amount) : undefined,
    assetCode: asset.code,
    assetIssuer: asset.issuer,
    msg: "Cobro Senda",
  });
}

export function parseSep7PayUri(text: string): Sep7PayRequest | null {
  const match = text.match(/web\+stellar:pay\?([^\s]+)/i);
  if (!match?.[1]) {
    return null;
  }

  const params = new URLSearchParams(match[1]);
  const destination = params.get("destination")?.trim() ?? "";
  if (!/^[GC][A-Z2-7]{55}$/.test(destination)) {
    return null;
  }

  return {
    destination,
    amount: params.get("amount") ?? undefined,
    assetCode: params.get("asset_code") ?? undefined,
    assetIssuer: params.get("asset_issuer") ?? undefined,
    memo: params.get("memo") ?? undefined,
    msg: params.get("msg") ?? undefined,
  };
}

export async function renderSep7QrPng(uri: string): Promise<Buffer> {
  return QRCode.toBuffer(uri, {
    type: "png",
    width: 512,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}
