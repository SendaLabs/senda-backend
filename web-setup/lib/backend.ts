const FALLBACK_API_URL = "https://senda-backend-2r5k.onrender.com";

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
  return (
    usableApiUrl(process.env.SENDA_API_URL) ||
    usableApiUrl(process.env.NEXT_PUBLIC_SENDA_API_URL) ||
    FALLBACK_API_URL
  );
}

function apiCandidates(): string[] {
  const urls = [
    usableApiUrl(process.env.SENDA_API_URL),
    usableApiUrl(process.env.NEXT_PUBLIC_SENDA_API_URL),
    FALLBACK_API_URL,
  ].filter(Boolean);
  return [...new Set(urls)];
}

export async function proxyBackend(
  path: string,
  init?: RequestInit
): Promise<Response> {
  let last: Response | null = null;
  for (const base of apiCandidates()) {
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

  let last: SetupInfo = {
    valid: false,
    error: "No pude hablar con Senda. Probá de nuevo en un momento.",
  };

  for (const base of apiCandidates()) {
    try {
      const res = await fetch(
        `${base}/api/setup/${encodeURIComponent(trimmed)}`,
        { cache: "no-store" }
      );
      const body = (await res.json()) as SetupInfo;
      if (body.valid) {
        return body;
      }
      last = {
        valid: false,
        error:
          res.status >= 500
            ? "Senda no pudo validar el enlace. Probá de nuevo en un rato."
            : undefined,
      };
    } catch {
      continue;
    }
  }

  return last;
}
