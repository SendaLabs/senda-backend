import { startWithdraw } from "../sep/sep24";
import { getSep10Jwt } from "../sep/sep10";
import { getOrCreateUserAccount } from "../services/stellar.service";

export type OfframpCorridor = "mercado_pago_ars";

export interface OfframpStartResult {
  id: string;
  url?: string;
  providerId: string;
  authToken?: string;
}

export interface OfframpProvider {
  id: string;
  label: string;
  corridors: OfframpCorridor[];
  startWithdraw(input: {
    phone: string;
    amount: number;
  }): Promise<OfframpStartResult>;
}

export class Sep24AnchorAdapter implements OfframpProvider {
  readonly id = "sep24_anchor";
  readonly label = "Ancla SEP-24 (Mercado Pago / ARS)";
  readonly corridors: OfframpCorridor[] = ["mercado_pago_ars"];

  async startWithdraw(input: {
    phone: string;
    amount: number;
  }): Promise<OfframpStartResult> {
    const user = await getOrCreateUserAccount(input.phone);
    const authToken = await getSep10Jwt(input.phone);
    const started = await startWithdraw(user.publicKey, authToken, input.amount);
    return {
      id: started.id,
      url: started.url,
      providerId: this.id,
      authToken,
    };
  }
}

const providers: OfframpProvider[] = [new Sep24AnchorAdapter()];

export function routeOfframpProvider(
  corridor: OfframpCorridor = "mercado_pago_ars"
): OfframpProvider {
  const match = providers.find((provider) =>
    provider.corridors.includes(corridor)
  );
  if (!match) {
    throw new Error(`No hay proveedor de retiro para ${corridor}`);
  }
  return match;
}

export function listOfframpProviders(): ReadonlyArray<OfframpProvider> {
  return providers;
}
