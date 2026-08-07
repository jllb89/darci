import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await context.params;
  const returnTo = `/app/requests/${encodeURIComponent(requestId)}`;
  const destination = new URL("/start", request.url);
  destination.searchParams.set("returnTo", returnTo);

  const intendedEmail = request.nextUrl.searchParams.get("intendedEmail")?.trim();
  if (intendedEmail) {
    destination.searchParams.set("intendedEmail", intendedEmail);
  }

  return NextResponse.redirect(destination, 307);
}
