import { proxyBackend } from "../../../lib/backend";

export async function POST(req: Request) {
  return proxyBackend("/api/link-wallet", {
    method: "POST",
    body: await req.text(),
  });
}
