import Stripe from "stripe";

export const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-07-29.dahlia";
export type StripeEnvironment = "test" | "live";

export const getStripeEnvironment = (): StripeEnvironment => {
  const environment = process.env.STRIPE_PROVIDER_ENVIRONMENT?.trim() ?? "test";
  if (environment !== "test" && environment !== "live") throw new Error("Invalid Stripe provider environment");
  const appEnvironment = process.env.APP_ENV?.trim();
  if (appEnvironment === "production" && environment !== "live") throw new Error("Production cannot use test Stripe entitlements");
  if (environment === "live" && appEnvironment !== "production") throw new Error("Live Stripe is restricted to the production environment");
  return environment;
};

let stripeClient: Stripe | null = null;
let cachedSecretKey: string | null = null;

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

export const getStripeClient = () => {
  const secretKey = required("STRIPE_SECRET_KEY");
  const environment = getStripeEnvironment();
  if (!secretKey.startsWith(`sk_${environment}_`)) {
    throw new Error("Stripe secret key does not match the configured environment");
  }
  if (environment === "live" && process.env.STRIPE_LIVE_MODE_ENABLED !== "true") throw new Error("Stripe live activation is disabled");
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (publishableKey && !publishableKey.startsWith(`pk_${environment}_`)) throw new Error("Stripe publishable key environment mismatch");

  if (!stripeClient || cachedSecretKey !== secretKey) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION,
      appInfo: {
        name: "DARCi",
        version: process.env.npm_package_version ?? "1.0.0",
      },
      maxNetworkRetries: 2,
      timeout: 30_000,
    });
    cachedSecretKey = secretKey;
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

export const assertStripeObjectMatchesEnvironment = (object: { livemode: boolean }, label: string) => {
  if (typeof object.livemode !== "boolean" || object.livemode !== (getStripeEnvironment() === "live")) {
    throw new Error(`${label} environment mismatch; test/live mixing is blocked`);
  }
};
