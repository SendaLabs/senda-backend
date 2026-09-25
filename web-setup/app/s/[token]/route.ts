import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const dest = new URL("/setup", req.nextUrl.origin);
  dest.searchParams.set("token", token);
  return NextResponse.redirect(dest);
}
