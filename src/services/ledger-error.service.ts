function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name} ${error.message} ${error.stack ?? ""}`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function humanizeLedgerError(error: unknown): string {
  const raw = errorText(error).toLowerCase();

  if (
    error instanceof Error &&
    (error.name === "UsdcBalanceUnavailableError" ||
      /no se pudo consultar el saldo/.test(raw))
  ) {
    return "No pude consultar tu saldo ahora. Probá en un rato.";
  }

  if (
    error instanceof Error &&
    (error.name === "SacUnconfirmedError" || /no reenviamos el pago/.test(raw))
  ) {
    return "El envío quedó en camino. No lo repetimos para no cobrarte dos veces. Pedime el saldo en un rato.";
  }

  if (error instanceof Error && error.name === "AmountLimitError") {
    return "Ese monto supera el máximo por operación. Pedime uno más chico.";
  }

  if (error instanceof Error && error.name === "CreditRateLimitError") {
    return "Por hoy llegaste al tope de envíos. Probá más tarde.";
  }

  if (error instanceof Error && error.name === "WalletSetupRequiredError") {
    return error.message;
  }

  if (error instanceof Error && error.name === "BlendOperationError") {
    return error.message;
  }

  if (/cuenta operativa no está fondeada|friendbot|falta stellar_secret_key/i.test(raw)) {
    return "Ahora no puedo mover dólares: la cuenta de Senda no está lista. Probá en un rato.";
  }

  if (/simulación sac|sac rechazó|sac transfer failed/i.test(raw)) {
    return "La red no aceptó ese envío. No se movió nada. Probá de nuevo en un momento.";
  }

  if (
    error instanceof Error &&
    /PRIVY_SESSION_SIGNER_PRIVATE_KEY|delegado el signer/i.test(error.message)
  ) {
    return "Tu cuenta todavía no delegó el permiso de Senda. Completá el alta y escribime de nuevo.";
  }

  if (error instanceof Error && error.name === "CreditInFlightError") {
    return "Ese envío ya se está procesando. Dame un toque y pedime el saldo.";
  }

  if (
    /no te alcanza el saldo para (poner esa plata a rendir|ese retiro a mercado pago)/.test(
      raw
    )
  ) {
    return "No te alcanza el saldo para eso. Pedime el saldo o mandá un monto más chico.";
  }

  if (/no pude (poner|armar).*rendir|no mandamos nada a la red/.test(raw)) {
    return "No pude poner esa plata a rendir. Probá de nuevo en un rato o seguí con el saldo y el retiro.";
  }

  if (/sep-?10|sep-?24|testanchor|home domain/.test(raw)) {
    return "No pude abrir el retiro a Mercado Pago ahora. El envío y el saldo siguen andando. Probá de nuevo en un rato.";
  }

  if (
    /budget|resource limit|tx_insufficient_fee|insufficient fee|gas|exceeded.*limit/.test(
      raw
    )
  ) {
    return "La red de Stellar está un poco ocupada y no alcanzó el fee. Intentemos de nuevo en un momento.";
  }

  if (
    /underfund|op_underfunded|balance too low|exceeds balance|#1286|not enough|insufficient (balance|funds|amount)|offramp/.test(
      raw
    )
  ) {
    return "No hay saldo suficiente ahora para completar ese envío. Probá de nuevo en un momento o con un monto un poco menor.";
  }

  if (
    /hosterror|wasm|unreachable|unrecoverable|soroban|invokehostfunction|diagnostic/.test(
      raw
    )
  ) {
    return "Ups, hubo un pequeño problema al procesar la red de Stellar. Intentemos de nuevo en un momento.";
  }

  return "No pude completar esa operación ahora. Probá de nuevo en un rato.";
}

export function replyUserError(error: unknown): string {
  if (error instanceof Error && error.name === "WhatsAppSendError") {
    return "No pude mandarte el mensaje ahora. Escribime de nuevo en un rato.";
  }

  const raw = errorText(error).toLowerCase();
  const isLedger =
    (error instanceof Error &&
      /Usdc|Sac|Amount|Credit|Offramp|Blend|WalletSetup/.test(error.name)) ||
    /stellar|soroban|horizon|hosterror|wasm|underfund|tx_insufficient|op_|blend|usdc|ledger/.test(
      raw
    );

  if (isLedger) {
    return humanizeLedgerError(error);
  }

  return "Tuve un problema al procesar tu mensaje. ¿Lo intentamos de nuevo?";
}
