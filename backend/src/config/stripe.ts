import Stripe from "stripe";

export const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-07-29.dahlia";
export const STRIPE_PROVIDER_ENVIRONMENT = "test" as const;

let stripeClient: Stripe | null = null;

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

export const getStripeClient = () => {
  const secretKey = required("STRIPE_SECRET_KEY");
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Private beta requires a Stripe test-mode secret key");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION,
      appInfo: {
        name: "DARCi",
        version: process.env.npm_package_version ?? "1.0.0",
      },
      maxNetworkRetries: 2,
      timeout: 30_000,
    });
  }

  return stripeClient;
};

export const getStripeWebhookSecret = () => {
  const secret = required("STRIPE_WEBHOOK_SECRET");
  if (!secret.startsWith("whsec_")) {
    throw new Error("STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret");
  }
  return secret;
};

export const getStripeReturnUrl = () => {
  const raw = required("STRIPE_RETURN_URL");
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("STRIPE_RETURN_URL must use HTTPS outside local development");
  }
  return url;
};

export const buildStripeCheckoutReturnUrls = () => {
  const success = getStripeReturnUrl();
  success.searchParams.set("billing", "success");
  success.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

  const cancel = getStripeReturnUrl();
  cancel.searchParams.set("billing", "canceled");

  return {
    successUrl: success.toString().replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}"),
    cancelUrl: cancel.toString(),
    portalReturnUrl: getStripeReturnUrl().toString(),
  };
};

export const assertStripeObjectIsTestMode = (object: { livemode: boolean }, label: string) => {
  if (object.livemode) {
    throw new Error(`${label} belongs to Stripe live mode; test/live mixing is blocked`);
  }
};
