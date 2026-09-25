"use client";

import { usePrivy, useSigners } from "@privy-io/react-auth";
import { useCreateWallet } from "@privy-io/react-auth/extended-chains";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  getSendaApiUrl,
  getSessionSignerId,
  getSpendPolicyId,
  getWhatsAppReturnUrl,
} from "../../lib/env";

type SetupInfo = {
  valid: boolean;
  phoneHint?: string;
  phoneE164?: string;
};

type Screen = "loading" | "invalid" | "login" | "working" | "done" | "error";

function stellarWalletOf(user: {
  linkedAccounts?: Array<{
    type?: string;
    chainType?: string;
    address?: string;
    id?: string | null;
  }>;
}): { address: string; id: string } | null {
  const wallet = user.linkedAccounts?.find(
    (item) =>
      item.type === "wallet" &&
      item.chainType === "stellar" &&
      item.address &&
      item.id
  );
  if (!wallet?.address || !wallet.id) {
    return null;
  }
  return { address: wallet.address, id: wallet.id };
}

function SetupInner() {
  const search = useSearchParams();
  const token = search.get("token")?.trim() || "";
  const { ready, authenticated, user, login } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { addSigners } = useSigners();

  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const api = useMemo(() => getSendaApiUrl(), []);
  const wa = useMemo(() => getWhatsAppReturnUrl(), []);

  useEffect(() => {
    if (!token) {
      setScreen("invalid");
      return;
    }

    let cancelled = false;
    fetch(`${api}/api/setup/${token}`)
      .then(async (res) => {
        const body = (await res.json()) as SetupInfo;
        if (cancelled) {
          return;
        }
        if (!res.ok || !body.valid) {
          setScreen("invalid");
          return;
        }
        setInfo(body);
        setScreen("login");
      })
      .catch(() => {
        if (!cancelled) {
          setScreen("invalid");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, token]);

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

      await addSigners({
        address: wallet.address,
        signers: [
          policyId ? { signerId, policyIds: [policyId] } : { signerId },
        ],
      });

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

  if (screen === "loading" || !ready) {
    return (
      <div className="card">
        <h1>Senda</h1>
        <p>Estamos abriendo tu alta…</p>
      </div>
    );
  }

  if (screen === "invalid") {
    return (
      <div className="card">
        <h1>Este enlace ya no sirve</h1>
        <p>Pedile a Senda uno nuevo por WhatsApp. Es de un solo uso.</p>
        <p>
          <a className="button" href={wa}>
            Volver a WhatsApp
          </a>
        </p>
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

export function SetupClient() {
  return (
    <Suspense
      fallback={
        <div className="card">
          <h1>Senda</h1>
          <p>Estamos abriendo tu alta…</p>
        </div>
      }
    >
      <SetupInner />
    </Suspense>
  );
}
