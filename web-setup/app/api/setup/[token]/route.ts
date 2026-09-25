import { proxyBackend } from "../../../../lib/backend";

export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  return proxyBackend(`/api/setup/${encodeURIComponent(token)}`);
}
