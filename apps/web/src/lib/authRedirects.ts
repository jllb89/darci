export const sanitizeAuthReturnTo = (value: string | null | undefined) => {
  const candidate = value?.trim() ?? "";
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/app";
  }

  const isAppRoute =
    candidate === "/app" || candidate.startsWith("/app/") || candidate.startsWith("/app?");

  return isAppRoute ? candidate : "/app";
};

export const buildAuthCallbackUrl = (input: {
  origin: string;
  intent: "signup" | "recovery" | "magic-link" | "otp";
  returnTo?: string | null;
}) => {
  const callbackUrl = new URL("/auth/callback", input.origin);
  callbackUrl.searchParams.set("intent", input.intent);
  callbackUrl.searchParams.set("returnTo", sanitizeAuthReturnTo(input.returnTo));
  return callbackUrl.toString();
};