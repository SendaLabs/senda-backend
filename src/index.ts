import express, { Request, Response } from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "senda-backend",
    network: process.env.STELLAR_NETWORK ?? "testnet",
  });
});

app.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
});

app.post("/webhook", (req: Request, res: Response) => {
  const payload = req.body as unknown;
  console.log("WhatsApp webhook:", JSON.stringify(payload));
  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`Senda backend escuchando en http://localhost:${port}`);
});
