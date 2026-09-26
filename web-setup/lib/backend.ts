function usableApiUrl(raw?: string): string {
  const value = (raw ?? "").trim().replace(/\/$/, "");
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (local && process.env.NODE_ENV === "production") {
      return "";
    }
    return value;
  } catch {
    return "";
  }
}

export function getBackendApiUrl(): string {
  const configured =
    usableApiUrl(process.env.SENDA_API_URL) ||
    usableApiUrl(process.env.NEXT_PUBLIC_SENDA_API_URL);
  if (configured) {
    return configured;
  }
  // Production must fail closed — never fall back to a hardcoded host.
  if (process.env.NODE_ENV === "production") {
    return "";
  }
  return "http://localhost:3000";
}

function apiCandidates(): string[] {
  const base = getBackendApiUrl();
  return base ? [base] : [];
}

function missingApiResponse(): Response {
  return Response.json(
    {
      valid: false,
      ok: false,
      error:
        "Falta SENDA_API_URL en el sitio de alta. No hablamos con ningún API por defecto.",
    },
    { status: 503 }
  );
}

export async function proxyBackend(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const candidates = apiCandidates();
  if (candidates.length === 0) {
    return missingApiResponse();
  }

  let last: Response | null = null;
  for (const base of candidates) {
    try {
      const res = await fetch(`${base}${path}`, {
        ...init,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
      const body = await res.text();
      if (res.ok || res.status < 500) {
        return new Response(body, {
          status: res.status,
          headers: {
            "Content-Type": res.headers.get("Content-Type") || "application/json",
          },
        });
      }
      last = new Response(body, { status: res.status });
    } catch {
      last = null;
    }
  }
  return (
    last ??
    Response.json(
      {
        valid: false,
        ok: false,
        error: "Senda no pudo hablar con el API. Probá de nuevo en un momento.",
      },
      { status: 503 }
    )
  );
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

  const base = getBackendApiUrl();
  if (!base) {
    return {
      valid: false,
      error:
        "Falta SENDA_API_URL en el sitio de alta. No hablamos con ningún API por defecto.",
    };
  }

  try {
    const res = await fetch(
      `${base}/api/setup/${encodeURIComponent(trimmed)}`,
      { cache: "no-store" }
    );
    const body = (await res.json()) as SetupInfo;
    if (body.valid) {
      return body;
    }
    // Definitive invalid (e.g. 404 { valid: false }) from the configured API is final.
    // Do not probe another host.
    if (res.status < 500) {
      return {
        valid: false,
        error: body.error,
      };
    }
    return {
      valid: false,
      error: "Senda no pudo validar el enlace. Probá de nuevo en un rato.",
    };
  } catch {
    return {
      valid: false,
      error: "No pude hablar con Senda. Probá de nuevo en un momento.",
    };
  }
}
