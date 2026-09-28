"use client";

import { usePrivy, useSigners } from "@privy-io/react-auth";
import { useCreateWallet } from "@privy-io/react-auth/extended-chains";
import { useEffect, useMemo, useState } from "react";
import type { SetupInfo } from "../../lib/backend";
import {
  getSendaApiUrl,
  getSessionSignerId,
  getSpendPolicyId,
  getWhatsAppReturnUrl,
} from "../../lib/env";

type Screen = "loading" | "invalid" | "login" | "working" | "done" | "error";

function isClassicStellarAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/i.test(address.trim());
}

function collectErrorText(error: unknown, depth = 0): string {
  if (depth > 6 || error == null) {
    return "";
  }
  if (typeof error === "string" || typeof error === "number") {
    return String(error);
  }
  if (error instanceof Error) {
    const cause = collectErrorText(
      (error as Error & { cause?: unknown }).cause,
      depth + 1
    );
    return [error.name, error.message, cause].filter(Boolean).join(" ");
  }
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    return ["message", "code", "error", "error_code", "status", "detail", "data"]
      .map((key) => collectErrorText(record[key], depth + 1))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function isDuplicateSignerError(error: unknown): boolean {
  const message = collectErrorText(error);
  return /duplicate|already\s+(exists|added|registered|present)|signer.*(exist|present|duplicate)|ALREADY_EXISTS|\b409\b/i.test(
    message
  );
}

function walletAlreadyHasSigner(
  user: unknown,
  walletAddress: string,
  signerId: string
): boolean {
  if (!user || typeof user !== "object" || !signerId) {
    return false;
  }
  const needle = signerId.toLowerCase();
  const addr = walletAddress.toLowerCase();
  const u = user as {
    linkedAccounts?: unknown[];
    wallet?: unknown;
  };
  const bags: unknown[] = [u.wallet, ...(u.linkedAccounts ?? [])];
  for (const bag of bags) {
    if (!bag || typeof bag !== "object") {
      continue;
    }
    const row = bag as Record<string, unknown>;
    const rowAddr = String(row.address ?? "").toLowerCase();
    if (rowAddr && rowAddr !== addr) {
      continue;
    }
    const signers = (row.signers ??
      row.authorizedSigners ??
      row.additional_signers) as unknown[] | undefined;
    if (!Array.isArray(signers)) {
      continue;
    }
    for (const signer of signers) {
      if (typeof signer === "string" && signer.toLowerCase() === needle) {
        return true;
      }
      if (signer && typeof signer === "object") {
        const s = signer as Record<string, unknown>;
        const id = String(s.signerId ?? s.id ?? s.address ?? "").toLowerCase();
        if (id && id === needle) {
          return true;
        }
      }
    }
  }
  return false;
}

function stellarWalletOf(user: {
  linkedAccounts?: Array<{
    type?: string;
    chainType?: string;
    address?: string;
    id?: string | null;
  }>;
}): { address: string; id: string } | null {
  const stellar = (user.linkedAccounts ?? []).filter(
    (item) =>
      item.type === "wallet" &&
      (item.chainType === "stellar" ||
        (item as { chain_type?: string }).chain_type === "stellar") &&
      item.address &&
      (item.id || (item as { walletId?: string }).walletId)
  );
  const wallet =
    stellar.find((item) => isClassicStellarAddress(item.address || "")) ||
    stellar[0];
  const id =
    wallet?.id ||
    (wallet as { walletId?: string } | undefined)?.walletId ||
    null;
  if (!wallet?.address || !id) {
    return null;
  }
  return { address: wallet.address, id };
}

function SetupInner({
  token,
  initial,
}: {
  token: string;
  initial: SetupInfo;
}) {
  const { ready, authenticated, user, login } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { addSigners } = useSigners();

  const [info, setInfo] = useState<SetupInfo | null>(
    initial.valid ? initial : null
  );
  const [screen, setScreen] = useState<Screen>(() =>
    !token ? "invalid" : initial.valid ? "login" : initial.error ? "loading" : "invalid"
  );
  const [error, setError] = useState(initial.error || "");
  const [busy, setBusy] = useState(false);

  const api = useMemo(() => getSendaApiUrl(), []);
  const wa = useMemo(() => getWhatsAppReturnUrl(), []);

  useEffect(() => {
    if (!token || initial.valid || !initial.error) {
      return;
    }
    let cancelled = false;
    fetch(`${api}/api/setup/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = (await res.json()) as SetupInfo;
        if (cancelled) {
          return;
        }
        if (body.valid) {
          setInfo(body);
          setError("");
          setScreen("login");
          return;
        }
        setError(
          body.error ||
            (res.status >= 500
              ? "Senda no pudo validar el enlace. Probá de nuevo en un rato."
              : "")
        );
        setScreen("invalid");
      })
      .catch(() => {
        if (!cancelled) {
          setError("No pude hablar con Senda. Probá de nuevo en un momento.");
          setScreen("invalid");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, initial.error, initial.valid, token]);

  useEffect(() => {
    if (screen !== "done" || !wa || wa === "https://wa.me/") {
      return;
    }
    const timer = window.setTimeout(() => {
      window.location.href = wa;
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [screen, wa]);

  async function finishOnboarding() {
    if (!user || busy) {
      return;
    }

    const signerId = getSessionSignerId();
    if (!signerId) {
      setError("Falta el session signer en el .env.local del sitio.");
      setScreen("error");
      return;
    }
    const policyId = getSpendPolicyId();

    setBusy(true);
    setScreen("working");
    setError("");

    try {
      let wallet = stellarWalletOf(user);
      if (!wallet) {
        const created = await createWallet({ chainType: "stellar" });
        if (!created.wallet.id) {
          throw new Error("Privy no devolvió el id de la wallet.");
        }
        wallet = {
          address: created.wallet.address,
          id: created.wallet.id,
        };
      }

      if (!isClassicStellarAddress(wallet.address)) {
        throw new Error(
          "Privy no devolvió una clave Stellar clásica (G…). Probá de nuevo o pedile a Senda otro link."
        );
      }

      // Keep Privy's address casing for addSigners; backend uppercases for Stellar G-keys.
      // Empty policyIds = full signer permission per Privy docs (omit broke some SDK builds).
      // If the signer is already on the wallet, skip addSigners and still link.
      if (!walletAlreadyHasSigner(user, wallet.address, signerId)) {
        try {
          await addSigners({
            address: wallet.address,
            signers: [
              {
                signerId,
                policyIds: policyId ? [policyId] : [],
              },
            ],
          });
        } catch (signerError) {
          if (!isDuplicateSignerError(signerError)) {
            throw signerError;
          }
        }
      }

      const res = await fetch(`${api}/api/link-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          privyUserId: user.id,
          walletId: wallet.id,
          walletAddress: wallet.address,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        throw new Error(body.error || "No pude asociar la wallet.");
      }

      setScreen("done");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pude terminar el alta."
      );
      setScreen("error");
    } finally {
      setBusy(false);
    }
  }

  if (screen === "invalid") {
    return (
      <div className="card">
        <h1>Este enlace ya no sirve</h1>
        <p>
          {error ||
            "Pedile a Senda uno nuevo por WhatsApp. Es de un solo uso."}
        </p>
        <p>
          <a className="button" href={wa}>
            Volver a WhatsApp
          </a>
        </p>
      </div>
    );
  }

  if (screen === "loading" || !ready) {
    return (
      <div className="card">
        <h1>Senda</h1>
        <p>Estamos abriendo tu alta…</p>
      </div>
    );
  }

  if (screen === "done") {
    return (
      <div className="card">
        <h1>Listo 💚 tu cuenta está creada</h1>
        <p>
          Ya podés volver a WhatsApp. En un momento te llega un mensajito de
          Senda. Después pedime lo que necesites, con tus palabras o una nota de
          voz.
        </p>
        <p>
          <a className="button" href={wa}>
            Abrir el chat
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Qué bueno que estés acá</h1>
      <p>
        Vamos a abrir tu cuenta. Es una sola vez. Entrá con tu email
        {info?.phoneHint ? ` (este link es de tu WhatsApp ${info.phoneHint})` : ""}.
      </p>
      <p className="hint">
        Te llega un código al correo. Después le das permiso a Senda para
        ayudarte a mover tu plata desde el chat.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {!authenticated ? (
        <button
          type="button"
          onClick={() =>
            login({
              loginMethods: ["email"],
            })
          }
          disabled={busy}
        >
          Continuar con mi email
        </button>
      ) : (
        <button type="button" onClick={() => void finishOnboarding()} disabled={busy}>
          {busy || screen === "working" ? "Creando tu cuenta…" : "Crear mi cuenta"}
        </button>
      )}
    </div>
  );
}

export function SetupClient({
  token,
  initial,
}: {
  token: string;
  initial: SetupInfo;
}) {
  return <SetupInner token={token} initial={initial} />;
}
