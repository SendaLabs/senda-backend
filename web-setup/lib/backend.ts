export function getBackendApiUrl(): string {
  return (
    process.env.SENDA_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_SENDA_API_URL?.trim() ||
    "https://senda-backend-2r5k.onrender.com"
  ).replace(/\/$/, "");
}

export async function proxyBackend(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const target = `${getBackendApiUrl()}${path}`;
  try {
    const res = await fetch(target, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
      },
    });
  } catch {
    return Response.json(
      {
        valid: false,
        ok: false,
        error: "Senda no pudo hablar con el API. Probá de nuevo en un momento.",
      },
      { status: 503 }
    );
  }
}

export type SetupInfo = {
  valid: boolean;
  phoneHint?: string;
  phoneE164?: string;
  error?: string;
};

export async function fetchSetupInfo(token: string): Promise<SetupInfo> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { valid: false };
  }
  try {
    const res = await fetch(
      `${getBackendApiUrl()}/api/setup/${encodeURIComponent(trimmed)}`,
      { cache: "no-store" }
    );
    const body = (await res.json()) as SetupInfo;
    if (!res.ok || !body.valid) {
      return {
        valid: false,
        error:
          res.status >= 500
            ? "Senda no pudo validar el enlace. Probá de nuevo en un rato."
            : undefined,
      };
    }
    return body;
  } catch {
    return {
      valid: false,
      error: "No pude hablar con Senda. Probá de nuevo en un momento.",
    };
  }
}
