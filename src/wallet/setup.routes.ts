import path from "path";
import type { Express, NextFunction, Request, Response } from "express";
import { upsertPrivyUser } from "../db/users.repository";
import { logSafeError, sendWhatsAppMessage } from "../services/whatsapp.service";
import {
  consumeSetupToken,
  maskPhone,
  peekSetupToken,
  setupFullUrl,
} from "./setup-token.store";
import { getSession, hydrateSession } from "../services/session.service";
import { buildSetupReadyMessage } from "./wallet-setup";

const STELLAR_PUBLIC_KEY = /^G[A-Z2-7]{55}$/;

function setupCorsOrigin(): string {
  return (
    process.env.WEB_SETUP_ORIGIN?.trim() ||
    process.env.WEB_SETUP_PUBLIC_URL?.trim() ||
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

function isLocalSetupOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

function allowSetupCors(req: Request, res: Response, next: NextFunction): void {
  const origin = (req.header("Origin") || "").replace(/\/$/, "");
  const configured = setupCorsOrigin();
  // Exact configured origin only. Do not reflect arbitrary *.onrender.com /
  // localhost.evil.com — setup tokens are bearer credentials.
  const allowed =
    origin &&
    (origin === configured ||
      (process.env.NODE_ENV !== "production" && isLocalSetupOrigin(origin)))
      ? origin
      : configured;
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function mountSetupRoutes(app: Express): void {
  app.use(["/api/setup", "/api/link-wallet"], allowSetupCors);

  app.get(["/setup", "/setup/"], (_req: Request, res: Response) => {
    res.sendFile(path.join(process.cwd(), "src", "public", "setup.html"));
  });

  app.get("/s/:token", async (req: Request, res: Response) => {
    const token = readString(req.params.token);
    if (!(await peekSetupToken(token))) {
      res
        .status(404)
        .type("html")
        .send(
          "<p>Ese enlace ya no sirve. Pedime uno nuevo por WhatsApp.</p>"
        );
      return;
    }
    res.redirect(302, setupFullUrl(token));
  });

  app.get("/api/setup/:token", async (req: Request, res: Response) => {
    const row = await peekSetupToken(readString(req.params.token));
    if (!row) {
      res.status(404).json({ valid: false });
      return;
    }
    const digits = row.phone.replace(/\D/g, "");
    res.json({
      valid: true,
      phoneHint: maskPhone(row.phone),
      phoneE164: digits ? `+${digits}` : "",
    });
  });

  app.post("/api/link-wallet", async (req: Request, res: Response) => {
    const token = readString(req.body?.token);
    const privyUserId = readString(req.body?.privyUserId);
    const walletId = readString(req.body?.walletId);
    const walletAddress = readString(req.body?.walletAddress).toUpperCase();

    if (!token || !privyUserId || !walletId || !STELLAR_PUBLIC_KEY.test(walletAddress)) {
      res.status(400).json({
        ok: false,
        error: "Faltan datos de la wallet o el token.",
      });
      return;
    }

    try {
      // Consume first (atomic) so a double-submit cannot link twice.
      const row = await consumeSetupToken(token);
      await upsertPrivyUser(row.phone, walletId, walletAddress, privyUserId);
      await hydrateSession(row.phone);
      res.json({
        ok: true,
        phoneHint: maskPhone(row.phone),
        walletAddress,
      });
      void sendWhatsAppMessage(
        row.phone,
        buildSetupReadyMessage(getSession(row.phone)?.locale ?? "es")
      ).catch(
        (error) => logSafeError("Alta: no pude avisar por WhatsApp", error)
      );
    } catch (error) {
      res.status(409).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No pude asociar esa wallet.",
      });
    }
  });
}
