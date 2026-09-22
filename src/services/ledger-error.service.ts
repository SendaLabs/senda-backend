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

  return "Ups, hubo un pequeño problema al procesar la red de Stellar. Intentemos de nuevo en un momento.";
}
