"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || "";

  if (!appId) {
    return (
      <main>
        <div className="card">
          <h1>Falta configurar Privy</h1>
          <p>Cargá NEXT_PUBLIC_PRIVY_APP_ID en web-setup/.env.local.</p>
        </div>
      </main>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["sms"],
        intl: { defaultCountry: "AR" },
        appearance: {
          theme: "light",
          landingHeader: "Senda",
        },
        embeddedWallets: {
          showWalletUIs: false,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
