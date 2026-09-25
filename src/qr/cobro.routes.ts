import type { Express, Request, Response } from "express";
import { cobroPublicUrl, peekCobro } from "./cobro.store";
import { formatCobroAmount } from "./cobro-copy";
import { buildSendaCobroUri, renderSep7QrPng } from "./sep7";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cobroHeading(amount?: number): string {
  if (amount !== undefined) {
    return `Te piden ${formatCobroAmount(amount)} dólares`;
  }
  return "Te piden un pago por Senda";
}

export function mountCobroRoutes(app: Express): void {
  app.get("/c/:token/qr.png", async (req: Request, res: Response) => {
    const row = peekCobro(String(req.params.token ?? ""));
    if (!row) {
      res.sendStatus(404);
      return;
    }
    const png = await renderSep7QrPng(cobroPublicUrl(String(req.params.token)));
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(png);
  });

  app.get("/c/:token", (req: Request, res: Response) => {
    const token = String(req.params.token ?? "");
    const row = peekCobro(token);
    if (!row) {
      res
        .status(404)
        .type("html")
        .send(
          "<p>Ese cobro ya no está. Pedile a la otra persona que te mande uno nuevo por WhatsApp.</p>"
        );
      return;
    }

    const title = cobroHeading(row.amount);
    const payHref = escapeHtml(buildSendaCobroUri(row.destination, row.amount));
    res.type("html").send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="font-family:sans-serif;max-width:28rem;margin:2rem auto;padding:0 1rem;text-align:center;color:#111">
  <p style="font-size:0.9rem;letter-spacing:0.08em;text-transform:uppercase">Senda</p>
  <h1 style="font-size:1.6rem">${escapeHtml(title)}</h1>
  <p>Si usás Senda, abrí WhatsApp y pegá este mismo enlace en el chat.</p>
  <p><a href="${payHref}" style="display:inline-block;margin-top:1rem;padding:0.8rem 1.2rem;background:#111;color:#fff;text-decoration:none;border-radius:8px">Pagar</a></p>
  <p style="color:#555;font-size:0.95rem">El botón «Pagar» es para otra app de dólares. No hace falta copiar ninguna dirección.</p>
</body>
</html>`);
  });
}
