import { NextRequest, NextResponse } from "next/server";

const fallbackAppOrigin = "https://app.staging.darciregistry.dev";

const isUnsafeHost = (host: string) => {
  const normalizedHost = host.split(":")[0]?.toLowerCase();
  return !normalizedHost || ["0.0.0.0", "localhost", "127.0.0.1", "::1"].includes(normalizedHost);
};

const getPublicOrigin = (request: NextRequest) => {
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  if (host && !isUnsafeHost(host)) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.trim() || "https";
    return `${forwardedProto}://${host}`;
  }

  const configuredOrigin =
    process.env.WEB_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_WEB_BASE_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    fallbackAppOrigin;

  try {
    const url = new URL(configuredOrigin);
    return isUnsafeHost(url.host) ? fallbackAppOrigin : url.origin;
  } catch {
    return fallbackAppOrigin;
  }
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await context.params;
  const returnTo = `/app/requests/${encodeURIComponent(requestId)}`;
  const destination = new URL("/start", getPublicOrigin(request));
  destination.searchParams.set("returnTo", returnTo);

  const intendedEmail = request.nextUrl.searchParams.get("intendedEmail")?.trim();
  if (intendedEmail) {
    destination.searchParams.set("intendedEmail", intendedEmail);
  }

  return NextResponse.redirect(destination, 307);
}
